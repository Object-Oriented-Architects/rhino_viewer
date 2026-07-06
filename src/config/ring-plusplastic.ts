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
    // dpr 3은 refraction ray tracing 비용이 2.25배라 ~33fps로 떨어짐 — 낮은 fps는
    // 프레임당 회전각을 키워 체감 자글거림을 오히려 악화. 2 + temporalSmoothing 조합이 우수
    dpr: 2,
    temporalSmoothing: 0.75, // 시간축 평균 — 프레임 간 popping을 페이드로
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

  // 기본: MeshRefractionMaterial (gemMaterial='refraction') — TIR ray tracing으로 다이아몬드 look 확보.
  // 특정 각도에서 셰이더 NaN → bloom mipmap 오염 → 화면 전체 검은 깜빡임 문제는
  // Models.tsx의 guardRefractionShader(NaN/Inf 가드)로 차단됨.
  // Physical 필드는 gemMaterial='physical' 대체 경로용 (ray tracing 없음, 유리 느낌이라 기본 미사용).
  diamond: {
    color: '#ffffff',
    ior: 2.4,
    // Refraction
    bounces: 3,
    fresnel: 1.0,
    aberrationStrength: 0.004,
    // correctMips=false: mip 선택이 굴절 광선의 픽셀 간 변화량 기준 →
    // 광선이 요동치는 작은 pavé는 자동으로 흐린 mip(자글거림 ↓), 센터 스톤은 선명 유지.
    // envMipBias는 그 위에 얹는 전역 배율 (1=적응형만, 키우면 전체적으로 더 차분+흐림)
    envMipBias: 1.5,
    correctMips: false,
    // Physical (fallback 전용)
    transmission: 0.85,
    thickness: 2.0,
    roughness: 0.0,
    dispersion: 0.15,
    iridescence: 0.3,
    iridescenceIOR: 2.4,
    attenuationColor: '#ffffff',
    attenuationDistance: 1.0,
    envMapIntensity: 5.0,
    flatShading: false,
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
