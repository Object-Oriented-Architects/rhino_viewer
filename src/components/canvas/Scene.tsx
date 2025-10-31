'use client'

import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import { r3f } from '@/helpers/global'
import * as THREE from 'three'
import { useControls } from 'leva'

export default function Scene({ ...props }) {
  // Everything defined in here will persist between route changes, only children are swapped
  return (
    <Canvas
      {...props}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.ACESFilmicToneMapping
        // state.gl.toneMapping = THREE.AgXToneMapping
        state.gl.toneMappingExposure = 1.0
      }}
      shadows={true}
    >
      {/* @ts-ignore */}
      <r3f.Out />
      <Preload all />
    </Canvas>
  )
}
