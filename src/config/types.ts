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
  bounces: number
  fresnel: number
  aberrationStrength: number
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
}
