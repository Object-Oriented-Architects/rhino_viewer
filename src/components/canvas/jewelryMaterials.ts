import * as THREE from 'three'
import { DiamondMaterial, type DiamondMaterialOptions } from './gem/DiamondMaterial'
import type { GemEnv } from './gem/GemEnvironment'
import { PAVE_STONE } from './gem/presets'
import type { MetalConfig, ProngConfig, DiamondConfig } from '@/config/types'
import type { DispersionMode } from './gem/DiamondMaterial'

/** Pure material factories shared by the Leva-driven Ring and the manifest viewer. */
export function createMetalMaterial(v: Partial<MetalConfig>) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(v.color ?? '#ffffff').multiplyScalar(v.brightness ?? 1),
    metalness: v.metalness ?? 1,
    roughness: v.roughness ?? 0.1,
    clearcoat: v.clearcoat ?? 0,
    clearcoatRoughness: v.clearcoatRoughness ?? 0.05,
    envMapIntensity: v.envMapIntensity ?? 0.8,
    flatShading: v.flatShading ?? false,
    toneMapped: true,
  })
}
export function createProngMaterial(v: Partial<ProngConfig>) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(v.color ?? '#B76E79').multiplyScalar(v.brightness ?? 1),
    metalness: v.metalness ?? 1,
    roughness: v.roughness ?? 0.15,
    envMapIntensity: v.envMapIntensity ?? 0.8,
    toneMapped: true,
  })
}

/** Config names -> Ring control names. No Leva store is involved in live/export. */
export function gemControlDefaults(d: Partial<DiamondConfig> & { paveEnvBlur?: number } = {}) {
  return {
    color: d.color ?? '#ffffff',
    ior: d.ior ?? 2.417,
    aberration: d.aberrationStrength ?? 0.024,
    absorption: d.absorption ?? 0.08,
    envMapIntensity: d.envMapIntensity ?? 1.4,
    fresnelBias: d.fresnelBias ?? 0.04,
    sparkle: d.sparkle ?? 0.45,
    bounces: d.bounces ?? 5,
    quality: d.dispersionMode ?? 2,
    paveBounces: d.paveBounces ?? 3,
    paveQuality: d.paveDispersionMode ?? 0,
    paveSamples: d.paveSamples ?? 4,
    paveEnvBlur: d.paveEnvBlur ?? 0,
    paveEnvMapIntensity: d.paveEnvMapIntensity ?? PAVE_STONE.envMapIntensity,
    settingOcclusion: d.settingOcclusion ?? 0,
    settingColor: d.settingColor ?? '#202020',
  }
}
export function gemMaterialOptions(
  g: Omit<ReturnType<typeof gemControlDefaults>, 'quality' | 'paveQuality'> & { quality: number; paveQuality: number },
  neutralSpectrum = false,
): {
  center: DiamondMaterialOptions
  pave: DiamondMaterialOptions
} {
  const common = {
    fresnelBias: g.fresnelBias,
    sparkleIntensity: g.sparkle,
    settingStrength: g.settingOcclusion,
    settingColor: g.settingColor,
    neutralSpectrum,
  }
  return {
    center: {
      ...common,
      color: g.color,
      ior: g.ior,
      aberrationStrength: g.aberration,
      absorptionFactor: g.absorption,
      envMapIntensity: g.envMapIntensity,
      bounces: g.bounces,
      dispersionMode: g.quality as DispersionMode,
      pixelSamples: 1,
      envBlur: 0,
    },
    pave: {
      ...PAVE_STONE,
      ...common,
      bounces: g.paveBounces,
      dispersionMode: g.paveQuality as DispersionMode,
      pixelSamples: g.paveSamples,
      envBlur: g.paveEnvBlur,
      envMapIntensity: g.paveEnvMapIntensity,
    },
  }
}
export function connectedGemOptions(options: DiamondMaterialOptions, env: GemEnv, map: THREE.Texture | null) {
  return { envMap: env.envMap, envRotation: env.rotation, settingOcclusion: map, ...options }
}
