'use client'

import { useLoader } from '@react-three/fiber'
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'
import * as THREE from 'three'
import { useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { useControls, type useCreateStore } from 'leva'
import { DiamondMaterial, type DiamondMaterialOptions, type DispersionMode } from './gem/DiamondMaterial'
import { splitFacetedStones } from './gem/gemGeometry'
import { bakeSettingOcclusion } from './gem/settingOcclusion'
import { useGemEnv } from './gem/GemEnvironment'
import { CutGemPreview } from './gem/CutGemPreview'
import type { GemCut } from './gem/cutGeometry'
import {
  CUSTOM_PRESET,
  GEM_PRESETS,
  METAL_PRESETS,
  PAVE_STONE,
  presetOptions,
  type GemPresetKey,
  type MetalPresetKey,
} from './gem/presets'

// 가장 큰 스톤 반지름 대비 이 비율 미만이면 pavé — 싼 분산 모드·적은 반사로 추적
const PAVE_RADIUS_RATIO = 0.5

const dispersionModeOptions = { 'Fast (1-ray)': 0, 'RGB (3-ray)': 1, 'Spectral (6-ray)': 2 }

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
  /** Leva 프리셋 select 초기 표시값 — 값 자체는 아래 필드가 정한다 */
  preset?: MetalPresetKey | typeof CUSTOM_PRESET
  color?: string
  brightness?: number
  metalness?: number
  roughness?: number
  clearcoat?: number
  clearcoatRoughness?: number
  envMapIntensity?: number
  flatShading?: boolean
}

interface GemMeshInfo extends MeshInfo {
  pave: boolean
}

interface DiamondDefaults {
  /** Leva 프리셋 select 초기 표시값 — 값 자체는 아래 필드가 정한다 */
  preset?: GemPresetKey | typeof CUSTOM_PRESET
  color?: string
  ior?: number
  // DiamondMaterial (BVH 레이트레이싱)
  bounces?: number
  aberrationStrength?: number
  dispersionMode?: DispersionMode
  absorption?: number
  fresnelBias?: number
  sparkle?: number
  paveBounces?: number
  paveDispersionMode?: DispersionMode
  /** pavé 픽셀당 진입 광선 수 (1–4) — 회전 시 자글거림 완화 */
  paveSamples?: number
  /** pavé 환경 mip 레벨 — 핀라이트 경계를 부드럽게 해 회전 시 깜빡임 완화 */
  paveEnvBlur?: number
  /** pavé가 보는 환경 밝기 (기본 PAVE_STONE 값) */
  paveEnvMapIntensity?: number
  /** 금속 받침 가림 정도 (0 = 끔) — 받침·프롱 쪽으로 나간 빛을 settingColor로 */
  settingOcclusion?: number
  settingColor?: string
  /** 6밴드 분산 가중치를 채널마다 합 1로 (원본은 빨강 +8%) */
  neutralSpectrum?: boolean
  // MeshPhysicalMaterial
  transmission?: number
  thickness?: number
  roughness?: number
  iridescence?: number
  iridescenceIOR?: number
  attenuationColor?: string
  attenuationDistance?: number
  envMapIntensity?: number
  flatShading?: boolean
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
  modelPath?: string
  /** 바닥 그림자 기본 불투명도 (Leva Shadow.opacity 초기값) */
  shadowOpacity?: number
  shadowTexturePath?: string
  /** 바닥 그림자 판 표시 — 판은 반지가 똑바로 선 바닥 기준이라 반지를 눕혀 보는 구도에선 끈다 */
  showShadow?: boolean
  metalDefaults?: MetalDefaults
  prongDefaults?: ProngDefaults
  diamondDefaults?: DiamondDefaults
  transformDefaults?: TransformDefaults
  /**
   * gem 렌더링 방식. 'refraction'=DiamondMaterial(BVH 레이트레이싱 — 내부 다중반사·분산, 상위 GemEnvironment 필요),
   * 'physical'=센터석만 three.js MeshPhysicalMaterial(ray tracing 없음, 비교용) — pavé는 레이트레이싱 유지 (Jewel_test 비교 모드)
   */
  gemMaterial?: 'refraction' | 'physical'
  /** Metal·Prong·Diamond·Shadow·Transform 컨트롤을 담을 Leva store — 없으면 전역 Leva 패널 */
  levaStore?: ReturnType<typeof useCreateStore>
  /** 'ring'=모델, 컷 이름=모델 대신 이상적인 컷 하나만 미리보기 */
  view?: 'ring' | GemCut
  /** 바뀔 때마다 센터석 분산 모드·반사 횟수와 pavé 샘플 수를 프로필 값으로 덮어씀 (Jewel_test 품질 프로필 + pavé SSAA) */
  qualityTier?: 'desktop' | 'mobile'
  [key: string]: any
}

export function Ring({
  onLoadComplete,
  modelPath = '/model/ring-260203/Ring_Mesh_0203.3dm',
  shadowOpacity = 1,
  shadowTexturePath = '/model/ring-260203/shadow.jpg',
  showShadow = true,
  metalDefaults = {},
  prongDefaults = {},
  diamondDefaults = {},
  transformDefaults = {},
  gemMaterial = 'refraction',
  view = 'ring',
  qualityTier,
  levaStore,
  ...props
}: RingProps) {
  const levaSettings = { store: levaStore }
  // 보석용 cube 환경 (상위 GemEnvironment) — 금속은 씬 환경맵을 그대로 사용
  const gemEnv = useGemEnv()

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
    preset: metalPreset = CUSTOM_PRESET,
    color: metalColor = '#ffffff',
    brightness: metalBrightness = 1.0,
    metalness: metalMetalness = 1.0,
    roughness: metalRoughness = 0.1,
    clearcoat: metalClearcoat = 0,
    clearcoatRoughness: metalClearcoatRoughness = 0.05,
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
    preset: diamondPreset = CUSTOM_PRESET,
    color: diamondColor = '#ffffff',
    ior: diamondIor = 2.417,
    bounces: diamondBounces = 5,
    aberrationStrength: diamondAberration = 0.024,
    dispersionMode: diamondDispersionMode = 2,
    absorption: diamondAbsorption = 0.08,
    fresnelBias: diamondFresnelBias = 0.04,
    sparkle: diamondSparkle = 0.45,
    paveBounces: diamondPaveBounces = 3,
    paveDispersionMode: diamondPaveDispersionMode = 0,
    paveSamples: diamondPaveSamples = 4,
    paveEnvBlur: diamondPaveEnvBlur = 0,
    paveEnvMapIntensity: diamondPaveEnvMapIntensity = PAVE_STONE.envMapIntensity,
    settingOcclusion: diamondSettingOcclusion = 0,
    settingColor: diamondSettingColor = '#202020',
    neutralSpectrum: diamondNeutralSpectrum = false,
    transmission: diamondTransmission = 1.0,
    thickness: diamondThickness = 0.5,
    roughness: diamondRoughness = 0.0,
    iridescence: diamondIridescence = 0.3,
    iridescenceIOR: diamondIridescenceIOR = 2.4,
    attenuationColor: diamondAttenuationColor = '#ffffff',
    attenuationDistance: diamondAttenuationDistance = 1.0,
    envMapIntensity: diamondEnvMapIntensity = 1.4,
    flatShading: diamondFlatShading = false,
  } = diamondDefaults

  // Transform 기본값 추출
  const {
    scale: defaultScale = 0.1,
    positionY: defaultPositionY = 0,
    rotationX: defaultRotationX = -90,
  } = transformDefaults

  // Metal 컨트롤
  const [metalControls, setMetalControls] = useControls('Metal', () => ({
    // 프리셋 선택 = 아래 슬라이더 값 덮어쓰기 (Jewel_test 귀금속 스와치)
    preset: {
      value: metalPreset,
      options: presetOptions(METAL_PRESETS),
      onChange: (key: string, _path: string, { initial }: { initial: boolean }) => {
        if (initial || key === CUSTOM_PRESET) return
        const { color, roughness, metalness, clearcoat } = METAL_PRESETS[key as MetalPresetKey]
        setMetalControls({ color, roughness, metalness, clearcoat, brightness: 1 })
      },
    },
    color: { value: metalColor },
    brightness: { value: metalBrightness, min: 0.5, max: 2.0, step: 0.01 },
    metalness: { value: metalMetalness, min: 0, max: 1, step: 0.01 },
    roughness: { value: metalRoughness, min: 0, max: 1, step: 0.01 },
    clearcoat: { value: metalClearcoat, min: 0, max: 1, step: 0.01 },
    clearcoatRoughness: { value: metalClearcoatRoughness, min: 0, max: 1, step: 0.01 },
    envMapIntensity: { value: metalEnvMapIntensity, min: 0, max: 2, step: 0.01 },
    flatShading: { value: metalFlatShading },
  }), levaSettings)

  // Prong 컨트롤 (별도 재질)
  const prongControls = useControls('Prong', {
    enabled: { value: prongEnabled },
    color: { value: prongColor },
    brightness: { value: prongBrightness, min: 0.5, max: 2.0, step: 0.01 },
    metalness: { value: prongMetalness, min: 0, max: 1, step: 0.01 },
    roughness: { value: prongRoughness, min: 0, max: 1, step: 0.01 },
    envMapIntensity: { value: prongEnvMapIntensity, min: 0, max: 2, step: 0.01 },
  }, levaSettings)

  // Diamond 컨트롤 — 센터석 기준 (pavé는 PAVE_STONE 고정 + 반사/품질만). refraction / physical 양쪽 필드 동시 노출
  const [gemControls, setGemControls] = useControls('Diamond', () => ({
    // 프리셋 선택 = 색·굴절률·분산·흡수 덮어쓰기 (Jewel_test 보석 스와치)
    preset: {
      value: diamondPreset,
      options: presetOptions(GEM_PRESETS),
      onChange: (key: string, _path: string, { initial }: { initial: boolean }) => {
        if (initial || key === CUSTOM_PRESET) return
        const { color, ior, dispersion, absorption } = GEM_PRESETS[key as GemPresetKey]
        setGemControls({ color, ior, aberration: dispersion, absorption })
      },
    },
    color: { value: diamondColor },
    ior: { value: diamondIor, min: 1.0, max: 3, step: 0.005 },
    // 분산 — refraction은 굴절률 폭, physical은 MeshPhysicalMaterial.dispersion (Jewel_test 슬라이더와 동일하게 공유)
    aberration: { value: diamondAberration, min: 0, max: 0.06, step: 0.001, label: 'dispersion (fire)' },
    // --- Refraction (gemMaterial='refraction'에서만 반영) ---
    bounces: { value: diamondBounces, min: 1, max: 7, step: 1 },
    quality: { value: diamondDispersionMode, options: dispersionModeOptions },
    absorption: { value: diamondAbsorption, min: 0, max: 2, step: 0.01 },
    fresnelBias: { value: diamondFresnelBias, min: 0, max: 0.3, step: 0.005 },
    sparkle: { value: diamondSparkle, min: 0, max: 2, step: 0.01 },
    paveBounces: { value: diamondPaveBounces, min: 1, max: 7, step: 1 },
    paveQuality: { value: diamondPaveDispersionMode, options: dispersionModeOptions },
    paveSamples: { value: diamondPaveSamples, min: 1, max: 4, step: 1 },
    paveEnvBlur: { value: diamondPaveEnvBlur, min: 0, max: 6, step: 0.1 },
    paveEnvMapIntensity: { value: diamondPaveEnvMapIntensity, min: 0, max: 5, step: 0.01, label: 'pave envMapIntensity' },
    settingOcclusion: { value: diamondSettingOcclusion, min: 0, max: 1, step: 0.01, label: 'setting occlusion' },
    settingColor: { value: diamondSettingColor, label: 'setting color' },
    // --- Physical (gemMaterial='physical'에서만 반영) ---
    transmission: { value: diamondTransmission, min: 0, max: 1, step: 0.01 },
    thickness: { value: diamondThickness, min: 0, max: 5, step: 0.01 },
    roughness: { value: diamondRoughness, min: 0, max: 1, step: 0.01 },
    iridescence: { value: diamondIridescence, min: 0, max: 1, step: 0.01 },
    iridescenceIOR: { value: diamondIridescenceIOR, min: 1, max: 3, step: 0.01 },
    attenuationColor: { value: diamondAttenuationColor },
    attenuationDistance: { value: diamondAttenuationDistance, min: 0.01, max: 10, step: 0.01 },
    envMapIntensity: { value: diamondEnvMapIntensity, min: 0, max: 5, step: 0.01 },
    flatShading: { value: diamondFlatShading },
  }), levaSettings)

  // 품질 프로필이 바뀔 때만 센터석 값을 덮어씀 — 그 뒤 사용자가 슬라이더를 만지면 그대로 둔다
  const appliedQualityTier = useRef<string>()
  useEffect(() => {
    if (!qualityTier || appliedQualityTier.current === qualityTier) return
    appliedQualityTier.current = qualityTier
    // pavé 서브픽셀 샘플은 GPU 시간을 크게 늘려(실측 7.4→12.4ms) 모바일에선 끈다
    setGemControls(
      qualityTier === 'mobile'
        ? { quality: 1, bounces: 4, paveSamples: 1 }
        : { quality: 2, bounces: 5, paveSamples: 4 },
    )
  }, [qualityTier, setGemControls])

  // 센터석 — 모델의 센터석과 컷 미리보기가 공유
  const centerGemOptions = useMemo<DiamondMaterialOptions>(
    () => ({
      color: gemControls.color,
      ior: gemControls.ior,
      aberrationStrength: gemControls.aberration,
      absorptionFactor: gemControls.absorption,
      envMapIntensity: gemControls.envMapIntensity,
      fresnelBias: gemControls.fresnelBias,
      sparkleIntensity: gemControls.sparkle,
      bounces: gemControls.bounces,
      dispersionMode: gemControls.quality as DispersionMode,
      settingStrength: gemControls.settingOcclusion,
      settingColor: gemControls.settingColor,
      neutralSpectrum: diamondNeutralSpectrum,
    }),
    [gemControls, diamondNeutralSpectrum],
  )
  const paveGemOptions = useMemo<DiamondMaterialOptions>(
    () => ({
      ...PAVE_STONE,
      fresnelBias: gemControls.fresnelBias,
      sparkleIntensity: gemControls.sparkle,
      bounces: gemControls.paveBounces,
      dispersionMode: gemControls.paveQuality as DispersionMode,
      pixelSamples: gemControls.paveSamples,
      envBlur: gemControls.paveEnvBlur,
      envMapIntensity: gemControls.paveEnvMapIntensity,
      settingStrength: gemControls.settingOcclusion,
      settingColor: gemControls.settingColor,
      neutralSpectrum: diamondNeutralSpectrum,
    }),
    [gemControls, diamondNeutralSpectrum],
  )
  const physicalGemProps = useMemo<THREE.MeshPhysicalMaterialParameters>(
    () => ({
      color: gemControls.color,
      ior: gemControls.ior,
      transmission: gemControls.transmission,
      thickness: gemControls.thickness,
      roughness: gemControls.roughness,
      dispersion: gemControls.aberration,
      iridescence: gemControls.iridescence,
      iridescenceIOR: gemControls.iridescenceIOR,
      attenuationColor: gemControls.attenuationColor,
      attenuationDistance: gemControls.attenuationDistance,
      envMapIntensity: gemControls.envMapIntensity,
      flatShading: gemControls.flatShading,
      toneMapped: false,
    }),
    [gemControls],
  )

  // Shadow 컨트롤
  const shadowControls = useControls('Shadow', {
    opacity: { value: shadowOpacity, min: 0, max: 1, step: 0.01 },
  }, levaSettings)

  // Transform 컨트롤
  const transformControls = useControls('Transform', {
    scale: { value: defaultScale, min: 0.001, max: 100, step: 0.001 },
    positionY: { value: defaultPositionY, min: -10, max: 10, step: 0.1 },
    rotationX: { value: defaultRotationX, min: -180, max: 180, step: 1 },
  }, levaSettings)

  // shadowOpacity Leva 값 동기화
  useEffect(() => {
    shadowMaterial.uniforms.shadowOpacity.value = shadowControls.opacity
  }, [shadowControls.opacity, shadowMaterial])

  // Metal 재질 생성 (PBR - 씬 환경맵 자동 사용)
  // toneMapped: true로 bloom에서 제외 (1.0 이하로 클램프)
  const metalMaterial = useMemo(() => {
    const color = new THREE.Color(metalControls.color)
    color.multiplyScalar(metalControls.brightness)

    return new THREE.MeshPhysicalMaterial({
      color: color,
      metalness: metalControls.metalness,
      roughness: metalControls.roughness,
      clearcoat: metalControls.clearcoat,
      clearcoatRoughness: metalControls.clearcoatRoughness,
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
    const gems: GemMeshInfo[] = []
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
          for (const stone of splitFacetedStones(geometry)) {
            gems.push({ ...meshInfo, geometry: stone, pave: false })
          }
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

    const gemRadius = (gem: GemMeshInfo) => {
      gem.geometry.computeBoundingSphere()
      return gem.geometry.boundingSphere!.radius * Math.max(gem.scale.x, gem.scale.y, gem.scale.z)
    }
    const maxGemRadius = Math.max(0, ...gems.map(gemRadius))
    for (const gem of gems) gem.pave = gemRadius(gem) < maxGemRadius * PAVE_RADIUS_RATIO

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

  // 스톤마다 BVH가 따로 필요해 재질도 메시당 1개 — 슬라이더 변경은 uniform만 갱신 (BVH 재빌드 없음)
  const diamondMaterials = useMemo(
    () => (processedModel ? processedModel.gemMeshes.map((gem) => new DiamondMaterial(gem.geometry)) : []),
    [processedModel],
  )
  useEffect(() => () => diamondMaterials.forEach((material) => material.dispose()), [diamondMaterials])

  // 금속 받침 가림 맵 — 켤 때만 굽는다 (스톤마다 방향 1024개를 금속 BVH에 레이캐스트)
  const settingEnabled = gemControls.settingOcclusion > 0
  const settingMaps = useMemo(
    () =>
      processedModel && settingEnabled
        ? bakeSettingOcclusion([...processedModel.metalMeshes, ...processedModel.prongMeshes], processedModel.gemMeshes)
        : [],
    [processedModel, settingEnabled],
  )
  useEffect(() => () => settingMaps.forEach((map) => map.dispose()), [settingMaps])

  useLayoutEffect(() => {
    if (!processedModel || !gemEnv) return
    processedModel.gemMeshes.forEach((gem, index) => {
      diamondMaterials[index]?.update({
        envMap: gemEnv.envMap,
        envRotation: gemEnv.rotation,
        settingOcclusion: settingMaps[index] ?? null,
        ...(gem.pave ? paveGemOptions : centerGemOptions),
      })
    })
  }, [processedModel, diamondMaterials, gemEnv, centerGemOptions, paveGemOptions, settingMaps])

  if (!processedModel) {
    return null
  }

  if (view !== 'ring') {
    return (
      <CutGemPreview
        cut={view}
        options={centerGemOptions}
        physical={gemMaterial === 'physical' ? physicalGemProps : null}
      />
    )
  }

  const { metalMeshes, prongMeshes, gemMeshes, modelCenter, modelBounds } = processedModel

  return (
    <>
      {/* 바닥 그림자 - 커스텀 셰이더 (배경색 무관) */}
      {showShadow && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, (modelBounds.min.z - modelCenter.z) * transformControls.scale, 0]}
          material={shadowMaterial}
        >
          <planeGeometry args={[5, 5]} />
        </mesh>
      )}

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

          {/* Gem 메시들 — PBR 비교는 센터석만 바꾸고 pavé는 레이트레이싱 그대로 (Jewel_test 비교 모드) */}
          {gemMeshes.map((meshInfo, index) => {
            const physical = gemMaterial === 'physical' && !meshInfo.pave
            if (!physical && !gemEnv) return null
            return (
              <mesh
                // 재질 종류가 바뀌면 메시를 새로 만들어 material prop/자식 재질 전환 순서 문제를 피함
                key={`gem-${physical ? 'physical' : 'refraction'}-${index}`}
                geometry={meshInfo.geometry}
                position={meshInfo.position}
                rotation={meshInfo.rotation}
                scale={meshInfo.scale}
                userData={{ isGem: true }}
                material={physical ? undefined : diamondMaterials[index]}
              >
                {physical && (
                  // flatShading 변경은 셰이더 리컴파일이 필요 — key로 재생성 강제
                  <meshPhysicalMaterial key={`gem-physical-${gemControls.flatShading}`} {...physicalGemProps} />
                )}
              </mesh>
            )
          })}
        </group>
      </group>
    </>
  )
}
