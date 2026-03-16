'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Leva, useControls } from 'leva'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, SoftShadows } from '@react-three/drei'
import { EffectComposer, Bloom, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import { ringConfig } from '@/config'

// Ring 컴포넌트 동적 로드
const Ring = dynamic(() => import('@/components/canvas/Models').then((mod) => mod.Ring), { ssr: false })

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
  '/model/ring-260316/render/1.jpg',
  '/model/ring-260316/render/2.jpg',
  '/model/ring-260316/render/3.jpg',
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
              <EffectComposer multisampling={0} enableNormalPass={false}>
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
