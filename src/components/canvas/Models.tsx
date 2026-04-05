'use client'

import { ShadowAlpha, useGLTF, MeshRefractionMaterial, useEnvironment } from '@react-three/drei'
import { useLoader, useThree } from '@react-three/fiber'
import { useBloomContext } from './View'
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

// 메시 정보 타입
interface MeshInfo {
  geometry: THREE.BufferGeometry
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
}

interface MetalDefaults {
  color?: string
  brightness?: number
  metalness?: number
  roughness?: number
  envMapIntensity?: number
  flatShading?: boolean
}

interface DiamondDefaults {
  color?: string
  ior?: number
  bounces?: number
  fresnel?: number
  aberrationStrength?: number
}

interface TransformDefaults {
  scale?: number
  positionY?: number
  rotationX?: number
}

interface ProngDefaults {
  enabled?: boolean
  color?: string
  brightness?: number
  metalness?: number
  roughness?: number
  envMapIntensity?: number
}

interface RingProps {
  onLoadComplete?: () => void
  onControlsChange?: () => void
  modelPath?: string
  shadowTexturePath?: string
  metalDefaults?: MetalDefaults
  prongDefaults?: ProngDefaults
  diamondDefaults?: DiamondDefaults
  transformDefaults?: TransformDefaults
  [key: string]: any
}

export function Ring({
  onLoadComplete,
  onControlsChange,
  modelPath = '/model/ring-260203/Ring_Mesh_0203.3dm',
  shadowTexturePath = '/model/ring-260203/shadow.jpg',
  metalDefaults = {},
  prongDefaults = {},
  diamondDefaults = {},
  transformDefaults = {},
  ...props
}: RingProps) {
  // 씬의 환경맵 사용 (Common에서 설정한 HDR - Leva로 제어 가능)
  const { scene, gl } = useThree()

  // SelectiveBloom context
  const bloomContext = useBloomContext()

  // 3dm 모델 로드 - geometry만 사용
  const modelObj = useLoader(Rhino3dmLoader, modelPath, (loader) => {
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
  })

  // 텍스처들을 useMemo로 로드 (깜빡임 방지)
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()

    // Shadow 텍스처 로드
    const shadow = loader.load(shadowTexturePath)
    shadow.colorSpace = THREE.SRGBColorSpace

    // Shadow Alpha 텍스처 (glasses에서 가져옴)
    const shadowAlpha = loader.load('/model/glasses/Breezm_Pbr_shadow_embedded_files/gradient_02.jpg')

    return {
      shadow,
      shadowAlpha,
    }
  }, [])

  // 그림자용 커스텀 ShaderMaterial (배경색 무관하게 작동)
  const shadowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        shadowMap: { value: textures.shadow },
        alphaMap: { value: textures.shadowAlpha },
        shadowOpacity: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D shadowMap;
        uniform sampler2D alphaMap;
        uniform float shadowOpacity;
        varying vec2 vUv;
        void main() {
          float shadow = 1.0 - texture2D(shadowMap, vUv).r;
          float alpha = texture2D(alphaMap, vUv).r;
          gl_FragColor = vec4(0.0, 0.0, 0.0, shadow * alpha * shadowOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
  }, [textures])

  // Metal 기본값 추출
  const {
    color: metalColor = '#ffffff',
    brightness: metalBrightness = 1.0,
    metalness: metalMetalness = 1.0,
    roughness: metalRoughness = 0.1,
    envMapIntensity: metalEnvMapIntensity = 0.8,
    flatShading: metalFlatShading = false,
  } = metalDefaults

  // Prong 기본값 추출
  const {
    enabled: prongEnabled = false,
    color: prongColor = '#B76E79', // 로즈골드
    brightness: prongBrightness = 1.0,
    metalness: prongMetalness = 1.0,
    roughness: prongRoughness = 0.15,
    envMapIntensity: prongEnvMapIntensity = 0.8,
  } = prongDefaults

  // Diamond 기본값 추출
  const {
    color: diamondColor = '#ffffff',
    ior: diamondIor = 2.41,
    bounces: diamondBounces = 4,
    fresnel: diamondFresnel = 0.1,
    aberrationStrength: diamondAberration = 0.044,
  } = diamondDefaults

  // Transform 기본값 추출
  const {
    scale: defaultScale = 0.1,
    positionY: defaultPositionY = 0,
    rotationX: defaultRotationX = -90,
  } = transformDefaults

  // Metal 컨트롤
  const metalControls = useControls('Metal', {
    color: { value: metalColor },
    brightness: { value: metalBrightness, min: 0.5, max: 2.0, step: 0.01 },
    metalness: { value: metalMetalness, min: 0, max: 1, step: 0.01 },
    roughness: { value: metalRoughness, min: 0, max: 1, step: 0.01 },
    envMapIntensity: { value: metalEnvMapIntensity, min: 0, max: 2, step: 0.01 },
    flatShading: { value: metalFlatShading },
  })

  // Prong 컨트롤 (별도 재질)
  const prongControls = useControls('Prong', {
    enabled: { value: prongEnabled },
    color: { value: prongColor },
    brightness: { value: prongBrightness, min: 0.5, max: 2.0, step: 0.01 },
    metalness: { value: prongMetalness, min: 0, max: 1, step: 0.01 },
    roughness: { value: prongRoughness, min: 0, max: 1, step: 0.01 },
    envMapIntensity: { value: prongEnvMapIntensity, min: 0, max: 2, step: 0.01 },
  })

  // Diamond 컨트롤
  const gemControls = useControls('Diamond', {
    color: { value: diamondColor },
    ior: { value: diamondIor, min: 1.5, max: 3, step: 0.01 },
    bounces: { value: diamondBounces, min: 1, max: 10, step: 1 },
    fresnel: { value: diamondFresnel, min: 0, max: 100, step: 0.1 },
    'aberration (×1000)': { value: diamondAberration * 1000, min: 1, max: 100, step: 1 },
    envMapResolution: { value: 512, options: { '128': 128, '256': 256, '512': 512, '1024': 1024 } },
  })

  // HDR 환경맵을 CubeTexture로 변환 (CubeCamera 없이 순수 환경만 사용)
  const cubeTexture = useMemo(() => {
    if (!scene.environment) return null
    const cubeRT = new THREE.WebGLCubeRenderTarget(gemControls.envMapResolution)
    cubeRT.fromEquirectangularTexture(gl, scene.environment)
    return cubeRT.texture
  }, [scene.environment, gl, gemControls.envMapResolution])

  // Shadow 컨트롤
  const shadowControls = useControls('Shadow', {
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },
  })

  // Transform 컨트롤
  const transformControls = useControls('Transform', {
    scale: { value: defaultScale, min: 0.001, max: 100, step: 0.001 },
    positionY: { value: defaultPositionY, min: -10, max: 10, step: 0.1 },
    rotationX: { value: defaultRotationX, min: -180, max: 180, step: 1 },
  })

  // shadowOpacity Leva 값 동기화
  useEffect(() => {
    shadowMaterial.uniforms.shadowOpacity.value = shadowControls.opacity
  }, [shadowControls.opacity, shadowMaterial])

  // Leva 컨트롤 변경 시 accumulation 초기화 알림
  useEffect(() => {
    onControlsChange?.()
  }, [metalControls, prongControls, gemControls, transformControls, onControlsChange])

  // Metal 재질 생성 (PBR - 씬 환경맵 자동 사용)
  // toneMapped: true로 bloom에서 제외 (1.0 이하로 클램프)
  const metalMaterial = useMemo(() => {
    const color = new THREE.Color(metalControls.color)
    color.multiplyScalar(metalControls.brightness)

    return new THREE.MeshStandardMaterial({
      color: color,
      metalness: metalControls.metalness,
      roughness: metalControls.roughness,
      envMapIntensity: metalControls.envMapIntensity,
      flatShading: metalControls.flatShading,
      toneMapped: true, // bloom 제외 - HDR 값을 1.0 이하로 클램프
    })
  }, [metalControls])

  // Prong 재질 생성 (로즈골드)
  const prongMaterial = useMemo(() => {
    const color = new THREE.Color(prongControls.color)
    color.multiplyScalar(prongControls.brightness)

    return new THREE.MeshStandardMaterial({
      color: color,
      metalness: prongControls.metalness,
      roughness: prongControls.roughness,
      envMapIntensity: prongControls.envMapIntensity,
      toneMapped: true,
    })
  }, [prongControls])

  // 모델에서 geometry 추출 (useMemo로 동기 처리 - 깜빡임 방지)
  const processedModel = useMemo(() => {
    if (!modelObj) return null

    const metals: MeshInfo[] = []
    const prongs: MeshInfo[] = []
    const gems: MeshInfo[] = []
    const boundingBox = new THREE.Box3()

    modelObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry
        const materialName = child.material instanceof THREE.Material ? child.material.name : ''
        const meshName = child.name || 'unnamed'

        // 바운딩 박스 확장
        geometry.computeBoundingBox()
        if (geometry.boundingBox) {
          const worldBox = geometry.boundingBox.clone()
          worldBox.applyMatrix4(child.matrixWorld)
          boundingBox.union(worldBox)
        }

        // geometry에 노멀이 없으면 계산
        if (!geometry.attributes.normal) {
          geometry.computeVertexNormals()
        }

        const meshInfo: MeshInfo = {
          geometry: geometry.clone(),
          position: child.position.clone(),
          rotation: child.rotation.clone(),
          scale: child.scale.clone(),
        }

        // 재질 이름 또는 메시 이름으로 분류
        const name = (materialName + meshName).toLowerCase()
        if (
          name.includes('gem') ||
          name.includes('diamond') ||
          name.includes('stone') ||
          name.includes('사용자 지정')
        ) {
          gems.push(meshInfo)
        } else if (name.includes('prong') || name.includes('프롱') || name.includes('claw')) {
          prongs.push(meshInfo)
        } else if (!name.includes('shadow')) {
          metals.push(meshInfo)
        }

        // 원본 메시 숨기기
        child.visible = false
      }
    })

    const center = new THREE.Vector3()
    boundingBox.getCenter(center)

    return {
      metalMeshes: metals,
      prongMeshes: prongs,
      gemMeshes: gems,
      modelCenter: center,
      modelBounds: { min: boundingBox.min.clone(), max: boundingBox.max.clone() },
    }
  }, [modelObj])

  // 로딩 완료 콜백
  useEffect(() => {
    if (processedModel && onLoadComplete) {
      onLoadComplete()
    }
  }, [processedModel, onLoadComplete])

  if (!processedModel) {
    return null
  }

  const { metalMeshes, prongMeshes, gemMeshes, modelCenter, modelBounds } = processedModel

  return (
    <>
      {/* 바닥 그림자 - 커스텀 셰이더 (배경색 무관) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, (modelBounds.min.z - modelCenter.z) * transformControls.scale, 0]}
        material={shadowMaterial}
      >
        <planeGeometry args={[5, 5]} />
      </mesh>

      <group
        scale={transformControls.scale}
        position={[0, transformControls.positionY, 0]}
        rotation={[THREE.MathUtils.degToRad(transformControls.rotationX), 0, 0]}
        {...props}
      >
        {/* 중심 보정용 내부 그룹 */}
        <group position={[-modelCenter.x, -modelCenter.y, -modelCenter.z]}>
          {/* Metal 메시들 */}
          {metalMeshes.map((meshInfo, index) => (
            <mesh
              key={`metal-${index}`}
              geometry={meshInfo.geometry}
              position={meshInfo.position}
              rotation={meshInfo.rotation}
              scale={meshInfo.scale}
              material={metalMaterial}
            />
          ))}

          {/* Prong 메시들 - 별도 재질 사용 시 로즈골드, 아니면 Metal 재질 */}
          {prongMeshes.map((meshInfo, index) => (
            <mesh
              key={`prong-${index}`}
              geometry={meshInfo.geometry}
              position={meshInfo.position}
              rotation={meshInfo.rotation}
              scale={meshInfo.scale}
              material={prongControls.enabled ? prongMaterial : metalMaterial}
            />
          ))}

          {/* Gem 메시들 - 순수 HDR CubeTexture로 굴절 */}
          {cubeTexture &&
            gemMeshes.map((meshInfo, index) => (
              <mesh
                key={`gem-${index}`}
                geometry={meshInfo.geometry}
                position={meshInfo.position}
                rotation={meshInfo.rotation}
                scale={meshInfo.scale}
                userData={{ isGem: true }}
                ref={(mesh) => {
                  if (mesh && bloomContext) {
                    bloomContext.registerMesh(mesh)
                  }
                }}
              >
                <MeshRefractionMaterial
                  envMap={cubeTexture}
                  color={gemControls.color}
                  ior={gemControls.ior}
                  bounces={gemControls.bounces}
                  fresnel={gemControls.fresnel}
                  aberrationStrength={gemControls['aberration (×1000)'] / 1000}
                  fastChroma={false}
                  toneMapped={false}
                />
              </mesh>
            ))}
        </group>
      </group>
    </>
  )
}
