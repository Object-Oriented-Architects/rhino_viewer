import { SceneConfig } from './types'

// 참고 렌더 1번 시점·환경 회전 — 기본 구도
const cameraPosition: [number, number, number] = [3.6, 4.416, 5.818]
const envRotY = 30

export const ringPlusplasticConfig: SceneConfig = {
  // 모델 경로
  modelPath: '/model/ring-260402/Ring_plusplastic_SingleCut_mesh.3dm',
  // 참고 렌더 1번(render/1.jpg)과 같은 HDR — 금속·보석 모두 이 환경. 렌더 2·3번은 HDR 2·3 (Leva 환경맵 목록)
  hdrPath: '/model/ring-260316/ring-plusplastic-800.hdr',
  shadowTexturePath: '/model/ring-260203-angle/Ring_Mesh_0203_embedded_files/ring_shadow.jpg',
  shadowOpacity: 0.75, // 참고 렌더의 밴드 아래 접지 그림자 — 그림자 영역 평균 참고 234 / 0.75에서 232 (1.0은 229)

  // 카메라 — 참고 렌더 1번 시점. 렌더 실루엣과 모델 실루엣의 겹침(IoU)이 최대인 구도를 찾았다
  // (0.73 — 참고 렌더 마스크에 접지 그림자가 섞이고 배경만큼 밝은 금속·보석이 빠져 1이 안 된다)
  cameraPosition,
  orbitTarget: [0, 0.011, -0.12],

  // 렌더 2·3번은 반지를 눕혀 찍었다 — 위에서 내려다보기만 하면 보석이 스튜디오 천장 쪽을 비춰 하얗게 뜬다
  // (렌더 2 센터석 흰 픽셀 참고 22% / 내려다보기 58%). 반지 기준 카메라는 실루엣 맞춤(IoU 렌더 2 0.71·렌더 3 0.60),
  // 조명은 "반지를 눕히고 스튜디오 카메라를 고도 32.4°, 방위 70°(렌더 2)·60°(렌더 3)에 둔" 방향 — 방위를 −30~150°로
  // 훑어 센터석 밝기·대비가 참고와 가장 가까웠다 (Neutral·보석 2.0일 때 렌더 2 평균 참고 190 / 186, 어두운 픽셀 14% / 18%)
  referenceViews: [
    { image: '/model/ring-260316/render/1.jpg', cameraPosition, cameraUp: [0, 1, 0], envRotation: [0, envRotY, 0] },
    {
      image: '/model/ring-260316/render/2.jpg',
      cameraPosition: [0.633, 8.16, 2.647],
      cameraUp: [0.0509, 0.2338, 0.971],
      envRotation: [102, 7, 137],
    },
    {
      image: '/model/ring-260316/render/3.jpg',
      cameraPosition: [5.475, 6.415, 1.574],
      cameraUp: [0.1551, 0.3413, 0.9271],
      envRotation: [105, 16, 109],
    },
  ],

  view: {
    fov: 20,
    // 참고 렌더 배경 실측(반지름별 중앙값): 중앙 248 → 변 중앙 241 → 모서리 237 ≈ 248·(1 − 0.026·r²).
    // 어두운 스튜디오 프리셋을 쓸 땐 배경도 검정으로 맞출 것 (밝은 배경이면 어두운 환경을 비춘 금속만 검게 떠 보임)
    backgroundColor: '#f8f8f8',
    backgroundVignette: 0.026,
    // dpr 3은 refraction ray tracing 비용이 2.25배라 ~33fps로 떨어짐 — 낮은 fps는
    // 프레임당 회전각을 키워 체감 자글거림을 오히려 악화. 2 + temporalSmoothing 조합이 우수
    dpr: 2,
    // 시간축 평균 — 움직일 땐 지터를 끄므로 0.5면 자글거림은 거의 사라지고 반짝임(플래시)은 96% 남는다.
    // 0.9는 반짝임까지 평균해 보석이 흐리멍텅해졌다 (실측 강한 플래시 픽셀: 0 → 3517, 0.5 → 3382, 0.9 → 2762)
    temporalSmoothing: 0.5,
    exposure: 1.0,
    // 참고 렌더는 하이라이트를 누르지 않는다 — ACES는 센터석 facet이 뭉개졌고(선명도 참고 11.7 / ACES 8.0), Neutral도 0.76 위를
    // 눌러 보석 하이라이트가 흰색까지 안 올라 생기가 없었다 (렌더 2 pavé 흰 픽셀 참고 26% / Neutral 3% / Linear 18%,
    // 렌더 1 센터석 10% 하위 밝기 참고 134 / Linear 129). 금속도 Linear가 가깝다 (밴드 아래 하위 10% 참고 96 / Neutral 71 / Linear 89)
    toneMapping: 'linear',
  },

  light: {
    envMap: 'hdr',
    // 금속·보석 모두 hdrPath(참고 렌더와 같은 HDR). 금속은 환경 강도로, 보석은 Diamond envMapIntensity로 밝기를 따로 맞춘다 —
    // 노출 하나로 금속을 맞추면(0.5) 보석이 참고 렌더보다 어두웠다. Y 회전 30°가 참고 렌더와 오차 최소 (0~330° 12개 비교).
    // 절차적 스튜디오(white_metal·white_gem, ijewel3d 룩)는 Leva 환경맵 목록에서 선택 가능
    environmentIntensity: 0.8,
    envRotX: 0,
    envRotY,
    envRotZ: 0,
    ambientLightIntensity: 0,
    directionalLightIntensity: 0,
    background: false,
  },

  // Jewel_test 플래티넘 프리셋
  metal: {
    preset: 'platinum',
    color: '#f2f5f8',
    brightness: 1.0,
    metalness: 1.0,
    roughness: 0.055,
    clearcoat: 0.25,
    clearcoatRoughness: 0.05,
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

  // 기본: DiamondMaterial (gemMaterial='refraction') — Jewel_test BVH 레이트레이서.
  // 내부 충돌마다 Fresnel로 투과/반사를 나눠 누적하고 겉면 반사는 환경을 실제로 샘플한다.
  // 센터석은 6밴드 스펙트럼·5회 반사, pavé는 1광선+탈출 RGB 오프셋·3회 반사 (비용 1/6 수준).
  diamond: {
    preset: 'diamond',
    color: '#ffffff',
    ior: 2.417,
    bounces: 5,
    // 센터석 fire(채도 높은 픽셀) 참고 렌더 1 8.0%·렌더 2 13.3% / 0.045에서 8.1%·6.4% — 실측 분산폭(0.024)으론 모자라 키움.
    // 렌더 2를 맞추려 더 키우면 렌더 1이 넘친다 (Neutral 기준 0.06: 렌더 1 15.7%)
    aberrationStrength: 0.045,
    dispersionMode: 2,
    absorption: 0.08,
    fresnelBias: 0.04,
    sparkle: 0.45,
    paveBounces: 3,
    paveDispersionMode: 0,
    paveSamples: 4,
    // Linear 톤매핑 기준 — 센터석 평균 밝기 참고 렌더 1 200 / 199, 렌더 2 181 / 183, 흰 픽셀 15% / 21%, 18% / 16%
    envMapIntensity: 1.6,
    // pavé는 센터석보다 밝게 둬야 참고와 맞았다 — 흰 픽셀 렌더 1 참고 12% / 13%, 렌더 2 26% / 18% (2.0이면 11% / 14%)
    paveEnvMapIntensity: 2.6,
    // pavé가 진회색 바탕에 흰 반짝임으로 보이는 건 받침 금속에 갇힌 빛 — 스톤마다 금속 가림 맵을 구워 적용
    settingOcclusion: 1,
    settingColor: '#303030',
    // 원본 분산 가중치(빨강 +8%)가 센터석을 복숭아빛으로 물들였다
    neutralSpectrum: true,
    // Physical — 'PBR 비교' 토글 전용, Jewel_test 비교 재질 값
    transmission: 1.0,
    thickness: 1.6,
    roughness: 0.0,
    iridescence: 0,
    iridescenceIOR: 2.4,
    attenuationColor: '#ffffff',
    attenuationDistance: 1.0,
    flatShading: true,
  },

  // 참고 렌더 맞춤에선 추가 대비 없음 (ijewel3d 룩은 0.1 — 톤매핑 contrast 1.1 수준)
  grade: {
    contrast: 0,
    brightness: 0,
  },

  transform: {
    scale: 0.07,
    positionY: 0,
    rotationX: -90,
  },

  // 참고 렌더엔 빛 번짐이 없다 — 켜면 pavé 둘레가 뿌옇게 번졌다 (값은 Jewel_test UnrealBloom threshold 2.4 대응, Leva에서 켤 수 있음)
  bloom: {
    enabled: false,
    intensity: 0.7,
    luminanceThreshold: 2.4,
    luminanceSmoothing: 0.3,
    radius: 0.4,
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
