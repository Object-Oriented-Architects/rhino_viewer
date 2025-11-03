'use client'

import { forwardRef, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { SoftShadows, OrbitControls, PerspectiveCamera, View as ViewImpl, Environment } from '@react-three/drei'
import { Three } from '@/helpers/components/Three'
import * as THREE from 'three'
import { folder, useControls } from 'leva'
import { RGBELoader } from 'three/examples/jsm/Addons.js'

interface CommonProps {
  color?: string
}

export const Common = ({ color }: CommonProps) => {
  const { fov } = useControls('View', {
    fov: {
      value: 30,
      min: 10,
      max: 120,
      step: 1,
    },
  })
  const {
    envMap,
    environmentIntensity,
    envRotX,
    envRotY,
    envRotZ,
    ambientLightIntensity,
    directionalLightInentsity,
    background,
  } = useControls('Light', {
    envMap: {
      value: 'hdr',
      options: ['threejs studio', 'hdr'],
    },
    environmentIntensity: {
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
    envRotX: {
      value: 0,
      min: 0,
      max: 360,
      step: 0.01,
    },
    envRotY: {
      value: 340,
      min: 0,
      max: 360,
      step: 0.01,
    },
    envRotZ: {
      value: 0,
      min: 0,
      max: 360,
      step: 0.01,
    },
    ambientLightIntensity: {
      value: 0.5,
      min: 0,
      max: 10,
      step: 0.01,
    },
    directionalLightInentsity: {
      value: 0.2,
      min: 0,
      max: 10,
      step: 0.01,
    },
    background: false,
  })
  const envRot = useMemo(() => new THREE.Euler(), [])
  useEffect(() => {
    envRot.set(THREE.MathUtils.degToRad(envRotX), THREE.MathUtils.degToRad(envRotY), THREE.MathUtils.degToRad(envRotZ))
  }, [envRotX, envRotY, envRotZ])
  return (
    <Suspense fallback={null}>
      {color && <color attach='background' args={[color]} />}
      <SoftShadows />

      {/* 환경 맵 추가 - 크롬 반사를 위해 */}
      <Environment
        preset={envMap === 'threejs studio' ? 'studio' : undefined}
        files={envMap === 'hdr' ? '/model/breezm.hdr' : undefined}
        environmentIntensity={environmentIntensity}
        environmentRotation={envRot}
        backgroundRotation={envRot}
        background={background}
      />

      {/* PBR을 위한 환경 조명 */}
      <ambientLight intensity={ambientLightIntensity} />
      <directionalLight
        position={[50, 50, 50]}
        intensity={directionalLightInentsity}
        // castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.1}
        shadow-camera-far={250}
        shadow-camera-left={-100}
        shadow-camera-right={150}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />

      {/* 추가 조명으로 PBR 재질 강화 */}
      {/* <pointLight position={[-10, 5, 10]} intensity={0.5} />
      <pointLight position={[10, -5, -10]} intensity={0.3} color='#4080ff' /> */}

      <PerspectiveCamera makeDefault fov={fov} position={[165, 65, 265]} />
    </Suspense>
  )
}

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
