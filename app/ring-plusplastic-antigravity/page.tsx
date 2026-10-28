'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useCreateStore } from 'leva'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { ringPlusplasticConfig } from '@/config'
import { Ring } from '@/components/canvas/Models'
import { GemEnvironment } from '@/components/canvas/gem/GemEnvironment'
import { PREVIEW_SCALE } from '@/components/canvas/gem/CutGemPreview'
import { GEM_PRESETS, METAL_PRESETS } from '@/components/canvas/gem/presets'
import { UnrealBloomComposer } from '@/components/canvas/UnrealBloomComposer'
import { FpsGuard, detectMobileDevice, tierDpr, type QualityTier } from '@/components/canvas/QualityTier'
import { JewelConfigPanel, type JewelSettings } from '@/components/dom/JewelConfigurator'
import { LoadingSpinner } from '@/components/dom/LoadingSpinner'

// ring-plusplastic 레이아웃(뷰어 + 참고 렌더 그리드, 모델 배치)에 Jewel_test(main.js·index.html)의
// 렌더링 설정과 설정 패널을 넣은 페이지. Leva 대신 Jewel_test 패널로 조작한다.
// 원본과 다른 점: 자동 품질 강등 감시가 3초 워밍업 + 3초 연속 저 FPS (원본 1.5초 — 다른 창이 GPU를 잠깐 나눠
// 써도 강등돼 화면이 바뀌어 보였다)

const config = ringPlusplasticConfig

const renderImages = [
  '/model/ring-260316/render/1.jpg',
  '/model/ring-260316/render/2.jpg',
  '/model/ring-260316/render/3.jpg',
]

// --- Jewel_test 렌더링 ---
const EXPOSURE = 1.15 // ACES 톤매핑 노출
const BLOOM_RADIUS = 0.18 // 좁은 반경 — facet 경계가 번지지 않게
const BLOOM_THRESHOLD = 2.4 // 핀라이트 피크만 번진다
const AUTO_ROTATE_SPEED = 1.25

// 카메라 — ring-plusplastic이 참고 렌더 시점으로 옮겨 가기 전의 구도를 유지
const CAMERA_POSITION: [number, number, number] = [6, 8, 6]
const ORBIT_TARGET: [number, number, number] = [0, 0, 0]
const FOV = 30

// 바닥 글로 — 원본 크기(18)를 이 레이아웃 단위로. 원본 링 지름 4.4 ≈ 이 모델 지름 1.43, 원본 컷 뷰 스톤 배율 1.55 ≈ 0.8
const RING_UNIT = 0.07 / 0.215
const CUT_UNIT = PREVIEW_SCALE / 1.55
const FLOOR_GLOW = {
  // 링 바닥(모델 바운딩 최저점 -0.9) 바로 아래
  ring: { y: -0.93, size: 18 * RING_UNIT },
  cut: { y: -2.2 * CUT_UNIT, size: 18 * CUT_UNIT },
}
const FLOOR_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]

// Ring 컨트롤 초기값 — 플래티넘·화이트 다이아·보조석 값. 패널에서 바꾸는 값은 로드 뒤 Leva store로 덮어쓴다
const METAL_DEFAULTS = {
  preset: 'platinum',
  color: METAL_PRESETS.platinum.color,
  roughness: METAL_PRESETS.platinum.roughness,
  metalness: METAL_PRESETS.platinum.metalness,
  clearcoat: METAL_PRESETS.platinum.clearcoat,
  clearcoatRoughness: 0.05,
  brightness: 1,
  envMapIntensity: 1.3,
} as const
// 원본 링은 금속 재질 하나 — 프롱도 밴드 재질
const PRONG_DEFAULTS = { enabled: false }
const DIAMOND_DEFAULTS = {
  preset: 'diamond',
  color: GEM_PRESETS.diamond.color,
  ior: GEM_PRESETS.diamond.ior,
  aberrationStrength: GEM_PRESETS.diamond.dispersion,
  absorption: GEM_PRESETS.diamond.absorption,
  bounces: 5,
  dispersionMode: 2,
  fresnelBias: 0.04,
  sparkle: 0.45,
  envMapIntensity: 1.4,
  // 보조석: 3회 반사, 광선 1개 + 탈출 시 RGB 오프셋, 픽셀당 광선 1개
  paveBounces: 3,
  paveDispersionMode: 0,
  paveSamples: 1,
  paveEnvBlur: 0,
  // PBR 비교 재질
  transmission: 1,
  thickness: 1.6,
  roughness: 0,
  iridescence: 0,
  attenuationColor: '#ffffff',
  attenuationDistance: 1,
  flatShading: true,
} as const

const INITIAL_SETTINGS: JewelSettings = {
  tierSetting: 'auto',
  view: 'ring',
  gemPreset: 'diamond',
  metalPreset: 'platinum',
  envPreset: 'studio_luxury',
  ior: GEM_PRESETS.diamond.ior,
  dispersion: GEM_PRESETS.diamond.dispersion,
  bounces: 5,
  envRotation: 0,
  bloomStrength: 0.12,
  autoRotate: true,
  comparePbr: false,
}

const detectTier = (): QualityTier => (detectMobileDevice() ? 'mobile' : 'desktop')

/** 바닥 그림자 판 — 중심이 살짝 푸른 방사형 어둠 */
function FloorGlow({ y, size }: { y: number; size: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { opacity: { value: 0.55 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv * 2.0 - 1.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform float opacity;
          void main() {
            float dist = length(vUv);
            float radial = smoothstep(0.45, 0.0, dist);
            vec3 glow = vec3(0.10, 0.12, 0.18) * smoothstep(0.18, 0.0, dist);
            gl_FragColor = vec4(glow, radial * opacity);
          }
        `,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh rotation={FLOOR_ROTATION} position={[0, y, 0]} scale={size} material={material}>
      <planeGeometry />
    </mesh>
  )
}

export default function Page() {
  const [settings, setSettings] = useState(INITIAL_SETTINGS)
  const [ringReady, setRingReady] = useState(false)
  const handleRingLoaded = useCallback(() => setRingReady(true), [])

  // 렌더링 품질 프로필 — 프로필이 정해질 때마다 센터석 반사 횟수도 프로필 기본값으로
  const [activeTier, setActiveTier] = useState<QualityTier>('desktop')
  const activeTierRef = useRef(activeTier)
  activeTierRef.current = activeTier
  const applyTier = useCallback((tier: QualityTier) => {
    setActiveTier(tier)
    setSettings((prev) => ({ ...prev, bounces: tier === 'mobile' ? 4 : 5 }))
  }, [])

  useEffect(() => applyTier(detectTier()), [applyTier])

  // 자동 감지면 창 크기가 바뀔 때 다시 판정 (저 FPS로 강등된 상태도 여기서 풀린다)
  useEffect(() => {
    if (settings.tierSetting !== 'auto') return
    const handleResize = () => {
      const tier = detectTier()
      if (tier !== activeTierRef.current) applyTier(tier)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [settings.tierSetting, applyTier])

  const handleChange = useCallback(
    (patch: Partial<JewelSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }))
      if (patch.tierSetting) applyTier(patch.tierSetting === 'auto' ? detectTier() : patch.tierSetting)
    },
    [applyTier],
  )

  const fpsRef = useRef(60)
  const handleLowFps = useCallback(() => applyTier('mobile'), [applyTier])

  // 모바일 프로필: 드래그 중엔 렌더 배율을 1.05로 낮췄다가 손을 뗀 뒤 180ms 후 복원
  const [interacting, setInteracting] = useState(false)
  const interactionTimeout = useRef<number>()
  const handleControlsStart = useCallback(() => {
    if (activeTierRef.current !== 'mobile') return
    window.clearTimeout(interactionTimeout.current)
    setInteracting(true)
  }, [])
  const handleControlsEnd = useCallback(() => {
    if (activeTierRef.current !== 'mobile') return
    window.clearTimeout(interactionTimeout.current)
    interactionTimeout.current = window.setTimeout(() => setInteracting(false), 180)
  }, [])

  const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const dpr = tierDpr(activeTier, Math.min(deviceDpr, 2), interacting)
  // MSAA는 시작 시 기기 판정으로 정하고 이후 프로필이 바뀌어도 그대로 둔다
  const [msaaSamples] = useState(() => (typeof window !== 'undefined' && detectMobileDevice() ? 2 : 4))

  // 패널 값 → Ring(Leva store). 로드 전엔 store에 입력이 없어 로드 완료 뒤부터 반영 (그 전 변경도 이때 한꺼번에)
  const ringStore = useCreateStore()
  useEffect(() => {
    if (!ringReady) return
    const metal = METAL_PRESETS[settings.metalPreset]
    const gem = GEM_PRESETS[settings.gemPreset]
    ringStore.set(
      {
        'Metal.color': metal.color,
        'Metal.roughness': metal.roughness,
        'Metal.metalness': metal.metalness,
        'Metal.clearcoat': metal.clearcoat,
        'Diamond.color': gem.color,
        'Diamond.absorption': gem.absorption,
        'Diamond.ior': settings.ior,
        'Diamond.aberration': settings.dispersion,
        'Diamond.bounces': settings.bounces,
        // 데스크톱 6밴드 스펙트럼, 모바일 R·G·B 3광선
        'Diamond.quality': activeTier === 'mobile' ? 1 : 2,
      },
      false,
    )
  }, [
    ringStore,
    ringReady,
    settings.metalPreset,
    settings.gemPreset,
    settings.ior,
    settings.dispersion,
    settings.bounces,
    activeTier,
  ])

  // 라이트 회전은 보석 환경만 돌린다. 원본은 샘플 방향을 Ry(+각)로 돌리고 GemEnvironment는 Euler 부호를 뒤집어
  // 샘플하므로 음수로 넘긴다
  const gemRotation = useMemo(
    () => new THREE.Euler(0, -THREE.MathUtils.degToRad(settings.envRotation), 0),
    [settings.envRotation],
  )

  const controlsRef = useRef<OrbitControlsImpl>(null)
  const handleResetCamera = useCallback(() => controlsRef.current?.reset(), [])

  const floorGlow = settings.view === 'ring' ? FLOOR_GLOW.ring : FLOOR_GLOW.cut

  return (
    <div className='min-h-screen w-full overflow-y-auto bg-white md:flex md:items-center md:justify-center md:overflow-hidden'>
      <div className='flex flex-col gap-2 p-2 md:grid md:w-[min(100vw,100vh)] md:grid-cols-2 md:gap-4 md:p-4'>
        <div className='relative aspect-square w-full bg-black'>
          {!ringReady && <LoadingSpinner message='Loading...' />}
          <Canvas
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMappingExposure: EXPOSURE }}
            dpr={dpr}
          >
            <FpsGuard
              fpsRef={fpsRef}
              onLowFps={settings.tierSetting === 'auto' && activeTier === 'desktop' ? handleLowFps : undefined}
            />
            <PerspectiveCamera makeDefault fov={FOV} position={CAMERA_POSITION} />
            <OrbitControls
              ref={controlsRef}
              target={ORBIT_TARGET}
              enableDamping
              dampingFactor={0.05}
              minDistance={4}
              maxDistance={5.4}
              enablePan={false}
              autoRotate={settings.autoRotate}
              autoRotateSpeed={AUTO_ROTATE_SPEED}
              onStart={handleControlsStart}
              onEnd={handleControlsEnd}
            />
            <GemEnvironment source={settings.envPreset} gemRotation={gemRotation} resolution={512}>
              <Suspense fallback={null}>
                <Ring
                  levaStore={ringStore}
                  modelPath={config.modelPath}
                  shadowTexturePath={config.shadowTexturePath}
                  shadowOpacity={0}
                  metalDefaults={METAL_DEFAULTS}
                  prongDefaults={PRONG_DEFAULTS}
                  diamondDefaults={DIAMOND_DEFAULTS}
                  transformDefaults={config.transform}
                  gemMaterial={settings.comparePbr ? 'physical' : 'refraction'}
                  view={settings.view}
                  onLoadComplete={handleRingLoaded}
                />
              </Suspense>
            </GemEnvironment>
            <FloorGlow y={floorGlow.y} size={floorGlow.size} />
            <UnrealBloomComposer
              samples={msaaSamples}
              strength={settings.bloomStrength}
              radius={BLOOM_RADIUS}
              threshold={BLOOM_THRESHOLD}
            />
          </Canvas>
        </div>

        {renderImages.map((src, index) => (
          <div key={index} className='relative aspect-square w-full bg-white'>
            <Image src={src} alt={`Render ${index + 1}`} fill className='object-contain' priority={index === 0} />
          </div>
        ))}
      </div>
      <JewelConfigPanel
        settings={settings}
        onChange={handleChange}
        activeTier={activeTier}
        fpsRef={fpsRef}
        onResetCamera={handleResetCamera}
      />
    </div>
  )
}
