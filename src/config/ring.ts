import { SceneConfig } from './types'

export const ringConfig: SceneConfig = {
  // 모델 경로
  modelPath: '/model/ring-260203/Ring_Mesh_0203.3dm',
  hdrPath: '/model/ring-260203/ring800.hdr',
  shadowTexturePath: '/model/ring-260203/shadow.jpg',

  // 카메라
  cameraPosition: [6, 8, 6],
  orbitTarget: [0, 0, 0],

  // Leva 기본값
  view: {
    fov: 45,
  },

  light: {
    envMap: 'hdr',
    environmentIntensity: 1.0,
    envRotX: 0,
    envRotY: 0,
    envRotZ: 0,
    ambientLightIntensity: 0.5,
    directionalLightIntensity: 0.8,
    background: false,
  },

  metal: {
    color: '#ffffff',
    brightness: 1.0,
    metalness: 1.0,
    roughness: 0.1,
    envMapIntensity: 0.8,
    flatShading: false,
  },

  prong: {
    enabled: false, // 프롱 별도 재질 비활성화 (기본)
    color: '#B76E79',
    brightness: 1.0,
    metalness: 1.0,
    roughness: 0.15,
    envMapIntensity: 0.8,
  },

  diamond: {
    color: '#ffffff',
    ior: 2.41,
    bounces: 4,
    fresnel: 0.1,
    aberrationStrength: 0.044,
    fastChroma: true,
  },

  transform: {
    scale: 0.1,
    positionY: 0,
    rotationX: -90,
  },

  bloom: {
    enabled: true,
    intensity: 0.2,
    luminanceThreshold: 1.2,
    luminanceSmoothing: 0.9,
    radius: 0.3,
  },
}
