'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback } from 'react'
import Image from 'next/image'
import { Leva } from 'leva'
import { ringConfig } from '@/config'

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

const config = ringConfig

export default function Page() {
  const [isModelLoading, setIsModelLoading] = useState(true)
  const [showComparison, setShowComparison] = useState(false)

  const handleModelLoadComplete = useCallback(() => {
    setIsModelLoading(false)
  }, [])

  return (
    <>
      <div className='h-screen w-screen relative'>
        {isModelLoading && <LoadingSpinner message='Loading...' />}

        {/* 토글 버튼 */}
        <button
          onClick={() => setShowComparison(!showComparison)}
          className='fixed top-4 left-4 z-[100] px-4 py-2 bg-black/70 hover:bg-black/90 text-white rounded-lg backdrop-blur-sm transition-colors text-sm font-medium'
        >
          {showComparison ? 'IMAGE: ON' : 'IMAGE: OFF'}
        </button>

        <div className={`flex h-screen w-screen ${showComparison ? 'flex-col md:flex-row' : ''}`}>
          {/* Three.js 영역 */}
          <div className={`relative ${showComparison ? 'h-1/2 w-full md:h-full md:w-1/2' : 'h-full w-full'}`}>
            <Leva collapsed />
            <View orbit orbitTarget={config.orbitTarget} className='relative h-full'>
              <Suspense fallback={null}>
                <Common
                  color='#ffffff'
                  hdrPath={config.hdrPath}
                  cameraPosition={config.cameraPosition}
                  envDefaults={{
                    fov: config.view.fov,
                    ...config.light,
                  }}
                />
                <Ring
                  modelPath={config.modelPath}
                  shadowTexturePath={config.shadowTexturePath}
                  metalDefaults={config.metal}
                  prongDefaults={config.prong}
                  diamondDefaults={config.diamond}
                  transformDefaults={config.transform}
                  onLoadComplete={handleModelLoadComplete}
                />
                <Effects bloomDefaults={config.bloom} />
              </Suspense>
            </View>
          </div>

          {/* 렌더링 이미지 영역 */}
          {showComparison && (
            <div className='relative h-1/2 w-full md:h-full md:w-1/2 bg-white'>
              <Image
                src='/model/ring-260203-angle/render.webp'
                alt='Render comparison'
                fill
                className='object-contain'
                priority
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
