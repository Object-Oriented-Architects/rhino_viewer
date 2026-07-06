'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Leva, useControls, button } from 'leva'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, Caustics } from '@react-three/drei'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EffectComposer, SMAA, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { ringPlusplasticConfig } from '@/config'

// blob URL은 확장자가 없어서 drei의 Environment가 로더를 판별 못 함
// RGBELoader로 직접 로드하여 map prop으로 전달
function BlobHdrEnvironment({ url, ...props }: { url: string } & Omit<React.ComponentProps<typeof Environment>, 'files' | 'map'>) {
  const texture = useLoader(RGBELoader, url)
  texture.mapping = THREE.EquirectangularReflectionMapping
  return <Environment map={texture} {...props} />
}

// Ring 컴포넌트 동적 로드
const Ring = dynamic(() => import('@/components/canvas/Models').then((mod) => mod.Ring), { ssr: false })

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

  const hdrOptionsFull = useMemo(() => ({
    ...hdrOptions,
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
  const [fileValues, setFileControls] = useControls('File', () => ({
    '3dm 업로드': button(() => modelInputRef.current?.click()),
    modelFile: { value: config.modelPath, options: modelOptions, label: '3dm 모델' },
    'HDR 업로드': button(() => hdrInputRef.current?.click()),
    hdrFile: { value: config.hdrPath, options: hdrOptionsFull, label: 'HDR 환경맵' },
  }), [modelOptions, hdrOptionsFull]) as any
  const modelFile: string = fileValues?.modelFile ?? config.modelPath
  const hdrFile: string = fileValues?.hdrFile ?? config.hdrPath

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

  // Bloom 컨트롤 (CodeSandbox 단일 Bloom)
  const { bloomEnabled, bloomIntensity, bloomThreshold, bloomSmoothing, bloomLevels, bloomRadius, bloomMipmap } =
    useControls('Bloom', {
      bloomEnabled: { value: config.bloom.enabled, label: 'enabled' },
      bloomIntensity: { value: config.bloom.intensity, min: 0, max: 5, step: 0.01, label: 'intensity' },
      bloomThreshold: { value: config.bloom.luminanceThreshold, min: 0, max: 2, step: 0.01, label: 'threshold' },
      bloomSmoothing: { value: config.bloom.luminanceSmoothing, min: 0, max: 2, step: 0.01, label: 'smoothing' },
      bloomLevels: { value: config.bloom.levels ?? 9, min: 1, max: 10, step: 1, label: 'levels' },
      bloomRadius: { value: config.bloom.radius, min: 0, max: 2, step: 0.01, label: 'radius' },
      bloomMipmap: { value: true, label: 'mipmapBlur' },
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
            <Canvas gl={{ antialias: true }} dpr={[2, 3]} shadows>
              <color attach='background' args={[backgroundColor]} />
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
                autoRotateSpeed={0.3}
                target={config.orbitTarget}
                minDistance={4}
                maxDistance={5.4}
                enablePan={false}
              />
              <Suspense fallback={null}>
                {(() => {
                  const ring = (
                    <Ring
                      key={modelFile}
                      modelPath={modelFile}
                      shadowTexturePath={config.shadowTexturePath}
                      metalDefaults={config.metal}
                      prongDefaults={config.prong}
                      diamondDefaults={config.diamond}
                      transformDefaults={config.transform}
                      gemMaterial='refraction'
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
              <EffectComposer multisampling={4} enableNormalPass={false}>
                <SMAA />
                <Bloom
                  intensity={bloomEnabled ? bloomIntensity : 0}
                  luminanceThreshold={bloomThreshold}
                  luminanceSmoothing={bloomSmoothing}
                  levels={bloomLevels}
                  radius={bloomRadius}
                  mipmapBlur={bloomMipmap}
                />
              </EffectComposer>
            </Canvas>
          </div>

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
