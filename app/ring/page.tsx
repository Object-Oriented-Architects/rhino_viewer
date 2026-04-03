'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback, useMemo, useEffect, useContext } from 'react'
import Image from 'next/image'
import { Leva, useControls } from 'leva'
import { Canvas } from '@react-three/fiber'
import { useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, SoftShadows } from '@react-three/drei'
import { EffectComposer, Bloom, SMAA, SSAO, EffectComposerContext } from '@react-three/postprocessing'
import * as THREE from 'three'
import { ringConfig } from '@/config'

// Ring 컴포넌트 동적 로드
const Ring = dynamic(() => import('@/components/canvas/Models').then((mod) => mod.Ring), { ssr: false })

// EffectComposer의 모든 패스에서 gem 메시를 제외하고,
// 포스트프로세싱 이후 gem을 별도로 렌더링하는 컴포넌트
function GemExcluder() {
  const { composer, normalPass } = useContext(EffectComposerContext)
  const { scene, camera, gl } = useThree()

  useEffect(() => {
    if (!composer) return

    const passes = (composer as any).passes as any[]
    const overrides = new Map<any, Function>()

    for (const pass of passes) {
      const original = pass.render.bind(pass)
      overrides.set(pass, original)

      pass.render = (
        renderer: THREE.WebGLRenderer,
        inputBuffer: any,
        outputBuffer: any,
        deltaTime?: number,
        stencilTest?: boolean,
      ) => {
        const hidden: THREE.Object3D[] = []
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.userData.isGem && obj.visible) {
            obj.visible = false
            hidden.push(obj)
          }
        })

        original(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest)

        hidden.forEach((m) => {
          m.visible = true
        })
      }
    }

    return () => {
      for (const [pass, original] of overrides) {
        pass.render = original
      }
    }
  }, [composer, normalPass, scene])

  // EffectComposer 이후 gem만 별도 렌더링 (priority 2 = EffectComposer 뒤에 실행)
  useFrame(() => {
    const prevBackground = scene.background
    scene.background = null
    gl.autoClear = false
    gl.clearDepth()

    const ctx = gl.getContext()

    // 1단계: 금속만 depth-only 렌더 (color 쓰기 안 함) → depth buffer에 금속 깊이 기록
    const gemMeshes: THREE.Object3D[] = []
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.isGem && obj.visible) {
        obj.visible = false
        gemMeshes.push(obj)
      }
    })
    ctx.colorMask(false, false, false, false)
    gl.render(scene, camera)
    ctx.colorMask(true, true, true, true)

    // 2단계: gem만 렌더 (depth test ON → 금속 뒤의 gem은 가려짐)
    const nonGemMeshes: THREE.Object3D[] = []
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !obj.userData.isGem && obj.visible) {
        obj.visible = false
        nonGemMeshes.push(obj)
      }
    })
    gemMeshes.forEach((m) => {
      m.visible = true
    })
    gl.render(scene, camera)

    // 복원
    scene.background = prevBackground
    gl.autoClear = true
    nonGemMeshes.forEach((m) => {
      m.visible = true
    })
  }, 2)

  return null
}

// 로딩 스피너 컴포넌트
const LoadingSpinner = ({ message }: { message: string }) => (
  <div className='absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 z-50'>
    <svg className='-ml-1 mr-3 size-8 animate-spin text-white' fill='none' viewBox='0 0 24 24'>
      <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
      <path
        className='opacity-75'
        fill='currentColor'
        d='M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
      />
    </svg>
    <p className='mt-4 text-white text-lg'>{message}</p>
  </div>
)

const config = ringConfig

const renderImages = [
  '/model/ring-260203-angle/render/render01.jpg',
  '/model/ring-260203-angle/render/render02.jpg',
  '/model/ring-260203-angle/render/render03.jpg',
]

export default function Page() {
  const [isModelLoading, setIsModelLoading] = useState(true)

  const handleModelLoadComplete = useCallback(() => {
    setIsModelLoading(false)
  }, [])

  // View 컨트롤
  const { fov, backgroundColor } = useControls('View', {
    fov: { value: config.view.fov, min: 10, max: 120, step: 1 },
    backgroundColor: { value: config.view.backgroundColor || '#ffffff' },
  })

  // Light 컨트롤
  const { environmentIntensity, envRotX, envRotY, envRotZ, ambientLightIntensity, directionalLightIntensity } =
    useControls('Light', {
      environmentIntensity: { value: config.light.environmentIntensity, min: 0, max: 2, step: 0.01 },
      envRotX: { value: config.light.envRotX || 0, min: 0, max: 360, step: 1 },
      envRotY: { value: config.light.envRotY || 0, min: 0, max: 360, step: 1 },
      envRotZ: { value: config.light.envRotZ || 0, min: 0, max: 360, step: 1 },
      ambientLightIntensity: { value: config.light.ambientLightIntensity || 0, min: 0, max: 2, step: 0.01 },
      directionalLightIntensity: { value: config.light.directionalLightIntensity || 0.3, min: 0, max: 2, step: 0.01 },
    })

  // AO 컨트롤
  const {
    aoEnabled,
    aoIntensity,
    aoRadius: aoRadiusVal,
    aoSamples: aoSamplesVal,
    aoRings,
    aoDistanceThreshold,
    aoDistanceFalloff,
    aoRangeThreshold,
    aoRangeFalloff,
    aoBias,
  } = useControls('AO', {
    aoEnabled: { value: true, label: 'enabled' },
    aoIntensity: { value: 3, min: 0, max: 20, step: 0.1, label: 'intensity' },
    aoRadius: { value: 0.5, min: 0, max: 5, step: 0.01, label: 'radius' },
    aoSamples: { value: 30, min: 1, max: 64, step: 1, label: 'samples' },
    aoRings: { value: 4, min: 1, max: 16, step: 1, label: 'rings' },
    aoDistanceThreshold: { value: 0.2, min: 0, max: 5, step: 0.01, label: 'distanceThreshold' },
    aoDistanceFalloff: { value: 0.1, min: 0, max: 5, step: 0.01, label: 'distanceFalloff' },
    aoRangeThreshold: { value: 0.5, min: 0, max: 2, step: 0.01, label: 'rangeThreshold' },
    aoRangeFalloff: { value: 0.1, min: 0, max: 2, step: 0.01, label: 'rangeFalloff' },
    aoBias: { value: 0.01, min: 0, max: 1, step: 0.01, label: 'bias' },
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
      {/* PC: 2x2 그리드 / 모바일: 세로 스크롤 */}
      <div className='min-h-screen w-full overflow-y-auto bg-white md:flex md:items-center md:justify-center md:overflow-hidden'>
        <Leva hidden />
        <div className='flex flex-col gap-2 p-2 md:grid md:grid-cols-2 md:gap-4 md:p-4 md:w-[min(100vw,100vh)]'>
          {/* Three.js 영역 - 직접 Canvas 사용 */}
          <div className='relative w-full aspect-square bg-white'>
            {isModelLoading && <LoadingSpinner message='Loading...' />}
            <Canvas
              gl={{ antialias: true }}
              dpr={[1, 2]}
              onCreated={(state) => {
                state.gl.toneMapping = THREE.AgXToneMapping
                state.gl.toneMappingExposure = 1.2
              }}
              shadows
            >
              <color attach='background' args={[backgroundColor]} />
              <SoftShadows />
              <Environment
                files={config.hdrPath}
                environmentIntensity={environmentIntensity}
                environmentRotation={envRotation}
              />
              <ambientLight intensity={ambientLightIntensity} />
              <directionalLight position={[50, 50, 50]} intensity={directionalLightIntensity} />
              <PerspectiveCamera makeDefault fov={fov} position={config.cameraPosition} />
              <OrbitControls
                enableDamping
                autoRotate
                autoRotateSpeed={1}
                target={config.orbitTarget}
                minDistance={4}
                maxDistance={5.4}
                enablePan={false}
              />
              <Suspense fallback={null}>
                <Ring
                  modelPath={config.modelPath}
                  shadowTexturePath={config.shadowTexturePath}
                  metalDefaults={config.metal}
                  prongDefaults={config.prong}
                  diamondDefaults={config.diamond}
                  transformDefaults={config.transform}
                  onLoadComplete={handleModelLoadComplete}
                />
              </Suspense>
              <EffectComposer multisampling={0} enableNormalPass>
                <GemExcluder />
                <SSAO
                  key={`ssao-${aoEnabled}-${aoIntensity}-${aoRadiusVal}-${aoSamplesVal}-${aoRings}-${aoDistanceThreshold}-${aoDistanceFalloff}-${aoRangeThreshold}-${aoRangeFalloff}-${aoBias}`}
                  samples={aoSamplesVal}
                  rings={aoRings}
                  distanceThreshold={aoDistanceThreshold}
                  distanceFalloff={aoDistanceFalloff}
                  rangeThreshold={aoRangeThreshold}
                  rangeFalloff={aoRangeFalloff}
                  bias={aoBias}
                  radius={aoRadiusVal}
                  intensity={aoEnabled ? aoIntensity : 0}
                  luminanceInfluence={0}
                  depthAwareUpsampling
                />
                <SMAA />
                <Bloom
                  intensity={config.bloom.enabled ? config.bloom.intensity : 0}
                  luminanceThreshold={config.bloom.luminanceThreshold}
                  luminanceSmoothing={config.bloom.luminanceSmoothing}
                  radius={config.bloom.radius}
                  levels={9}
                  mipmapBlur
                />
              </EffectComposer>
            </Canvas>
          </div>

          {/* 렌더링 이미지들 */}
          {renderImages.map((src, index) => (
            <div key={index} className='relative w-full aspect-square bg-white'>
              <Image src={src} alt={`Render ${index + 1}`} fill className='object-contain' priority={index === 0} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
