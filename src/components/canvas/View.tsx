'use client'

import { forwardRef, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { SoftShadows, OrbitControls, PerspectiveCamera, View as ViewImpl, Environment, ContactShadows } from '@react-three/drei'
import { Three } from '@/helpers/components/Three'
import * as THREE from 'three'
import { folder, useControls } from 'leva'
import { RGBELoader } from 'three/examples/jsm/Addons.js'
import { EffectComposer, Bloom } from '@react-three/postprocessing'

interface EnvDefaults {
  fov?: number
  environmentIntensity?: number
  envRotY?: number
  ambientLightIntensity?: number
  directionalLightIntensity?: number
}

interface CommonProps {
  color?: string
  hdrPath?: string
  cameraPosition?: [number, number, number]
  envDefaults?: EnvDefaults
}

export const Common = ({
  color,
  hdrPath = '/model/glasses/breezm.hdr',
  cameraPosition = [165, 65, 265],
  envDefaults = {},
}: CommonProps) => {
  const {
    fov: defaultFov = 30,
    environmentIntensity: defaultEnvIntensity = 0.5,
    envRotY: defaultEnvRotY = 340,
    ambientLightIntensity: defaultAmbient = 0.5,
    directionalLightIntensity: defaultDirectional = 0.2,
  } = envDefaults

  const { fov } = useControls('View', {
    fov: {
      value: defaultFov,
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
      value: defaultEnvIntensity,
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
      value: defaultEnvRotY,
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
      value: defaultAmbient,
      min: 0,
      max: 10,
      step: 0.01,
    },
    directionalLightInentsity: {
      value: defaultDirectional,
      min: 0,
      max: 10,
      step: 0.01,
    },
    background: false,
  })
  // 환경맵 회전 (값이 바뀔 때마다 새 Euler 생성해야 React가 감지)
  const envRot = useMemo(
    () => new THREE.Euler(THREE.MathUtils.degToRad(envRotX), THREE.MathUtils.degToRad(envRotY), THREE.MathUtils.degToRad(envRotZ)),
    [envRotX, envRotY, envRotZ],
  )
  return (
    <Suspense fallback={null}>
      {color && <color attach='background' args={[color]} />}
      <SoftShadows />

      {/* 환경 맵 추가 - 크롬 반사를 위해 */}
      <Environment
        preset={envMap === 'threejs studio' ? 'studio' : undefined}
        files={envMap === 'hdr' ? hdrPath : undefined}
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

      <PerspectiveCamera makeDefault fov={fov} position={cameraPosition} />
    </Suspense>
  )
}

interface ViewProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  orbit?: boolean
  orbitTarget?: [number, number, number]
}

const View = forwardRef<HTMLDivElement, ViewProps>(({ children, orbit, orbitTarget = [0, 0, 0], ...props }, ref) => {
  const localRef = useRef(null)
  useImperativeHandle(ref, () => localRef.current)

  return (
    <>
      <div ref={localRef} {...props} />
      <Three>
        <ViewImpl track={localRef}>
          {children}
          {orbit && <OrbitControls enableDamping autoRotate autoRotateSpeed={2} target={orbitTarget} />}
        </ViewImpl>
      </Three>
    </>
  )
})
View.displayName = 'View'

export { View }

interface BloomDefaults {
  enabled?: boolean
  intensity?: number
  luminanceThreshold?: number
  luminanceSmoothing?: number
  radius?: number
}

interface EffectsProps {
  bloomDefaults?: BloomDefaults
}

interface ShadowsProps {
  position?: [number, number, number]
  opacity?: number
  scale?: number
  blur?: number
}

export function Shadows({ position = [0, -0.5, 0], opacity = 0.5, scale = 10, blur = 2.5 }: ShadowsProps) {
  return (
    <ContactShadows
      position={position}
      opacity={opacity}
      scale={scale}
      blur={blur}
      far={4}
      resolution={512}
      color='#000000'
    />
  )
}

export function Effects({ bloomDefaults = {} }: EffectsProps) {
  const {
    enabled: defaultEnabled = false,
    intensity: defaultIntensity = 2,
    luminanceThreshold: defaultThreshold = 1,
    luminanceSmoothing: defaultSmoothing = 1,
    radius: defaultRadius = 0.8,
  } = bloomDefaults

  const { enabled, intensity, luminanceThreshold, luminanceSmoothing, radius } = useControls('Bloom', {
    enabled: { value: defaultEnabled },
    intensity: { value: defaultIntensity, min: 0, max: 10, step: 0.01 },
    luminanceThreshold: { value: defaultThreshold, min: 0, max: 2, step: 0.01 },
    luminanceSmoothing: { value: defaultSmoothing, min: 0, max: 2, step: 0.01 },
    radius: { value: defaultRadius, min: 0, max: 2, step: 0.01 },
  })

  // EffectComposer를 항상 마운트하고 intensity로 제어 (마운트/언마운트 깜빡임 방지)
  // disableNormalPass: MeshRefractionMaterial과의 충돌 방지
  return (
    <EffectComposer multisampling={0} disableNormalPass>
      <Bloom
        intensity={enabled ? intensity : 0}
        luminanceThreshold={luminanceThreshold}
        luminanceSmoothing={luminanceSmoothing}
        radius={radius}
        mipmapBlur
      />
    </EffectComposer>
  )
}
