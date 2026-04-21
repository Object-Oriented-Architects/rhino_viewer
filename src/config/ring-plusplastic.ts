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

  // CodeSandbox zqrreo 값 — pavé에서 TIR black-out 방지 위해 bounces 낮게 유지
  diamond: {
    color: '#F0F0F0',
    ior: 2.75,
    bounces: 3,           // GemAccumulator 없으므로 TIR guard도 없음 → 낮게
    fresnel: 1.0,
    aberrationStrength: 0.004,  // chromatic 노이즈 완화
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
