'use client'

import { ShadowAlpha, useGLTF } from '@react-three/drei'
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
  colorMap?: string
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
  attenuationColor?: string
  attenuationDistance?: number
}

const applyMaterialSettings = (material: THREE.MeshPhysicalMaterial, values: MaterialConfig, textures?: any) => {
  if (values.color) material.color.set(values.color)
  if (values.colorMap !== undefined) {
    material.map = textures[values.colorMap as keyof typeof textures]
  }
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
  if (values.attenuationColor !== undefined) material.attenuationColor.set(values.attenuationColor)
  if (values.attenuationDistance !== undefined) material.attenuationDistance = values.attenuationDistance

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
      roughness: { value: 0.3, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'TempleTip',
    controls: {
      color: { value: '#73b0ff' },
      anisotropy: { value: 0.5, min: 0, max: 1, step: 0.01 },
      reflectivity: { value: 1, min: 0, max: 1, step: 0.01 },
      ior: { value: 2, min: 1, max: 2.333, step: 0.001 },
      opacity: { value: 0.8, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoatRoughness: { value: 0, min: 0, max: 1, step: 0.01 },
      transmission: { value: 1, min: 0, max: 1, step: 0.01 },
      thickness: { value: 1, min: 0, max: 1, step: 0.01 },
      iridescence: { value: 0, min: 0, max: 1, step: 0.01 },
      dispersion: { value: 0, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'NosePad',
    controls: {
      color: { value: '#ffffff' },
      anisotropy: { value: 0, min: 0, max: 1, step: 0.01 },
      reflectivity: { value: 0, min: 0, max: 1, step: 0.01 },
      ior: { value: 2.333, min: 1, max: 2.333, step: 0.001 },
      opacity: { value: 0.57, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoatRoughness: { value: 1, min: 0, max: 1, step: 0.01 },
      transmission: { value: 1, min: 0, max: 1, step: 0.01 },
      thickness: { value: 1, min: 0, max: 1, step: 0.01 },
      iridescence: { value: 0, min: 0, max: 1, step: 0.01 },
      dispersion: { value: 0, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'Glass',
    controls: {
      color: { value: '#ffffff' },
      anisotropy: { value: 0, min: 0, max: 1, step: 0.01 },
      reflectivity: { value: 1, min: 0, max: 1, step: 0.01 },
      ior: { value: 1, min: 1, max: 2.333, step: 0.001 },
      opacity: { value: 0.33, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoatRoughness: { value: 0, min: 0, max: 1, step: 0.01 },
      transmission: { value: 1, min: 0, max: 1, step: 0.01 },
      thickness: { value: 1, min: 0, max: 1, step: 0.01 },
      iridescence: { value: 0.5, min: 0, max: 1, step: 0.01 },
      dispersion: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'Frame',
    controls: {
      colorMap: { value: 'colorAll', options: ['colorAll', 'colorMap'] },
      roughness: { value: 0.5, min: 0, max: 1, step: 0.01 },
      roughnessMap: { value: 'roughness', options: ['roughness', 'curvature', 'curvatureInvert', 'none'] },
      hueShift: { value: 220, min: 0, max: 360, step: 0.1 },
      saturation: { value: 0.8, min: 0, max: 1, step: 0.01 },
      lightness: { value: 0.19, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      multiplyScalar: { value: 6.3, min: 0, max: 10 },
    },
  },
]

export function Breezm({ onLoadComplete, ...props }) {
  const filepath = '/model/glasses/Breezm_Pbr_shadow.3dm'

  // 텍스처들을 미리 로드
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    const colorAllTexture = loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/Color-small.jpg')
    colorAllTexture.wrapS = THREE.RepeatWrapping
    colorAllTexture.wrapT = THREE.RepeatWrapping
    colorAllTexture.repeat.set(4, 4)
    return {
      colorAll: colorAllTexture,
      colorMap: loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/Color-map.jpg'),
      normal: loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/Normal-small.jpg'),
      roughness: loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/Roughness-small.jpg'),
      curvature: loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/Curvature.png'),
      curvatureInvert: loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/Curvature_invert.png'),
      shadow: loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/shadow.jpg'),
      ShadowAlpha: loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/gradient_02.jpg'),
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
  const Glass = useControls('Lens', materialGroups[3].controls as any)
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
              alphaMap: textures.ShadowAlpha,
              transparent: true,
            })
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

// Ring 재질 그룹 정의
const ringMaterialGroups = [
  {
    key: 'Metal',
    controls: {
      color: { value: '#dfdfdf' },
      metalness: { value: 1.0, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  },
  {
    key: 'Gem',
    controls: {
      // 기본 색상은 흰색, attenuationColor가 보석 색상 담당
      color: { value: '#ffffff' },
      metalness: { value: 0, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0, min: 0, max: 1, step: 0.01 },
      // 루비 IOR: 1.76, 다이아몬드: 2.42
      ior: { value: 2, min: 1, max: 3, step: 0.01 },
      reflectivity: { value: 1, min: 0, max: 1, step: 0.01 },
      specularColor: { value: '#ffffff' },
      specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
      clearcoatRoughness: { value: 0, min: 0, max: 1, step: 0.01 },
      // transmission: 1 = 완전 투과, thickness와 함께 사용
      transmission: { value: 1, min: 0, max: 1, step: 0.01 },
      // thickness: 모델 크기에 맞게 조정 (중요!)
      thickness: { value: 5, min: 0, max: 50, step: 0.5 },
      opacity: { value: 1, min: 0, max: 1, step: 0.01 },
      // 보석 색상은 attenuationColor로 설정
      attenuationColor: { value: '#ff2f00' },
      // attenuationDistance: 작을수록 색이 진함
      attenuationDistance: { value: 0.5, min: 0.01, max: 10, step: 0.01 },
    },
  },
]

export function Ring({ onLoadComplete, ...props }) {
  const filepath = '/model/ring/ring.3dm'

  const modelObj = useLoader(Rhino3dmLoader, filepath, (loader) => {
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
  })

  const matRef = useRef<Record<string, THREE.MeshPhysicalMaterial[]>>({
    Metal: [],
    Gem: [],
  })

  const Metal = useControls('Metal', ringMaterialGroups[0].controls as any)
  const Gem = useControls('Gem', ringMaterialGroups[1].controls as any)

  const controlValues = {
    Metal,
    Gem,
  } as any

  // ringMaterialGroups에서 기본값 추출하는 헬퍼
  const getDefaults = (key: string) => {
    const group = ringMaterialGroups.find((g) => g.key === key)
    if (!group) return {}
    return Object.fromEntries(Object.entries(group.controls).map(([k, v]) => [k, (v as any).value]))
  }

  // 새로운 재질 생성 (ringMaterialGroups 기본값 사용 - 단일 소스)
  const gemMaterial = useMemo(() => {
    const defaults = getDefaults('Gem')
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(defaults.color),
      metalness: defaults.metalness,
      roughness: defaults.roughness,
      ior: defaults.ior,
      reflectivity: defaults.reflectivity,
      transmission: defaults.transmission,
      thickness: defaults.thickness,
      opacity: defaults.opacity,
      transparent: true,
      attenuationColor: new THREE.Color(defaults.attenuationColor),
      attenuationDistance: defaults.attenuationDistance,
      clearcoat: defaults.clearcoat,
      clearcoatRoughness: defaults.clearcoatRoughness,
      specularColor: new THREE.Color(defaults.specularColor),
      specularIntensity: defaults.specularIntensity,
      envMapIntensity: 1,
    })
    mat.name = 'Gem'
    return mat
  }, [])

  const metalMaterial = useMemo(() => {
    const defaults = getDefaults('Metal')
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(defaults.color),
      metalness: defaults.metalness,
      roughness: defaults.roughness,
      specularColor: new THREE.Color(defaults.specularColor),
      specularIntensity: defaults.specularIntensity,
      envMapIntensity: 1,
    })
    mat.name = 'Metal'
    return mat
  }, [])

  // 모델 로드 후 재질 할당
  useEffect(() => {
    if (!modelObj) return
    matRef.current = { Metal: [], Gem: [] }

    modelObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const originalMaterial = child.material

        if (originalMaterial instanceof THREE.MeshPhysicalMaterial) {
          console.log('Ring material:', originalMaterial.name)

          // 재질 이름에 따라 새로 생성한 재질 할당
          if (originalMaterial.name === 'Gem') {
            child.material = gemMaterial
            matRef.current['Gem'].push(gemMaterial)
          } else if (originalMaterial.name === 'Metal') {
            child.material = metalMaterial
            matRef.current['Metal'].push(metalMaterial)
          }
        }
      }
    })

    if (onLoadComplete) {
      onLoadComplete()
    }
  }, [modelObj, onLoadComplete, gemMaterial, metalMaterial])

  useEffect(() => {
    ringMaterialGroups.forEach(({ key }) => {
      const materials = matRef.current[key] ?? []
      const values = controlValues[key]
      // if (key === 'Gem') {
      //   console.log('Gem values:', values)
      // }
      materials.forEach((material) => {
        if (material) {
          applyMaterialSettings(material, values)
        }
      })
    })
  }, [Metal, Gem])

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} {...props}>
      <primitive object={modelObj} />
    </group>
  )
}
