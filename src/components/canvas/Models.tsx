'use client'

import { ShadowAlpha, useGLTF, MeshRefractionMaterial, useEnvironment, CubeCamera } from '@react-three/drei'
import { useLoader, useThree } from '@react-three/fiber'
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo, useRef, useState, useEffect } from 'react'
import { Line, useCursor, MeshDistortMaterial } from '@react-three/drei'
import { useRouter } from 'next/navigation'
import { folder, useControls } from 'leva'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

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

// Ring Metal 재질 설정
const ringMetalControls = {
  color: { value: '#ffffff' },
  metalness: { value: 1.0, min: 0, max: 1, step: 0.01 },
  roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
  envMapIntensity: { value: 4, min: 0, max: 10, step: 0.1 },
  specularColor: { value: '#ffffff' },
  specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
}

// 환경맵 옵션
const envMapOptions = {
  ring: '/model/ring/env.hdr',
  glasses: '/model/glasses/breezm.hdr',
  polyhaven: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/peppermint_powerplant_2_1k.hdr',
}

export function Ring({ onLoadComplete, ...props }) {
  const filepath = '/model/ring/ring.3dm'

  // 모든 환경맵 미리 로드
  const envMapRing = useLoader(RGBELoader, envMapOptions.ring)
  const envMapGlasses = useLoader(RGBELoader, envMapOptions.glasses)
  const envMapPolyhaven = useLoader(RGBELoader, envMapOptions.polyhaven)

  // 환경맵 매핑 설정
  envMapRing.mapping = THREE.EquirectangularReflectionMapping
  envMapGlasses.mapping = THREE.EquirectangularReflectionMapping
  envMapPolyhaven.mapping = THREE.EquirectangularReflectionMapping

  const envMaps = useMemo(
    () => ({
      ring: envMapRing,
      glasses: envMapGlasses,
      polyhaven: envMapPolyhaven,
    }),
    [envMapRing, envMapGlasses, envMapPolyhaven],
  )

  const modelObj = useLoader(Rhino3dmLoader, filepath, (loader) => {
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
  })

  // Gem 메시 정보 저장
  const [gemMeshes, setGemMeshes] = useState<
    { geometry: THREE.BufferGeometry; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }[]
  >([])

  // Metal 재질 컨트롤
  const Metal = useControls('Metal', ringMetalControls as any)

  // Gem (MeshRefractionMaterial) 컨트롤
  const Gem = useControls('Gem', {
    // 환경맵 선택
    envMap: { value: 'polyhaven', options: ['ring', 'glasses', 'polyhaven'] },
    color: { value: '#ffffff' },
    // 다이아몬드: 2.4, 루비: 1.76
    ior: { value: 2.4, min: 1, max: 5, step: 0.01 },
    // 빛 반사 횟수 (높을수록 사실적, 성능 저하)
    bounces: { value: 3, min: 0, max: 10, step: 1 },
    // 프레넬 효과
    fresnel: { value: 0, min: 0, max: 1, step: 0.01 },
    // 색수차 (무지개 효과) 강도
    aberrationStrength: { value: 0.02, min: 0, max: 0.2, step: 0.001 },
    // 빠른 색수차 (성능 최적화)
    fastChroma: { value: true },
  })

  // 선택된 환경맵
  const selectedEnvMap = envMaps[Gem.envMap as keyof typeof envMaps]

  // Metal 재질
  const metalMaterial = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(Metal.color),
      metalness: Metal.metalness,
      roughness: Metal.roughness,
      specularColor: new THREE.Color(Metal.specularColor),
      specularIntensity: Metal.specularIntensity,
      envMapIntensity: Metal.envMapIntensity,
    })
    mat.name = 'Metal'
    return mat
  }, [])

  // Metal 재질 업데이트
  useEffect(() => {
    metalMaterial.color.set(Metal.color)
    metalMaterial.metalness = Metal.metalness
    metalMaterial.roughness = Metal.roughness
    metalMaterial.envMapIntensity = Metal.envMapIntensity
    metalMaterial.specularColor.set(Metal.specularColor)
    metalMaterial.specularIntensity = Metal.specularIntensity
    metalMaterial.needsUpdate = true
  }, [Metal, metalMaterial])

  // 모델에서 Gem geometry 추출
  useEffect(() => {
    if (!modelObj) return

    const meshes: { geometry: THREE.BufferGeometry; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }[] =
      []

    modelObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const originalMaterial = child.material

        if (originalMaterial instanceof THREE.MeshPhysicalMaterial) {
          if (originalMaterial.name === 'Gem') {
            // Gem 메시 정보 저장 (로컬 좌표)
            meshes.push({
              geometry: child.geometry,
              position: child.position.clone(),
              rotation: child.rotation.clone(),
              scale: child.scale.clone(),
            })
            // 원본 메시 숨기기
            child.visible = false
          } else if (originalMaterial.name === 'Metal') {
            child.material = metalMaterial
          }
        }
      }
    })

    setGemMeshes(meshes)

    if (onLoadComplete) {
      onLoadComplete()
    }
  }, [modelObj, onLoadComplete, metalMaterial])

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} {...props}>
      <primitive object={modelObj} />
      {/* MeshRefractionMaterial로 Gem 렌더링 */}
      {gemMeshes.map((meshInfo, index) => (
        <mesh
          key={index}
          geometry={meshInfo.geometry}
          position={meshInfo.position}
          rotation={meshInfo.rotation}
          scale={meshInfo.scale}
        >
          <MeshRefractionMaterial
            envMap={selectedEnvMap}
            color={Gem.color}
            ior={Gem.ior}
            bounces={Gem.bounces}
            fresnel={Gem.fresnel}
            aberrationStrength={Gem.aberrationStrength}
            fastChroma={Gem.fastChroma}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
