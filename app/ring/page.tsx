'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback } from 'react'
import Image from 'next/image'
import { Leva } from 'leva'
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
  '/model/ring-260203-angle/render/render01.jpg',
  '/model/ring-260203-angle/render/render02.jpg',
  '/model/ring-260203-angle/render/render03.jpg',
]

export default function Page() {
  const [isModelLoading, setIsModelLoading] = useState(true)

  const handleModelLoadComplete = useCallback(() => {
    setIsModelLoading(false)
  }, [])

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
              <color attach='background' args={['#ffffff']} />
              <SoftShadows />
              <Environment
                files={config.hdrPath}
                environmentIntensity={config.light.environmentIntensity}
                environmentRotation={[
                  THREE.MathUtils.degToRad(config.light.envRotX || 0),
                  THREE.MathUtils.degToRad(config.light.envRotY || 0),
                  THREE.MathUtils.degToRad(config.light.envRotZ || 0),
                ]}
              />
              <ambientLight intensity={config.light.ambientLightIntensity || 0} />
              <directionalLight position={[50, 50, 50]} intensity={config.light.directionalLightIntensity || 0.3} />
              <PerspectiveCamera makeDefault fov={config.view.fov} position={config.cameraPosition} />
              <OrbitControls
                enableDamping
                autoRotate
                autoRotateSpeed={1}
                target={config.orbitTarget}
                minDistance={5}
                maxDistance={10}
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
