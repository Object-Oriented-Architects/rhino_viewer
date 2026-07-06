import { SceneConfig } from './types'

export const ringPlusplasticConfig: SceneConfig = {
  // 모델 경로
  modelPath: '/model/ring-260402/Ring_plusplastic_SingleCut_mesh.3dm',
  hdrPath: '/model/ring-260316/ring-plusplastic2-800.hdr',
  shadowTexturePath: '/model/ring-260203-angle/Ring_Mesh_0203_embedded_files/ring_shadow.jpg',
  shadowOpacity: 0.35, // 참고 렌더의 은은한 그림자 매칭

  // 카메라
  cameraPosition: [6, 8, 6],
  orbitTarget: [0, 0, 0],

  view: {
    fov: 30,
    // 참고 렌더(render/*.jpg) 매칭: grade.contrast로 스트레치된 후 화면에서 ~240이 되는 값
    backgroundColor: '#dcdcdc',
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
    brightness: 1.0, // 참고 렌더의 은색 미드톤 매칭 (grade.contrast와 함께 튜닝된 값)
    metalness: 1.0,
    roughness: 0.05,
    envMapIntensity: 1.0, // 주의: three r179에서 scene.environment 사용 시 무시됨 (죽은 레버)
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
    // 주의: gem cube 텍스처는 HDR 원값 그대로라 environmentIntensity(0.45)를 받지 않음 —
    // 금속보다 2배 밝은 환경을 봄. color를 회색으로 낮춰 facet 다크를 복원 (HDR 하이라이트는
    // 1.0 이상이라 여전히 순백 → 대비 증가). 더 하얗게 = #E8E8E8, 더 진하게 = #B8B8B8
    color: '#D0D0D0',
    ior: 2.4,
    // Refraction
    bounces: 3,
    // fresnel(흰 림 혼합): 높이면 스톤이 전반적으로 하얗게 떠서 facet 대비가 씻겨나감
    fresnel: 0.5,
    aberrationStrength: 0.004,
    // correctMips=true: 선명한 env 샘플링 — facet 다크/화이트 대비 유지.
    // (false=적응형 블러는 자글거림을 줄이지만 스톤을 뿌옇게 만듦 — TemporalSmooth 도입 후
    // 자글거림은 시간축에서 잡으므로 공간 블러는 끔)
    envMipBias: 1.0,
    correctMips: true,
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

  // 참고 렌더(오프라인 GI)의 휘도 분포 매칭: 깊은 다크(p10 104) + 블로운 하이라이트(p90 249)
  // 실측: 이 값 적용 시 링 영역 percentile이 참고 렌더와 ±3 이내로 일치
  grade: {
    contrast: 0.22,
    brightness: -0.02,
  },

  transform: {
    scale: 0.07,
    positionY: 0,
    rotationX: -90,
  },

  // 타이트한 Bloom — 넓은 글로우(levels 9)는 스톤 facet 다크까지 들어올려 뿌옇게 만듦
  bloom: {
    enabled: true,
    intensity: 0.7,
    luminanceThreshold: 1.0,
    luminanceSmoothing: 1.0,
    radius: 0.6,
    levels: 5,
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
