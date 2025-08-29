'use client'

import { forwardRef, Suspense, useImperativeHandle, useRef } from 'react'
import { OrbitControls, PerspectiveCamera, View as ViewImpl, Environment } from '@react-three/drei'
import { Three } from '@/helpers/components/Three'

interface CommonProps {
  color?: string
}

export const Common = ({ color }: CommonProps) => (
  <Suspense fallback={null}>
    {color && <color attach='background' args={[color]} />}

    {/* 환경 맵 추가 - 크롬 반사를 위해 */}
    <Environment preset='studio' />

    {/* PBR을 위한 환경 조명 */}
    <ambientLight intensity={0.2} />
    <directionalLight
      position={[50, 50, 50]}
      intensity={2}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-near={0.1}
      shadow-camera-far={250}
      shadow-camera-left={-100}
      shadow-camera-right={150}
      shadow-camera-top={100}
      shadow-camera-bottom={-100}
    />

    {/* 추가 조명으로 PBR 재질 강화 */}
    <pointLight position={[-10, 5, 10]} intensity={0.5} />
    <pointLight position={[10, -5, -10]} intensity={0.3} color='#4080ff' />

    <PerspectiveCamera makeDefault fov={60} position={[165, 65, 265]} />
  </Suspense>
)

interface ViewProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  orbit?: boolean
}

const View = forwardRef<HTMLDivElement, ViewProps>(({ children, orbit, ...props }, ref) => {
  const localRef = useRef(null)
  useImperativeHandle(ref, () => localRef.current)

  return (
    <>
      <div ref={localRef} {...props} />
      <Three>
        <ViewImpl track={localRef}>
          {children}
          {orbit && <OrbitControls enableDamping={false} />}
        </ViewImpl>
      </Three>
    </>
  )
})
View.displayName = 'View'

export { View }
