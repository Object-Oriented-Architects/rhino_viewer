'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState, useCallback } from 'react'

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
    {/* <p className='mt-2 text-white text-sm opacity-75'>잠시만 기다려 주세요</p> */}
  </div>
)

const View = dynamic(() => import('@/components/canvas/View').then((mod) => mod.View), { ssr: false })
const Common = dynamic(() => import('@/components/canvas/View').then((mod) => mod.Common), { ssr: false })

// Breezm 컴포넌트를 동적으로 로드하되, 로딩 완료 콜백을 지원하도록 래핑
const GlassesWithCallback = ({ onLoadComplete }: { onLoadComplete: () => void }) => {
  const Breezm = dynamic(() => import('@/components/canvas/Examples').then((mod) => mod.Breezm), { ssr: false })
  return <Breezm onLoadComplete={onLoadComplete} />
}

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
          <View orbit className='relative h-full'>
            <Suspense fallback={null}>
              <Common />
              <GlassesWithCallback onLoadComplete={handleModelLoadComplete} />
            </Suspense>
          </View>
        </div>
      </div>
    </>
  )
}
