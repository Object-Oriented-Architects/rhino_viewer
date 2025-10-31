'use client'

import { useGLTF } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo, useRef, useState, useEffect } from 'react'
import { Line, useCursor, MeshDistortMaterial } from '@react-three/drei'
import { useRouter } from 'next/navigation'
import { folder, useControls } from 'leva'

const materialGroups = [
  {
    key: 'Temple',
    controls: {
      color: { value: '#ffffff' },
      metalness: { value: 1.0, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'TempleTip',
    controls: {
      color: { value: '#73b0ff' },
      opacity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoatRoughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'Frame',
    controls: {
      roughness: { value: 0.5, min: 0, max: 1, step: 0.01 },
      hueShift: { value: 220, min: 0, max: 360, step: 0.1 },
      saturation: { value: 0.8, min: 0, max: 1, step: 0.01 },
      lightness: { value: 0.5, min: 0, max: 1, step: 0.01 },
      multiplyScalar: { value: 3, min: 0, max: 10 },
    },
  },
]

export function Breezm({ onLoadComplete, ...props }) {
  const filepath = '/model/Breezm_Pbr_shadow.3dm'

  // 텍스처들을 미리 로드
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    return {
      color: loader.load('/model/Breezm_Pbr_shadow_embedded_files/Color-small.jpg'),
      normal: loader.load('/model/Breezm_Pbr_shadow_embedded_files/Normal-small.jpg'),
      roughness: loader.load('/model/Breezm_Pbr_shadow_embedded_files/Roughness-small.jpg'),
      shadow: loader.load('/model/Breezm_Pbr_shadow_embedded_files/shadow.jpg'),
    }
  }, [])

  const modelObj = useLoader(Rhino3dmLoader, filepath, (loader) => {
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
  })
  const templeMatRef = useRef<THREE.MeshPhysicalMaterial[]>([])
  const matRef = useRef<Record<string, THREE.MeshPhysicalMaterial[]>>({
    Temple: [],
    TempleTip: [],
    Frame: [],
    Shadow: [],
  })
  const Temple = useControls('Temple', materialGroups[0].controls as any)
  const TempleTip = useControls('TempleTip', materialGroups[1].controls as any)
  const Frame = useControls('Frame', materialGroups[2].controls as any)

  const controlValues = {
    Temple,
    TempleTip,
    Frame,
  } as any

  // 모델 로드 후 텍스처 수동 적용
  useEffect(() => {
    if (!modelObj) return
    matRef.current = { Temple: [], TempleTip: [], Frame: [], Shadow: [] }
    modelObj.traverse((child) => {
      // 타입 가드를 사용하여 Mesh인지 확인
      if (child instanceof THREE.Mesh) {
        const material = child.material

        // 재질이 MeshStandardMaterial 또는 MeshPhysicalMaterial인지 확인
        if (material instanceof THREE.MeshPhysicalMaterial) {
          if (material.name == 'shadow') {
            const shadowMat = new THREE.MeshBasicMaterial({
              map: textures.shadow,
              toneMapped: false,
            })
            child.material = shadowMat
          }
          if (material.name == 'Frame') {
            material.map = textures.color
            material.roughness = 0.5

            const hueShift = 220 / 360
            material.color.setHSL(hueShift, 0.8, 0.5)
            material.color.multiplyScalar(3)
          }
          if (material.name == 'Temple') {
            templeMatRef.current.push(material)
            material.color.setHex(0xffffff)
            material.metalness = 1
            material.roughness = 0.05
            material.normalMap = textures.normal
          }
          if (!material.roughnessMap) {
            material.roughnessMap = textures.roughness
          }

          if (matRef.current[material.name]) {
            matRef.current[material.name].push(material)
          }

          material.needsUpdate = true
        }
      }
    })

    if (onLoadComplete) {
      onLoadComplete()
    }
  }, [modelObj, textures, onLoadComplete])

  useEffect(() => {
    for (const { key } of materialGroups) {
      const mats = matRef.current[key] ?? []
      const values = controlValues[key]
      for (const m of mats) {
        if (!m) continue
        if (values.color) m.color.set(values.color)
        if (values.opacity !== undefined) m.opacity = values.opacity
        if (values.metalness !== undefined) m.metalness = values.metalness
        if (values.roughness !== undefined) m.roughness = values.roughness
        if (values.clearcoat !== undefined) m.clearcoat = values.clearcoat
        if (values.clearcoatRoughness !== undefined) m.clearcoatRoughness = values.clearcoatRoughness
        if (values.hueShift !== undefined && values.saturation !== undefined && values.lightness !== undefined)
          m.color.setHSL(values.hueShift / 360, values.saturation, values.lightness)
        if (values.multiplyScalar !== undefined) m.color.multiplyScalar(values.multiplyScalar)
      }
    }
  }, [controlValues.Temple, controlValues.TempleTip, controlValues.Frame, controlValues.Shadow])

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} {...props}>
      <primitive object={modelObj} />
    </group>
  )
}
