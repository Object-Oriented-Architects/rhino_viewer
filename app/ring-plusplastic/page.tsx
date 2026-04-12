'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback, useMemo, useEffect, useContext, useRef } from 'react'
import Image from 'next/image'
import { Leva, useControls, button, levaStore } from 'leva'
import { Canvas, useLoader } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, SoftShadows } from '@react-three/drei'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EffectComposer, SMAA, SSAO, EffectComposerContext } from '@react-three/postprocessing'
import * as THREE from 'three'
import { ringPlusplasticConfig } from '@/config'
import { GemAccumulator } from '@/components/canvas/GemAccumulator'
import { ScreenBloom } from '@/components/canvas/ScreenBloom'

// blob URL은 확장자가 없어서 drei의 Environment가 로더를 판별 못 함
// RGBELoader로 직접 로드하여 map prop으로 전달
function BlobHdrEnvironment({ url, ...props }: { url: string } & Omit<React.ComponentProps<typeof Environment>, 'files' | 'map'>) {
  const texture = useLoader(RGBELoader, url)
  texture.mapping = THREE.EquirectangularReflectionMapping
  return <Environment map={texture} {...props} />
}

// Ring 컴포넌트 동적 로드
const Ring = dynamic(() => import('@/components/canvas/Models').then((mod) => mod.Ring), { ssr: false })

// EffectComposer의 모든 패스에서 gem 메시를 제외하고,
// 포스트프로세싱 이후 gem을 별도로 렌더링하는 컴포넌트
// EffectComposer 패스에서 gem을 제외하는 컴포넌트 (패스 패칭만 담당)
// gem 렌더링은 GemAccumulator가 별도로 처리
function GemExcluder() {
  const { composer, normalPass } = useContext(EffectComposerContext)
  const { scene } = useThree()

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

const config = ringPlusplasticConfig

const hdrOptions = {
  'HDR 1': '/model/ring-260316/ring-plusplastic-800.hdr',
  'HDR 2': '/model/ring-260316/ring-plusplastic2-800.hdr',
  'HDR 3': '/model/ring-260316/ring-plusplastic3-800.hdr',
}

const renderImages = [
  '/model/ring-260316/render/1.jpg',
  '/model/ring-260316/render/2.jpg',
  '/model/ring-260316/render/3.jpg',
]

export default function Page() {
  const [isModelLoading, setIsModelLoading] = useState(true)
  const [ringControlsVersion, setRingControlsVersion] = useState(0)
  const [uploadedModels, setUploadedModels] = useState<Record<string, string>>({})
  const [uploadedHdrs, setUploadedHdrs] = useState<Record<string, string>>({})
  const modelInputRef = useRef<HTMLInputElement>(null)
  const hdrInputRef = useRef<HTMLInputElement>(null)

  const handleModelLoadComplete = useCallback(() => {
    setIsModelLoading(false)
  }, [])

  const handleRingControlsChange = useCallback(() => {
    setRingControlsVersion((v) => v + 1)
  }, [])

  const modelOptions = useMemo(() => ({
    'Default': config.modelPath,
    ...uploadedModels,
  }), [uploadedModels])

  const hdrOptionsFull = useMemo(() => ({
    ...hdrOptions,
    ...uploadedHdrs,
  }), [uploadedHdrs])

  const pendingModelUrl = useRef<string | null>(null)
  const pendingHdrUrl = useRef<string | null>(null)

  const handleModelFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      pendingModelUrl.current = url
      setUploadedModels((prev) => ({ ...prev, [file.name]: url }))
    }
    e.target.value = ''
  }, [])

  const handleHdrFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      pendingHdrUrl.current = url
      setUploadedHdrs((prev) => ({ ...prev, [file.name]: url }))
    }
    e.target.value = ''
  }, [])

  useEffect(() => {
    return () => {
      Object.values(uploadedModels).forEach(URL.revokeObjectURL)
      Object.values(uploadedHdrs).forEach(URL.revokeObjectURL)
    }
  }, [])

  // File 컨트롤 (최상단) — function form은 [values, set, get] 튜플 반환
  const [fileValues, setFileControls] = useControls('File', () => ({
    '3dm 업로드': button(() => modelInputRef.current?.click()),
    modelFile: { value: config.modelPath, options: modelOptions, label: '3dm 모델' },
    'HDR 업로드': button(() => hdrInputRef.current?.click()),
    hdrFile: { value: config.hdrPath, options: hdrOptionsFull, label: 'HDR 환경맵' },
  }), [modelOptions, hdrOptionsFull]) as any
  const modelFile: string = fileValues?.modelFile ?? config.modelPath
  const hdrFile: string = fileValues?.hdrFile ?? config.hdrPath

  // 업로드 후 드롭다운 자동 선택
  useEffect(() => {
    if (pendingModelUrl.current && setFileControls) {
      setFileControls({ modelFile: pendingModelUrl.current })
      pendingModelUrl.current = null
    }
  }, [modelOptions, setFileControls])

  useEffect(() => {
    if (pendingHdrUrl.current && setFileControls) {
      setFileControls({ hdrFile: pendingHdrUrl.current })
      pendingHdrUrl.current = null
    }
  }, [hdrOptionsFull, setFileControls])

  // modelFile 변경 시 로딩 표시
  const prevModelFileRef = useRef(modelFile)
  useEffect(() => {
    if (modelFile !== prevModelFileRef.current) {
      prevModelFileRef.current = modelFile
      setIsModelLoading(true)
    }
  }, [modelFile])

  // View 컨트롤
  const { fov, backgroundColor, autoRotate } = useControls('View', {
    fov: { value: config.view.fov, min: 10, max: 120, step: 1 },
    backgroundColor: { value: config.view.backgroundColor || '#ffffff' },
    autoRotate: { value: true, label: 'auto rotate' },
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

  // Bloom 컨트롤
  const {
    bloomEnabled,
    bloomIntensity,
    motionBloomEnabled,
    bloomFadeInSpeed,
    bloomFadeOutSpeed,
    bloomThreshold,
    bloomRadius,
  } = useControls('Bloom', {
    bloomEnabled: { value: config.bloom.enabled, label: 'enabled' },
    bloomIntensity: { value: config.bloom.intensity, min: 0, max: 5, step: 0.01, label: 'intensity' },
    motionBloomEnabled: { value: config.bloom.motionBloom?.enabled ?? true, label: 'motion bloom' },
    bloomFadeInSpeed: { value: config.bloom.motionBloom?.fadeInSpeed ?? 8, min: 1, max: 20, step: 0.5, label: 'fade in speed' },
    bloomFadeOutSpeed: { value: config.bloom.motionBloom?.fadeOutSpeed ?? 3, min: 1, max: 20, step: 0.5, label: 'fade out speed' },
    bloomThreshold: { value: config.bloom.luminanceThreshold, min: 0, max: 2, step: 0.01, label: 'threshold' },
    bloomRadius: { value: config.bloom.radius, min: 0, max: 2, step: 0.01, label: 'radius' },
  })

  // Accumulation 컨트롤
  const { accumEnabled, accumBlendFactor, accumMaxFrames } = useControls('Accumulation', {
    accumEnabled: { value: true, label: 'enabled' },
    accumBlendFactor: { value: 0.3, min: 0.1, max: 1.0, step: 0.05, label: 'blendFactor' },
    accumMaxFrames: { value: 64, min: 1, max: 128, step: 1, label: 'maxFrames' },
  })

  // 페이지 레벨 옵션이 바뀔 때마다 누적 버퍼 초기화용 키
  // (Ring 내부 Leva 컨트롤 변경은 Ring이 re-render → gem 외형 변경 → 자연스럽게 갱신)
  const resetCounter = useRef(0)
  const resetKey = useMemo(() => {
    return ++resetCounter.current
  }, [
    hdrFile, environmentIntensity, envRotX, envRotY, envRotZ,
    ambientLightIntensity, directionalLightIntensity,
    accumBlendFactor, accumMaxFrames,
    fov, backgroundColor,
    ringControlsVersion,
  ])

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
        <Leva />
        <input ref={modelInputRef} type='file' accept='.3dm' hidden onChange={handleModelFile} />
        <input ref={hdrInputRef} type='file' accept='.hdr,.exr' hidden onChange={handleHdrFile} />
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
              {hdrFile.startsWith('blob:') ? (
                <BlobHdrEnvironment
                  key={hdrFile}
                  url={hdrFile}
                  environmentIntensity={environmentIntensity}
                  environmentRotation={envRotation}
                />
              ) : (
                <Environment
                  key={hdrFile}
                  files={hdrFile}
                  environmentIntensity={environmentIntensity}
                  environmentRotation={envRotation}
                />
              )}
              <ambientLight intensity={ambientLightIntensity} />
              <directionalLight position={[50, 50, 50]} intensity={directionalLightIntensity} />
              <PerspectiveCamera makeDefault fov={fov} position={config.cameraPosition} />
              <OrbitControls
                enableDamping
                autoRotate={autoRotate}
                autoRotateSpeed={1}
                target={config.orbitTarget}
                minDistance={4}
                maxDistance={5.4}
                enablePan={false}
              />
              <Suspense fallback={null}>
                <Ring
                  key={modelFile}
                  modelPath={modelFile}
                  shadowTexturePath={config.shadowTexturePath}
                  metalDefaults={config.metal}
                  prongDefaults={config.prong}
                  diamondDefaults={config.diamond}
                  transformDefaults={config.transform}
                  onLoadComplete={handleModelLoadComplete}
                  onControlsChange={handleRingControlsChange}
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
              </EffectComposer>
              <GemAccumulator
                enabled={accumEnabled}
                movingBlendFactor={accumBlendFactor}
                maxAccumulationFrames={accumMaxFrames}
                resetKey={resetKey}
              />
              {bloomEnabled && (
                <ScreenBloom
                  intensity={bloomIntensity}
                  threshold={bloomThreshold}
                  radius={bloomRadius}
                  motionEnabled={motionBloomEnabled}
                  fadeInSpeed={bloomFadeInSpeed}
                  fadeOutSpeed={bloomFadeOutSpeed}
                />
              )}
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
