// 페이지별 Leva 설정 타입 정의

export interface ViewConfig {
  fov: number
  backgroundColor?: string
}

export interface LightConfig {
  envMap: 'hdr' | 'threejs studio'
  environmentIntensity: number
  envRotX: number
  envRotY: number
  envRotZ: number
  ambientLightIntensity: number
  directionalLightIntensity: number
  background: boolean
}

export interface MetalConfig {
  color: string
  brightness: number
  metalness: number
  roughness: number
  envMapIntensity: number
  flatShading: boolean
}

export interface ProngConfig {
  enabled: boolean // 프롱 별도 재질 사용 여부
  color: string
  brightness: number
  metalness: number
  roughness: number
  envMapIntensity: number
}

export interface DiamondConfig {
  color: string
  ior: number
  // MeshRefractionMaterial (drei) 전용 — /ring 등 legacy 페이지에서 사용
  bounces: number
  fresnel: number
  aberrationStrength: number
  // MeshPhysicalMaterial 전용 — /ring-plusplastic에서 사용 (optional)
  transmission?: number
  thickness?: number
  roughness?: number
  dispersion?: number
  iridescence?: number
  iridescenceIOR?: number
  attenuationColor?: string
  attenuationDistance?: number
  envMapIntensity?: number
  flatShading?: boolean
}

export interface TransformConfig {
  scale: number
  positionY: number
  rotationX: number
}

export interface MotionBloomConfig {
  enabled: boolean
  fadeInSpeed: number
  fadeOutSpeed: number
}

export interface BloomConfig {
  enabled: boolean
  intensity: number
  luminanceThreshold: number
  luminanceSmoothing: number
  radius: number
  levels?: number
  motionBloom?: MotionBloomConfig
}

export interface AOConfig {
  enabled: boolean
  intensity: number
  radius: number
  samples: number
  rings: number
  distanceThreshold: number
  distanceFalloff: number
  rangeThreshold: number
  rangeFalloff: number
  bias: number
}

export interface CausticsConfig {
  enabled: boolean
  color: string
  ior: number
  backfaceIor: number
  worldRadius: number
  intensity: number
  lightSource: [number, number, number]
}

export interface ShadowsConfig {
  frames: number
  color: string
  colorBlend: number
  alphaTest: number
  opacity: number
  scale: number
  lightAmount: number
  lightRadius: number
  lightAmbient: number
  lightBias: number
}

export interface SceneConfig {
  // 모델 경로
  modelPath: string
  hdrPath: string
  shadowTexturePath?: string

  // 카메라
  cameraPosition: [number, number, number]
  orbitTarget: [number, number, number]

  // Leva 기본값
  view: ViewConfig
  light: LightConfig
  metal: MetalConfig
  prong?: ProngConfig
  diamond: DiamondConfig
  transform: TransformConfig
  bloom: BloomConfig
  ao?: AOConfig
  caustics?: CausticsConfig
  shadows?: ShadowsConfig
}
