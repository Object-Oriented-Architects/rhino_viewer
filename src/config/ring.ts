import { SceneConfig } from './types'

export const ringConfig: SceneConfig = {
  // 모델 경로
  modelPath: '/model/ring-260203-angle/Ring_Mesh_0205.3dm',
  hdrPath: '/model/ring-260203-angle/ringCont3_800.hdr',
  shadowTexturePath: '/model/ring-260203-angle/Ring_Mesh_0203_embedded_files/ring_shadow.jpg',

  // 카메라
  cameraPosition: [6, 8, 6],
  orbitTarget: [0, 0, 0],

  // Leva 기본값
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
    brightness: 1.5,
    metalness: 1.0,
    roughness: 0.05,
    envMapIntensity: 1.0,
    flatShading: false,
  },

  prong: {
    enabled: true, // 프롱 별도 재질 활성화 (로즈골드)
    color: '#FCCDA7',
    brightness: 1.7,
    metalness: 1.0,
    roughness: 0.01,
    envMapIntensity: 1.0,
  },

  diamond: {
    color: '#CECECE',
    ior: 2.4,
    bounces: 5,
    fresnel: 1.0,
    aberrationStrength: 0.01,
    fastChroma: true,
  },

  transform: {
    scale: 0.07,
    positionY: 0,
    rotationX: -90,
  },

  bloom: {
    enabled: true,
    intensity: 1.0,
    luminanceThreshold: 1.0,
    luminanceSmoothing: 1.0,
    radius: 0.95,
  },

  ao: {
    enabled: true,
    intensity: 3,
    radius: 0.5,
    samples: 30,
    rings: 4,
    distanceThreshold: 0.2,
    distanceFalloff: 0.1,
    rangeThreshold: 0.5,
    rangeFalloff: 0.1,
    bias: 0.01,
  },
}
