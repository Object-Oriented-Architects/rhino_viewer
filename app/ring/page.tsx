'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback } from 'react'
import { Leva } from 'leva'

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

const View = dynamic(() => import('@/components/canvas/View').then((mod) => mod.View), { ssr: false })
const Common = dynamic(() => import('@/components/canvas/View').then((mod) => mod.Common), { ssr: false })
const Effects = dynamic(() => import('@/components/canvas/View').then((mod) => mod.Effects), { ssr: false })
const Ring = dynamic(() => import('@/components/canvas/Models').then((mod) => mod.Ring), { ssr: false })

export default function Page() {
  const [isModelLoading, setIsModelLoading] = useState(true)

  const handleModelLoadComplete = useCallback(() => {
    setIsModelLoading(false)
  }, [])

  return (
    <>
      <div className='h-screen w-screen relative'>
        {/* 3D 모델 로딩 중일 때만 스피너 표시 */}
        {isModelLoading && <LoadingSpinner message='Loading...' />}

        <div className='absolute h-screen w-screen'>
          <Leva collapsed />
          <View orbit orbitTarget={[0, 0, 0]} className='relative h-full'>
            <Suspense fallback={null}>
              <Common
                color='#ffffff'
                hdrPath='/model/ring-260203/ring800.hdr'
                cameraPosition={[6, 8, 6]}
                envDefaults={{
                  fov: 45,
                  environmentIntensity: 1.0,
                  envRotY: 0,
                  ambientLightIntensity: 0.5,
                  directionalLightIntensity: 0.8,
                }}
              />
              <Ring onLoadComplete={handleModelLoadComplete} />
              <Effects
                bloomDefaults={{
                  enabled: true,
                  intensity: 0.3,
                  luminanceThreshold: 1.0,
                  luminanceSmoothing: 0.9,
                  radius: 0.4,
                }}
              />
            </Suspense>
          </View>
        </div>
      </div>
    </>
  )
}
