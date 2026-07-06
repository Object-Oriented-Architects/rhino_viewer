import { SceneConfig } from './types'

export const ringPlusplasticConfig: SceneConfig = {
  // 모델 경로
  modelPath: '/model/ring-260402/Ring_plusplastic_SingleCut_mesh.3dm',
  hdrPath: '/model/ring-260316/ring-plusplastic2-800.hdr',
  shadowTexturePath: '/model/ring-260203-angle/Ring_Mesh_0203_embedded_files/ring_shadow.jpg',

  // 카메라
  cameraPosition: [6, 8, 6],
  orbitTarget: [0, 0, 0],

  view: {
    fov: 30,
    backgroundColor: '#f3f3f3',
  },

  light: {
    envMap: 'hdr',
    environmentIntensity: 0.45,
    envRotX: 0,
    envRotY: 0,
    envRotZ: 0,
    ambientLightIntensity: 0,
    directionalLightIntensity: 0.3,
    background: false,
  },

  metal: {
    color: '#ffffff',
    brightness: 1.2,
    metalness: 1.0,
    roughness: 0.05,
    envMapIntensity: 1.0,
    flatShading: false,
  },

  prong: {
    enabled: true,
    color: '#FCCDA7',
    brightness: 1.7,
    metalness: 1.0,
    roughness: 0.01,
    envMapIntensity: 1.0,
  },

  // MeshPhysicalMaterial 기반 — pavé 자글거림 근본 제거 (ray tracing 없음)
  // Refraction 필드는 legacy 호환용으로 남김 (gemMaterial='refraction' fallback 시 사용)
  diamond: {
    color: '#ffffff',
    ior: 2.4,
    // Refraction (unused when gemMaterial='physical')
    bounces: 3,
    fresnel: 1.0,
    aberrationStrength: 0.004,
    // Physical material
    transmission: 1.0,
    thickness: 0.5,
    roughness: 0.0,
    dispersion: 0.05,
    iridescence: 0.3,
    iridescenceIOR: 2.4,
    attenuationColor: '#ffffff',
    attenuationDistance: 1.0,
  },

  transform: {
    scale: 0.07,
    positionY: 0,
    rotationX: -90,
  },

  // CodeSandbox 단일 Bloom 레시피
  bloom: {
    enabled: true,
    intensity: 2.0,
    luminanceThreshold: 1.0,
    luminanceSmoothing: 1.0,
    radius: 0.95,
    levels: 9,
  },

  caustics: {
    enabled: false,
    color: '#ffffff',
    ior: 1.8,
    backfaceIor: 1.1,
    worldRadius: 0.1,
    intensity: 0.1,
    lightSource: [5, 5, -10],
  },

  shadows: {
    frames: 100,
    color: '#000000',
    colorBlend: 2,
    alphaTest: 0.7,
    opacity: 1,
    scale: 12,
    lightAmount: 8,
    lightRadius: 10,
    lightAmbient: 0.5,
    lightBias: 0.001,
  },
}
