'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Leva, useControls, button, monitor } from 'leva'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Caustics } from '@react-three/drei'
import { EffectComposer, SMAA, Bloom, BrightnessContrast, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { ringPlusplasticConfig, type ViewConfig } from '@/config'
import { TemporalSmooth } from '@/components/canvas/TemporalSmooth'
import { BackgroundComposite } from '@/components/canvas/BackgroundComposite'
import { LoadingSpinner } from '@/components/dom/LoadingSpinner'
import { GemEnvironment } from '@/components/canvas/gem/GemEnvironment'
import type { GemCut } from '@/components/canvas/gem/cutGeometry'
import {
  FpsGuard,
  detectMobileDevice,
  qualityTierLabel,
  qualityTierOptions,
  tierDpr,
  tierMultisampling,
  type QualityTier,
  type QualityTierSetting,
} from '@/components/canvas/QualityTier'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

// Ring 컴포넌트 동적 로드
const Ring = dynamic(() => import('@/components/canvas/Models').then((mod) => mod.Ring), { ssr: false })

const config = ringPlusplasticConfig

// 스튜디오 프리셋(절차적, 보석용 고대비) + HDR 파일 — GemEnvironment가 이름/URL로 구분
const envOptions = {
  'White Metal': 'white_metal',
  'White Gem': 'white_gem',
  'Studio Luxury': 'studio_luxury',
  'Warm Boutique': 'warm_boutique',
  'Cyber Neon': 'cyber_neon',
  'HDR 1': '/model/ring-260316/ring-plusplastic-800.hdr',
  'HDR 2': '/model/ring-260316/ring-plusplastic2-800.hdr',
  'HDR 3': '/model/ring-260316/ring-plusplastic3-800.hdr',
}

// Jewel_test 마운트 & 컷 뷰
const viewOptions: Record<string, 'ring' | GemCut> = {
  '솔리테어 링': 'ring',
  '브릴리언트 컷': 'brilliant',
  '에메랄드 컷': 'emerald',
}

// 후처리 톤매핑 곡선
type ToneMappingKey = NonNullable<ViewConfig['toneMapping']>
const toneMappingOptions: Record<string, ToneMappingKey> = { ACES: 'aces', Neutral: 'neutral', Linear: 'linear' }
const toneMappingModes: Record<ToneMappingKey, ToneMappingMode> = {
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
  linear: ToneMappingMode.LINEAR,
}

// 참고 렌더 — 누르면 뷰어가 그 구도(카메라·조명)로 바뀐다
const referenceViews = config.referenceViews ?? []

export default function Page() {
  const [isModelLoading, setIsModelLoading] = useState(true)
  const [uploadedModels, setUploadedModels] = useState<Record<string, string>>({})
  const [uploadedHdrs, setUploadedHdrs] = useState<Record<string, string>>({})
  const modelInputRef = useRef<HTMLInputElement>(null)
  const hdrInputRef = useRef<HTMLInputElement>(null)

  const handleModelLoadComplete = useCallback(() => {
    setIsModelLoading(false)
  }, [])

  const modelOptions = useMemo(() => ({
    'Default': config.modelPath,
    ...uploadedModels,
  }), [uploadedModels])

  const envOptionsFull = useMemo(() => ({
    ...envOptions,
    ...uploadedHdrs,
  }), [uploadedHdrs])

  const pendingModelUrl = useRef<string | null>(null)
  const pendingHdrUrl = useRef<string | null>(null)
  // 생성한 blob URL 전체를 ref에 누적 — 언마운트 시 일괄 revoke (state 클로저는 stale해서 못 씀)
  const createdBlobUrls = useRef<string[]>([])

  const handleModelFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      createdBlobUrls.current.push(url)
      pendingModelUrl.current = url
      setUploadedModels((prev) => ({ ...prev, [file.name]: url }))
    }
    e.target.value = ''
  }, [])

  const handleHdrFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      createdBlobUrls.current.push(url)
      pendingHdrUrl.current = url
      setUploadedHdrs((prev) => ({ ...prev, [file.name]: url }))
    }
    e.target.value = ''
  }, [])

  useEffect(() => {
    const urls = createdBlobUrls.current
    return () => {
      urls.forEach(URL.revokeObjectURL)
    }
  }, [])

  // File 컨트롤
  const defaultEnvSource = config.light.studioPreset ?? config.hdrPath
  const defaultGemEnvSource = config.light.gemStudioPreset ?? defaultEnvSource
  const [fileValues, setFileControls] = useControls('File', () => ({
    '3dm 업로드': button(() => modelInputRef.current?.click()),
    modelFile: { value: config.modelPath, options: modelOptions, label: '3dm 모델' },
    'HDR 업로드': button(() => hdrInputRef.current?.click()),
    envSource: { value: defaultEnvSource, options: envOptionsFull, label: '환경맵' },
    // 보석 레이트레이서만 비추는 환경 — 환경맵과 같은 걸 고르면 공유
    gemEnvSource: { value: defaultGemEnvSource, options: envOptionsFull, label: '보석 환경맵' },
  }), [modelOptions, envOptionsFull]) as any
  const modelFile: string = fileValues?.modelFile ?? config.modelPath
  const envSource: string = fileValues?.envSource ?? defaultEnvSource
  const gemEnvSource: string = fileValues?.gemEnvSource ?? defaultGemEnvSource

  useEffect(() => {
    if (pendingModelUrl.current && setFileControls) {
      setFileControls({ modelFile: pendingModelUrl.current })
      pendingModelUrl.current = null
    }
  }, [modelOptions, setFileControls])

  useEffect(() => {
    if (pendingHdrUrl.current && setFileControls) {
      setFileControls({ envSource: pendingHdrUrl.current })
      pendingHdrUrl.current = null
    }
  }, [envOptionsFull, setFileControls])

  const prevModelFileRef = useRef(modelFile)
  useEffect(() => {
    if (modelFile !== prevModelFileRef.current) {
      prevModelFileRef.current = modelFile
      setIsModelLoading(true)
    }
  }, [modelFile])

  const controlsRef = useRef<OrbitControlsImpl>(null)

  // View 컨트롤
  const [{ cut, comparePbr, fov, backgroundColor, vignette, autoRotate, renderScale, temporalSmoothing, exposure, toneMapping }, setView] =
    useControls('View', () => ({
      // Jewel_test 마운트 & 컷: 모델 대신 이상적인 컷 하나만 볼 수 있다
      cut: { value: 'ring' as 'ring' | GemCut, options: viewOptions, label: '뷰' },
      // 일반 PBR(MeshPhysicalMaterial, 내부 전반사 없음) vs BVH 레이트레이싱 비교
      comparePbr: { value: false, label: 'PBR 비교' },
      '카메라 초기화': button(() => controlsRef.current?.reset()),
      fov: { value: config.view.fov, min: 10, max: 120, step: 1 },
      // 톤매핑 노출 — 보석의 HDR 하이라이트를 자르지 않고 압축
      exposure: { value: config.view.exposure ?? 1, min: 0.1, max: 3, step: 0.01 },
      toneMapping: { value: config.view.toneMapping ?? 'aces', options: toneMappingOptions, label: 'tone mapping' },
      backgroundColor: { value: config.view.backgroundColor || '#ffffff' },
      vignette: { value: config.view.backgroundVignette ?? 0, min: 0, max: 0.3, step: 0.001 },
      autoRotate: { value: true, label: 'auto rotate' },
      // SSAA: 픽셀당 샘플 수를 늘려 작은 보석의 facet 단위 자글거림을 평균으로 눌러줌
      renderScale: { value: config.view.dpr ?? 2, options: { '1.5x': 1.5, '2x': 2, '3x': 3, '4x': 4 }, label: 'renderScale (SSAA)' },
      // 시간축 평균 — 프레임 간 popping을 페이드로. 0=끔, 높을수록 안정 ↑/잔상 ↑
      temporalSmoothing: {
        value: config.view.temporalSmoothing ?? 0,
        min: 0,
        max: 0.95,
        step: 0.01,
        label: 'temporal smooth',
      },
    }))

  // 렌더링 품질 프로필 — 자동이면 기기 판정만. Jewel_test의 저 FPS 자동 강등은 끈다: 로드 직후 보석이
  // 다른 품질로 바뀌어 보였다(실측: 모델 표시 1.2초 → 강등 6.4초, 분산 6→3채널·반사 5→4회·pavé 샘플 4→1)
  const [activeTier, setActiveTier] = useState<QualityTier>('desktop')
  const activeTierRef = useRef(activeTier)
  activeTierRef.current = activeTier
  const fpsRef = useRef(0)
  const { tierSetting } = useControls('Quality', {
    tierSetting: { value: 'auto' as QualityTierSetting, options: qualityTierOptions, label: '품질 프로필' },
    status: monitor(() => `${qualityTierLabel[activeTierRef.current]} · ${fpsRef.current} FPS`, { interval: 500 }),
  })

  useEffect(() => {
    if (tierSetting !== 'auto') {
      setActiveTier(tierSetting)
      return
    }
    const detect = () => setActiveTier(detectMobileDevice() ? 'mobile' : 'desktop')
    detect()
    window.addEventListener('resize', detect)
    return () => window.removeEventListener('resize', detect)
  }, [tierSetting])

  // 모바일 프로필: 드래그 중엔 렌더 배율을 낮췄다가 손을 뗀 뒤 180ms 후 복원
  const [interacting, setInteracting] = useState(false)
  const interactionTimeout = useRef<number>()
  const handleControlsStart = useCallback(() => {
    window.clearTimeout(interactionTimeout.current)
    if (activeTierRef.current === 'mobile') setInteracting(true)
  }, [])
  const handleControlsEnd = useCallback(() => {
    window.clearTimeout(interactionTimeout.current)
    interactionTimeout.current = window.setTimeout(() => setInteracting(false), 180)
  }, [])

  // Light 컨트롤
  const [{ environmentIntensity, envResolution, envRotX, envRotY, envRotZ, ambientLightIntensity, directionalLightIntensity }, setLight] =
    useControls('Light', () => ({
      envResolution: { value: 512, options: { '256': 256, '512': 512, '1024': 1024 }, label: 'gem env res' },
      environmentIntensity: { value: config.light.environmentIntensity, min: 0, max: 2, step: 0.01 },
      envRotX: { value: config.light.envRotX || 0, min: 0, max: 360, step: 1 },
      envRotY: { value: config.light.envRotY || 0, min: 0, max: 360, step: 1 },
      envRotZ: { value: config.light.envRotZ || 0, min: 0, max: 360, step: 1 },
      ambientLightIntensity: { value: config.light.ambientLightIntensity || 0, min: 0, max: 2, step: 0.01 },
      directionalLightIntensity: { value: config.light.directionalLightIntensity ?? 0.3, min: 0, max: 2, step: 0.01 },
    }))

  // 참고 렌더 구도 — OrbitControls는 생성 시점의 camera.up을 궤도 축으로 삼으므로 up을 먼저 바꾸고 key로 다시 만든다
  const [referenceView, setReferenceView] = useState(0)
  const applyReferenceView = useCallback(
    (index: number) => {
      const view = referenceViews[index]
      const camera = controlsRef.current?.object
      if (!view || !camera) return
      camera.up.set(...view.cameraUp)
      camera.position.set(...view.cameraPosition)
      setReferenceView(index)
      setView({ autoRotate: false })
      setLight({ envRotX: view.envRotation[0], envRotY: view.envRotation[1], envRotZ: view.envRotation[2] })
    },
    [setView, setLight],
  )

  // Bloom 컨트롤 (CodeSandbox 단일 Bloom)
  const { bloomEnabled, bloomIntensity, bloomThreshold, bloomSmoothing, bloomLevels, bloomRadius, bloomMipmap } =
    useControls('Bloom', {
      bloomEnabled: { value: config.bloom.enabled, label: 'enabled' },
      bloomIntensity: { value: config.bloom.intensity, min: 0, max: 5, step: 0.01, label: 'intensity' },
      bloomThreshold: { value: config.bloom.luminanceThreshold, min: 0, max: 5, step: 0.01, label: 'threshold' },
      bloomSmoothing: { value: config.bloom.luminanceSmoothing, min: 0, max: 2, step: 0.01, label: 'smoothing' },
      bloomLevels: { value: config.bloom.levels ?? 9, min: 1, max: 10, step: 1, label: 'levels' },
      bloomRadius: { value: config.bloom.radius, min: 0, max: 2, step: 0.01, label: 'radius' },
      bloomMipmap: { value: true, label: 'mipmapBlur' },
    })

  // Grade 컨트롤 — 오프라인 렌더의 대비(깊은 다크 + 블로운 하이라이트)에 근접시키는 후처리
  const { gradeContrast, gradeBrightness } = useControls('Grade', {
    gradeContrast: { value: config.grade?.contrast ?? 0, min: -0.5, max: 0.5, step: 0.005, label: 'contrast' },
    gradeBrightness: { value: config.grade?.brightness ?? 0, min: -0.3, max: 0.3, step: 0.005, label: 'brightness' },
  })

  // Caustics 컨트롤
  const causticsDefaults = config.caustics!
  const {
    causticsEnabled,
    causticsColor,
    causticsIor,
    causticsBacksideIOR,
    causticsWorldRadius,
    causticsIntensity,
    causticsPosY,
    causticsLightX,
    causticsLightY,
    causticsLightZ,
  } = useControls('Caustics', {
    causticsEnabled: { value: causticsDefaults.enabled, label: 'enabled' },
    causticsColor: { value: causticsDefaults.color, label: 'color' },
    causticsIor: { value: causticsDefaults.ior, min: 1.0, max: 3.0, step: 0.01, label: 'ior' },
    causticsBacksideIOR: { value: causticsDefaults.backfaceIor, min: 1.0, max: 3.0, step: 0.01, label: 'backsideIOR' },
    causticsWorldRadius: { value: causticsDefaults.worldRadius, min: 0.01, max: 1.0, step: 0.01, label: 'worldRadius' },
    causticsIntensity: { value: causticsDefaults.intensity, min: 0, max: 1, step: 0.01, label: 'intensity' },
    causticsPosY: { value: -0.5, min: -5, max: 5, step: 0.1, label: 'positionY' },
    causticsLightX: { value: causticsDefaults.lightSource[0], min: -20, max: 20, step: 0.5, label: 'lightSrc X' },
    causticsLightY: { value: causticsDefaults.lightSource[1], min: -20, max: 20, step: 0.5, label: 'lightSrc Y' },
    causticsLightZ: { value: causticsDefaults.lightSource[2], min: -20, max: 20, step: 0.5, label: 'lightSrc Z' },
  })

  // 환경맵 회전
  const envRotation = useMemo(
    () =>
      new THREE.Euler(
        THREE.MathUtils.degToRad(envRotX),
        THREE.MathUtils.degToRad(envRotY),
        THREE.MathUtils.degToRad(envRotZ),
      ),
    [envRotX, envRotY, envRotZ],
  )

  return (
    <>
      <div className='min-h-screen w-full overflow-y-auto bg-white md:flex md:items-center md:justify-center md:overflow-hidden'>
        <Leva />
        <input ref={modelInputRef} type='file' accept='.3dm' hidden onChange={handleModelFile} />
        <input ref={hdrInputRef} type='file' accept='.hdr,.exr' hidden onChange={handleHdrFile} />
        <div className='flex flex-col gap-2 p-2 md:grid md:grid-cols-2 md:gap-4 md:p-4 md:w-[min(100vw,100vh)]'>
          <div className='relative w-full aspect-square bg-white'>
            {isModelLoading && <LoadingSpinner message='Loading...' />}
            {/* antialias=false: EffectComposer(MSAA 4)+SMAA가 AA를 담당 — 캔버스 자체 MSAA는
                중복이며 TemporalSmooth의 화면 복사(resolve) 비용만 키움 */}
            <Canvas
              gl={{ antialias: false, toneMappingExposure: exposure }}
              dpr={tierDpr(activeTier, renderScale, interacting)}
              shadows
            >
              <FpsGuard fpsRef={fpsRef} />
              <ambientLight intensity={ambientLightIntensity} />
              <directionalLight position={[50, 50, 50]} intensity={directionalLightIntensity} />
              <PerspectiveCamera makeDefault fov={fov} position={config.cameraPosition} />
              <OrbitControls
                key={referenceView}
                ref={controlsRef}
                onStart={handleControlsStart}
                onEnd={handleControlsEnd}
                enableDamping
                autoRotate={autoRotate}
                autoRotateSpeed={0.3}
                target={config.orbitTarget}
                minDistance={6}
                // 참고 렌더 2·3번 구도가 거리 8.6
                maxDistance={9}
                enablePan={false}
              />
              <GemEnvironment
                source={envSource}
                gemSource={gemEnvSource}
                intensity={environmentIntensity}
                rotation={envRotation}
                resolution={envResolution}
              >
                <Suspense fallback={null}>
                  {(() => {
                    const ring = (
                      <Ring
                        key={modelFile}
                        modelPath={modelFile}
                        shadowTexturePath={config.shadowTexturePath}
                        shadowOpacity={config.shadowOpacity}
                        // 그림자 판은 똑바로 선 반지(기본 구도)의 바닥 — 눕힌 구도에선 옆에 선 판으로 보인다
                        showShadow={referenceView === 0}
                        metalDefaults={config.metal}
                        prongDefaults={config.prong}
                        diamondDefaults={config.diamond}
                        transformDefaults={config.transform}
                        gemMaterial={comparePbr ? 'physical' : 'refraction'}
                        view={cut}
                        qualityTier={activeTier}
                        onLoadComplete={handleModelLoadComplete}
                      />
                    )
                    return causticsEnabled ? (
                      <Caustics
                        backside
                        causticsOnly={false}
                        color={causticsColor}
                        position={[0, causticsPosY, 0]}
                        lightSource={[causticsLightX, causticsLightY, causticsLightZ]}
                        worldRadius={causticsWorldRadius}
                        ior={causticsIor}
                        backsideIOR={causticsBacksideIOR}
                        intensity={causticsIntensity}
                      >
                        {ring}
                      </Caustics>
                    ) : (
                      ring
                    )
                  })()}
                </Suspense>
              </GemEnvironment>
              <EffectComposer multisampling={tierMultisampling(activeTier)} enableNormalPass={false}>
                <SMAA />
                <Bloom
                  intensity={bloomEnabled ? bloomIntensity : 0}
                  luminanceThreshold={bloomThreshold}
                  luminanceSmoothing={bloomSmoothing}
                  levels={bloomLevels}
                  radius={bloomRadius}
                  mipmapBlur={bloomMipmap}
                />
                {/* 렌더 타깃에 그리는 동안 three는 재질 톤매핑을 끄므로 여기서 프레임 전체에 적용 */}
                <ToneMapping mode={toneMappingModes[toneMapping]} />
                <BrightnessContrast brightness={gradeBrightness} contrast={gradeContrast} />
                {/* 배경은 톤매핑 뒤에 합성 — 씬 배경으로 두면 ACES가 흰색을 회색으로 누름 */}
                <BackgroundComposite color={backgroundColor} vignette={vignette} />
                <TemporalSmooth smoothing={temporalSmoothing} />
              </EffectComposer>
            </Canvas>
          </div>

          {referenceViews.map((view, index) => (
            <button
              key={view.image}
              type='button'
              title='이 구도로 보기'
              onClick={() => applyReferenceView(index)}
              className={`relative w-full aspect-square bg-white outline-offset-[-3px] ${index === referenceView ? 'outline outline-2 outline-neutral-400' : ''}`}
            >
              <Image src={view.image} alt={`Render ${index + 1}`} fill className='object-contain' priority={index === 0} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
