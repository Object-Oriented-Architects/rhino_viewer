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

type MaterialConfig = {
  color?: string
  anisotropy?: number
  reflectivity?: number
  ior?: number
  metalness?: number
  roughness?: number
  roughnessMap?: string
  opacity?: number
  clearcoat?: number
  clearcoatRoughness?: number
  transmission?: number
  thickness?: number
  iridescence?: number
  dispersion?: number
  specularColor?: string
  specularIntensity?: number
  hueShift?: number
  saturation?: number
  lightness?: number
  multiplyScalar?: number
}

const applyMaterialSettings = (material: THREE.MeshPhysicalMaterial, values: MaterialConfig, textures?: any) => {
  if (values.color) material.color.set(values.color)
  if (values.anisotropy !== undefined) material.anisotropy = values.anisotropy
  if (values.reflectivity !== undefined) material.reflectivity = values.reflectivity
  if (values.ior !== undefined) material.ior = values.ior
  if (values.opacity !== undefined) material.opacity = values.opacity
  if (values.metalness !== undefined) material.metalness = values.metalness
  if (values.roughness !== undefined) material.roughness = values.roughness
  if (values.roughnessMap !== undefined && textures) {
    if (values.roughnessMap === 'none') {
      material.roughnessMap = null
    } else {
      material.roughnessMap = textures[values.roughnessMap as keyof typeof textures]
    }
  }

  if (values.specularColor !== undefined) material.specularColor.set(values.specularColor)
  if (values.specularIntensity !== undefined) material.specularIntensity = values.specularIntensity

  if (values.clearcoat !== undefined) material.clearcoat = values.clearcoat
  if (values.clearcoatRoughness !== undefined) material.clearcoatRoughness = values.clearcoatRoughness

  if (values.transmission !== undefined) material.transmission = values.transmission
  if (values.thickness !== undefined) material.thickness = values.thickness
  if (values.iridescence !== undefined) material.iridescence = values.iridescence
  if (values.dispersion !== undefined) material.dispersion = values.dispersion

  if (values.hueShift !== undefined && values.saturation !== undefined && values.lightness !== undefined)
    material.color.setHSL(values.hueShift / 360, values.saturation, values.lightness)

  if (values.multiplyScalar !== undefined) material.color.multiplyScalar(values.multiplyScalar)

  material.needsUpdate = true
}

const materialGroups = [
  {
    key: 'Temple',
    controls: {
      color: { value: '#ffffff' },
      metalness: { value: 1.0, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'TempleTip',
    controls: {
      color: { value: '#73b0ff' },
      anisotropy: { value: 0, min: 0, max: 1, step: 0.01 },
      reflectivity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      ior: { value: 1.5, min: 1, max: 2.333, step: 0.001 },
      opacity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoatRoughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      transmission: { value: 1, min: 0, max: 1, step: 0.01 },
      thickness: { value: 1, min: 0, max: 1, step: 0.01 },
      iridescence: { value: 1, min: 0, max: 1, step: 0.01 },
      dispersion: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'NosePad',
    controls: {
      color: { value: '#ffffff' },
      anisotropy: { value: 0, min: 0, max: 1, step: 0.01 },
      reflectivity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      ior: { value: 1.5, min: 1, max: 2.333, step: 0.001 },
      opacity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoatRoughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      transmission: { value: 1, min: 0, max: 1, step: 0.01 },
      thickness: { value: 1, min: 0, max: 1, step: 0.01 },
      iridescence: { value: 1, min: 0, max: 1, step: 0.01 },
      dispersion: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'Glass',
    controls: {
      color: { value: '#ffffff' },
      anisotropy: { value: 0, min: 0, max: 1, step: 0.01 },
      reflectivity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      ior: { value: 1.5, min: 1, max: 2.333, step: 0.001 },
      opacity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoatRoughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      transmission: { value: 1, min: 0, max: 1, step: 0.01 },
      thickness: { value: 1, min: 0, max: 1, step: 0.01 },
      iridescence: { value: 1, min: 0, max: 1, step: 0.01 },
      dispersion: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'Frame',
    controls: {
      roughness: { value: 0.5, min: 0, max: 1, step: 0.01 },
      roughnessMap: { value: 'roughness', options: ['roughness', 'curvature', 'none'] },
      hueShift: { value: 220, min: 0, max: 360, step: 0.1 },
      saturation: { value: 0.8, min: 0, max: 1, step: 0.01 },
      lightness: { value: 0.5, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
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
      curvature: loader.load('/model/Breezm_Pbr_shadow_embedded_files/Curvature.png'),
      shadow: loader.load('/model/Breezm_Pbr_shadow_embedded_files/shadow.jpg'),
    }
  }, [])

  const modelObj = useLoader(Rhino3dmLoader, filepath, (loader) => {
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
  })
  const matRef = useRef<Record<string, THREE.MeshPhysicalMaterial[]>>({
    Temple: [],
    TempleTip: [],
    NosePad: [],
    Frame: [],
    Shadow: [],
  })
  const Temple = useControls('Temple', materialGroups[0].controls as any)
  const TempleTip = useControls('TempleTip', materialGroups[1].controls as any)
  const NosePad = useControls('NosePad', materialGroups[2].controls as any)
  const Glass = useControls('Glass', materialGroups[3].controls as any)
  const Frame = useControls('Frame', materialGroups[4].controls as any)

  const controlValues = {
    Temple,
    TempleTip,
    NosePad,
    Glass,
    Frame,
  } as any

  // 모델 로드 후 텍스처 수동 적용
  useEffect(() => {
    if (!modelObj) return
    matRef.current = { Temple: [], TempleTip: [], NosePad: [], Glass: [], Frame: [], Shadow: [] }
    modelObj.traverse((child) => {
      // 타입 가드를 사용하여 Mesh인지 확인
      if (child instanceof THREE.Mesh) {
        let material = child.material

        // 재질이 MeshStandardMaterial 또는 MeshPhysicalMaterial인지 확인
        if (material instanceof THREE.MeshPhysicalMaterial) {
          if (material.name == 'shadow') {
            child.material = new THREE.MeshBasicMaterial({
              map: textures.shadow,
              toneMapped: false,
            })
          }
          if (material.name == 'Frame') {
            material.map = textures.color
          }
          if (material.name == 'Temple') {
            material.normalMap = textures.normal
            console.log(material)
          }
          if (!material.roughnessMap) {
            material.roughnessMap = textures.roughness
          }

          if (matRef.current[material.name]) {
            matRef.current[material.name].push(material)
          }

          const group = materialGroups.find((g) => g.key === material.name)
          if (group) {
            const initialValues = Object.fromEntries(
              Object.entries(group.controls).map(([key, config]) => [key, (config as any).value]),
            )
            applyMaterialSettings(material, initialValues, textures)
          }
        }
      }
    })

    if (onLoadComplete) {
      onLoadComplete()
    }
  }, [modelObj, textures, onLoadComplete])

  useEffect(() => {
    materialGroups.forEach(({ key }) => {
      const material = matRef.current[key] ?? []
      const values = controlValues[key]
      material.forEach((material) => {
        if (material) {
          applyMaterialSettings(material, values, textures)
        }
      })
    })
  }, [Temple, TempleTip, NosePad, Glass, Frame])

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} {...props}>
      <primitive object={modelObj} />
    </group>
  )
}
