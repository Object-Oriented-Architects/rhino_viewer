// Jewel_test 컨피규레이터 프리셋 — 버튼 대신 Leva select로 고르면 해당 슬라이더 값을 덮어쓴다.
// '직접 설정'은 아무것도 덮어쓰지 않는 자리표시 (config 값이 프리셋과 다른 페이지용).

export const CUSTOM_PRESET = 'custom'

export interface GemPreset {
  label: string
  color: string
  ior: number
  /** DiamondMaterial aberrationStrength */
  dispersion: number
  absorption: number
}

export const GEM_PRESETS = {
  diamond: { label: '화이트 다이아', color: '#ffffff', ior: 2.417, dispersion: 0.024, absorption: 0.08 },
  fancy_blue: { label: '팬시 블루', color: '#5cb8ff', ior: 2.417, dispersion: 0.025, absorption: 0.72 },
  fancy_pink: { label: '팬시 핑크', color: '#ff7eb6', ior: 2.417, dispersion: 0.024, absorption: 0.68 },
  canary_yellow: { label: '카나리 옐로우', color: '#ffe047', ior: 2.417, dispersion: 0.023, absorption: 0.65 },
  ruby: { label: '버마 루비', color: '#ff1e42', ior: 1.77, dispersion: 0.018, absorption: 1.35 },
  emerald: { label: '콜롬비아 에메랄드', color: '#22e584', ior: 1.585, dispersion: 0.014, absorption: 1.2 },
} satisfies Record<string, GemPreset>

export type GemPresetKey = keyof typeof GEM_PRESETS

export interface MetalPreset {
  label: string
  color: string
  roughness: number
  metalness: number
  clearcoat: number
}

export const METAL_PRESETS = {
  platinum: { label: '플래티넘', color: '#f2f5f8', roughness: 0.055, metalness: 1.0, clearcoat: 0.25 },
  yellow_gold: { label: '18K 옐로우골드', color: '#ffcf6b', roughness: 0.065, metalness: 1.0, clearcoat: 0.2 },
  rose_gold: { label: '18K 로즈골드', color: '#f7b099', roughness: 0.065, metalness: 1.0, clearcoat: 0.2 },
} satisfies Record<string, MetalPreset>

export type MetalPresetKey = keyof typeof METAL_PRESETS

/** Leva select options: { 표시 이름: 키 } */
export const presetOptions = (presets: Record<string, { label: string }>) => ({
  '직접 설정': CUSTOM_PRESET,
  ...Object.fromEntries(Object.entries(presets).map(([key, preset]) => [preset.label, key])),
})

/**
 * pavé(작은 보조석)는 프리셋·광학 슬라이더와 무관하게 항상 화이트 다이아 — Jewel_test 보조석 값.
 * 반사 횟수·분산 모드만 Leva(paveBounces/paveQuality)로 조절한다.
 */
export const PAVE_STONE = {
  color: '#ffffff',
  ior: 2.417,
  aberrationStrength: 0.02,
  absorptionFactor: 0.05,
  envMapIntensity: 1.35,
}
