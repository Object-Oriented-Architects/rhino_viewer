// 페이지별 Leva 설정 타입 정의

import type { StudioPreset } from '@/components/canvas/gem/studioEnv'
import type { DispersionMode } from '@/components/canvas/gem/DiamondMaterial'
import type { CUSTOM_PRESET, GemPresetKey, MetalPresetKey } from '@/components/canvas/gem/presets'

export interface ViewConfig {
  fov: number
  backgroundColor?: string
  /** 배경 비네팅 — 변 중앙에서 배경색을 이 비율만큼 어둡게 (중앙 = backgroundColor, r² 감쇠) */
  backgroundVignette?: number
  /** 렌더 스케일(dpr). 높일수록 SSAA 효과로 작은 보석 자글거림 ↓ (GPU 비용 ↑) */
  dpr?: number
  /** 시간축 평균(EMA) 강도 0~0.95. 프레임 간 popping ↓ / 잔상 ↑. 0=끔 */
  temporalSmoothing?: number
  /** 톤매핑 노출 (톤매핑을 후처리로 거는 페이지에서 사용) */
  exposure?: number
  /** 후처리 톤매핑 곡선 — 기본 ACES. neutral(Khronos)은 하이라이트만 눌러 오프라인 렌더(선형)에 가깝다 */
  toneMapping?: 'aces' | 'neutral' | 'linear'
}

export interface LightConfig {
  envMap: 'hdr' | 'threejs studio'
  /** 설정 시 HDR 대신 절차적 보석 촬영 스튜디오 환경을 기본으로 사용 (GemEnvironment 페이지) */
  studioPreset?: StudioPreset
  /** 보석 레이트레이서 전용 환경 (없으면 studioPreset/hdr과 같음) — 흰 배경 금속 환경에서 보석 반짝임을 살릴 때 */
  gemStudioPreset?: StudioPreset
  environmentIntensity: number
  envRotX: number
  envRotY: number
  envRotZ: number
  ambientLightIntensity: number
  directionalLightIntensity: number
  background: boolean
}

export interface MetalConfig {
  /** Leva 프리셋 select 초기 표시값 (값은 아래 필드가 정함) */
  preset?: MetalPresetKey | typeof CUSTOM_PRESET
  color: string
  brightness: number
  metalness: number
  roughness: number
  clearcoat?: number
  clearcoatRoughness?: number
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
  /** Leva 프리셋 select 초기 표시값 (값은 아래 필드가 정함) */
  preset?: GemPresetKey | typeof CUSTOM_PRESET
  color: string
  ior: number
  // DiamondMaterial (BVH 레이트레이싱) — gemMaterial='refraction'
  /** 센터석 내부 반사 횟수 (최대 7) */
  bounces: number
  /** 분산 폭 — 굴절률을 ior ± 이 값으로 벌림 (다이아몬드 ≈ 0.022~0.024). physical 비교 모드의 dispersion도 이 값 */
  aberrationStrength: number
  dispersionMode?: DispersionMode
  /** Beer-Lambert 흡수 배율 — 색 있는 보석의 깊이감 */
  absorption?: number
  /** 겉면 반사율 f0 가산값 */
  fresnelBias?: number
  /** 핀라이트 반사 추가 증폭 */
  sparkle?: number
  /** pavé(작은 스톤) 반사 횟수·분산 모드 — 비용 절감용 */
  paveBounces?: number
  paveDispersionMode?: DispersionMode
  /** pavé 픽셀당 진입 광선 수 (1–4) — 회전 시 자글거림 완화, 비용은 pavé 픽셀에서만 배수로 증가 */
  paveSamples?: number
  /** pavé가 보는 환경 밝기 (기본 PAVE_STONE 1.35) */
  paveEnvMapIntensity?: number
  /** 금속 받침 가림 정도 (0 = 끔) — 받침·프롱 쪽으로 빠져나간 빛을 환경 대신 settingColor로 (오프라인 렌더의 pavé 대비) */
  settingOcclusion?: number
  /** 받침 속에 갇힌 빛의 색 (sRGB hex) */
  settingColor?: string
  /** 6밴드 분산 가중치를 채널마다 합 1로 — 원본(Jewel_test) 가중치는 빨강이 8% 많아 흰 빛이 분홍으로 나온다 */
  neutralSpectrum?: boolean
  // MeshPhysicalMaterial 전용 — gemMaterial='physical' 비교용 (optional)
  transmission?: number
  thickness?: number
  roughness?: number
  iridescence?: number
  iridescenceIOR?: number
  attenuationColor?: string
  attenuationDistance?: number
  /** 보석이 보는 환경 밝기 (DiamondMaterial) */
  envMapIntensity?: number
  flatShading?: boolean
}

export interface TransformConfig {
  scale: number
  positionY: number
  rotationX: number
}

export interface BloomConfig {
  enabled: boolean
  intensity: number
  luminanceThreshold: number
  luminanceSmoothing: number
  radius: number
  levels?: number
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

export interface GradeConfig {
  /** -1~1. 오프라인 렌더의 대비(깊은 다크+블로운 하이라이트) 근사용 후처리 */
  contrast: number
  brightness: number
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

/**
 * 오프라인 참고 렌더 한 장의 구도 — 이미지를 누르면 뷰어가 이 카메라·조명으로 바뀐다.
 * 반지를 눕혀 찍은 렌더는 카메라 up을 "눕힌 반지가 놓인 세계의 위 방향"(반지 기준)으로 두고 환경도 같이 돌린다 —
 * 반지를 눕히고 카메라·조명은 그대로 둔 것과 동치이며, 궤도 회전도 그 위 방향을 축으로 돈다
 */
export interface ReferenceView {
  image: string
  cameraPosition: [number, number, number]
  cameraUp: [number, number, number]
  /** 환경 회전 XYZ(도) — Light envRotX/Y/Z */
  envRotation: [number, number, number]
}

export interface SceneConfig {
  // 모델 경로
  modelPath: string
  hdrPath: string
  shadowTexturePath?: string
  /** 바닥 그림자 불투명도 기본값 (미지정 시 1) */
  shadowOpacity?: number

  // 카메라
  cameraPosition: [number, number, number]
  orbitTarget: [number, number, number]
  /** 참고 렌더 구도 목록 — 첫 항목은 cameraPosition·light.envRot과 같은 기본 구도 */
  referenceViews?: ReferenceView[]

  // Leva 기본값
  view: ViewConfig
  light: LightConfig
  metal: MetalConfig
  prong?: ProngConfig
  diamond: DiamondConfig
  transform: TransformConfig
  bloom: BloomConfig
  grade?: GradeConfig
  ao?: AOConfig
  caustics?: CausticsConfig
  shadows?: ShadowsConfig
}
