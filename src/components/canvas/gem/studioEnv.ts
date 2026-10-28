import * as THREE from 'three'

export const STUDIO_PRESETS = ['white_metal', 'white_gem', 'studio_luxury', 'warm_boutique', 'cyber_neon'] as const
export type StudioPreset = (typeof STUDIO_PRESETS)[number]

export const isStudioPreset = (value: string): value is StudioPreset =>
  (STUDIO_PRESETS as readonly string[]).includes(value)

/**
 * 보석 촬영 스튜디오 환경을 절차적으로 만들어 cube에 렌더한다 (Jewel_test StudioEnvGenerator 이식 + 하이키 프리셋).
 * 다이아몬드는 환경을 비출 뿐이라 환경의 명암 대비가 facet의 흑백 대비와 분산(fire)을 만든다.
 * 일반 HDRI는 대부분 밝은 회색이라 보석이 뿌옇게 뜬다 — 어두운 프리셋은 강한 스트립·링·핀 조명으로,
 * 흰 배경 페이지용 white_* 프리셋은 흰 라이트박스 안에 검은 플래그·링을 세워 대비를 만든다(제품 촬영 방식).
 * 금속과 보석은 따로 비춘다 (ijewel도 보석 전용 envMap) — 보석 대비용 검은 영역이 금속에 비치면 밴드가 어두워진다.
 * white_metal: 상부 검은 링 없이 좁은 플래그만 — 밴드는 밝고 흰 면 사이 검은 띠로 광택.
 * white_gem: 플래그·링을 넓게 — 센터석·pavé에 어두운 facet이 서서 흑백 대비가 난다.
 * 반환 텍스처는 mipmap이 있는 HalfFloat cube — 보석 레이트레이서가 직접 샘플하고,
 * scene.environment로 쓰면 three가 금속용 PMREM을 자동 생성한다.
 */
export function createStudioEnvCube(renderer: THREE.WebGLRenderer, preset: StudioPreset, resolution = 512) {
  const envScene = new THREE.Scene()

  // 돔 그라데이션: 고도 floorY 아래는 바닥색, 위로 갈수록 pow(t, power)로 천장색 — 어두운 프리셋은 (-1, 1.5)
  const dome: Record<StudioPreset, { top: number; bottom: number; floorY: number; power: number }> = {
    // 바닥도 중간 회색 — 위에서 내려다본 밴드 옆면은 바닥을 비추므로 바닥이 검으면 금속 전체가 거뭇해진다
    white_metal: { top: 0xffffff, bottom: 0x8a8d92, floorY: -0.6, power: 0.6 },
    // 보석용 — 바닥은 중간 회색 (검정이면 아래로 빠지는 광선이 많은 pavé가 검은 다이아가 됐다)
    white_gem: { top: 0xffffff, bottom: 0x5a5c60, floorY: -0.6, power: 0.6 },
    studio_luxury: { top: 0x080a10, bottom: 0x020204, floorY: -1, power: 1.5 },
    warm_boutique: { top: 0x1a120b, bottom: 0x020204, floorY: -1, power: 1.5 },
    cyber_neon: { top: 0x090418, bottom: 0x020204, floorY: -1, power: 1.5 },
  }
  const bgMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(dome[preset].top) },
      bottomColor: { value: new THREE.Color(dome[preset].bottom) },
      floorY: { value: dome[preset].floorY },
      power: { value: dome[preset].power },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float floorY;
      uniform float power;
      varying vec3 vWorldPos;
      void main() {
        float h = clamp((normalize(vWorldPos).y - floorY) / (1.0 - floorY), 0.0, 1.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, power)), 1.0);
      }
    `,
  })
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), bgMat))

  const emissive = (color: THREE.ColorRepresentation, intensity: number, side: THREE.Side = THREE.FrontSide) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side })

  const origin = new THREE.Vector3(0, 0, 0)

  const addLightPanel = (pos: THREE.Vector3, width: number, height: number, color: number, intensity: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), emissive(color, intensity, THREE.DoubleSide))
    mesh.position.copy(pos)
    mesh.lookAt(origin)
    envScene.add(mesh)
  }

  const addLightRing = (y: number, radius: number, tubeRadius: number, color: number, intensity: number) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeRadius, 16, 64), emissive(color, intensity))
    mesh.position.set(0, y, 0)
    mesh.rotation.x = Math.PI / 2
    envScene.add(mesh)
  }

  const addPinSpot = (pos: THREE.Vector3, radius: number, color: number, intensity: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), emissive(color, intensity))
    mesh.position.copy(pos)
    envScene.add(mesh)
  }

  const onSphere = (angle: number, elev: number, r: number) =>
    new THREE.Vector3(Math.cos(angle) * Math.cos(elev) * r, Math.sin(elev) * r, Math.sin(angle) * Math.cos(elev) * r)

  // 빛을 내지 않는 검은 판 — 밝은 환경 속 금속 엣지와 보석 facet에 검은 반사를 만든다
  const addFlag = (pos: THREE.Vector3, width: number, height: number) => addLightPanel(pos, width, height, 0x000000, 1)

  if (preset === 'white_metal') {
    // white_gem과 달리 상부 검은 링을 빼고 플래그를 좁고 많게(8개) 했다. 위에서 내려다보는 카메라엔 밴드 윗면이 고도 45° 부근을
    // 비추는데, 그 링이 거기 있어 금속이 남색·검정으로 어두웠다. 반대로 플래그까지 거의 없애면 비칠 무늬가 없어
    // 금속이 찰흙처럼 무광으로 보였다 — 흰 면 사이 또렷한 검은 띠가 크롬 광택을 만든다
    addLightPanel(new THREE.Vector3(0, 22, 0), 16, 16, 0xffffff, 2.4)
    // 플래그를 고도 ~52°까지 올리고 고도 45°·60°에 가는 검은 링 — 굵은 링을 빼고 나니 밴드 윗면(헤드 옆)이 흰 돔만
    // 비춰 균일한 회색(찰흙)이 됐다. 가는 띠와 밝은 판을 번갈아 둬 그 면에도 크롬 줄무늬가 서게 한다
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.3
      addFlag(new THREE.Vector3(Math.cos(angle) * 17, 0, Math.sin(angle) * 17), 2.8, 44)
    }
    addLightRing(-1, 19, 0.9, 0x000000, 1)
    addLightRing(-7, 18, 0.4, 0x000000, 1)
    addLightRing(13, 13, 0.5, 0x000000, 1)
    addLightRing(17, 10, 0.4, 0x000000, 1)
    // 아래쪽 — 밴드 옆면(헤드 옆 어깨)은 바닥을 비춘다. 무늬 없는 회색 바닥이면 그 면이 찰흙처럼 균일해서
    // 밝은 반사판 링과 가는 검은 링을 둔다
    addLightRing(-14, 14, 1.2, 0xffffff, 1.6)
    addLightRing(-9, 17, 0.5, 0x000000, 1)
    addLightRing(-19, 8, 0.5, 0x000000, 1)
    for (let i = 0; i < 8; i++) {
      const angle = ((i + 0.5) / 8) * Math.PI * 2 + 0.3
      addLightPanel(new THREE.Vector3(Math.cos(angle) * 13, 15.5, Math.sin(angle) * 13), 3, 4, 0xffffff, 2.6)
    }
    for (let i = 0; i < 8; i++) {
      const angle = ((i + 0.5) / 8) * Math.PI * 2 + 0.3
      addLightPanel(new THREE.Vector3(Math.cos(angle) * 19, 9, Math.sin(angle) * 19), 3.5, 12, 0xffffff, 2.4)
    }
    for (let i = 0; i < 14; i++) {
      addPinSpot(onSphere((i / 14) * Math.PI * 2 + 0.1, 0.35 + (i % 3) * 0.25, 21), 0.55, 0xffffff, 7.0)
    }
  } else if (preset === 'white_gem') {
    // 보석 전용 — 넓은 검은 영역. 센터석의 어두운 facet은 굵은 검은 영역(특히 고도 45° 상부 링)에서 나오고,
    // 가는 띠만 촘촘히 두르면 오히려 흰 면만 늘어 유리처럼 보였다
    addLightPanel(new THREE.Vector3(0, 22, 0), 16, 16, 0xffffff, 2.4)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.3
      addFlag(new THREE.Vector3(Math.cos(angle) * 17, 0, Math.sin(angle) * 17), 5 + (i % 2) * 2, 32)
    }
    addLightRing(-1, 19, 0.9, 0x000000, 1)
    addLightRing(6, 17, 1.5, 0x000000, 1)
    addLightRing(12, 12, 3.2, 0x000000, 1)
    addLightRing(19, 7, 1.5, 0x000000, 1)
    for (let i = 0; i < 6; i++) {
      const angle = ((i + 0.5) / 6) * Math.PI * 2 + 0.3
      addLightPanel(new THREE.Vector3(Math.cos(angle) * 19, 10, Math.sin(angle) * 19), 4, 8, 0xffffff, 2.0)
    }
    for (let i = 0; i < 24; i++) {
      addPinSpot(onSphere((i / 24) * Math.PI * 2 + 0.1, 0.25 + (i % 4) * 0.22, 21), 0.55, 0xffffff, 8.0)
    }
  } else if (preset === 'studio_luxury') {
    // 고급 다이아몬드 촬영 돔: 상부 링라이트 + 키 소프트박스
    addLightRing(18, 9, 0.7, 0xffffff, 2.2)
    addLightRing(12, 16, 0.35, 0xf5f8ff, 1.6)
    // 상반구를 두른 강한 스트립 — 금속 반사와 크라운 fire
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      addLightPanel(
        new THREE.Vector3(Math.cos(angle) * 20, 10, Math.sin(angle) * 20),
        3.5,
        14,
        i % 2 === 0 ? 0xffffff : 0xeef4ff,
        2.0,
      )
    }
    // 핀포인트 스파클 조명 — scintillation과 무지개 fire의 핵심
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 + 0.2
      addPinSpot(onSphere(angle, 0.25 + (i % 3) * 0.28, 22), 0.65, i % 3 === 0 ? 0xfff6e5 : 0xffffff, 5.5)
    }
    // 밴드 아랫면용 약한 반사판
    addLightRing(-14, 14, 1.2, 0xd8e2f0, 0.8)
  } else if (preset === 'warm_boutique') {
    addLightRing(17, 8, 0.8, 0xfff0d6, 2.3)
    addLightRing(10, 15, 0.4, 0xffdfb0, 1.5)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      addLightPanel(
        new THREE.Vector3(Math.cos(angle) * 20, 8, Math.sin(angle) * 20),
        3.0,
        12,
        i % 2 === 0 ? 0xfff5e4 : 0xffd2a6,
        1.9,
      )
    }
    for (let i = 0; i < 20; i++) {
      addPinSpot(onSphere((i / 20) * Math.PI * 2, 0.2 + (i % 4) * 0.22, 21), 0.7, 0xfff2cc, 6.0)
    }
    addLightRing(-14, 14, 1.2, 0xffdcb5, 0.9)
  } else {
    addLightRing(18, 9, 0.7, 0xffffff, 2.4)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      const col = i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0x70e4ff : 0xff70d8
      addLightPanel(new THREE.Vector3(Math.cos(angle) * 20, 9, Math.sin(angle) * 20), 3.2, 14, col, 2.1)
    }
    for (let i = 0; i < 16; i++) {
      addPinSpot(onSphere((i / 16) * Math.PI * 2, 0.3 + (i % 3) * 0.25, 22), 0.65, 0xffffff, 6.5)
    }
    addLightRing(-14, 14, 1.0, 0x5588ff, 0.9)
  }

  const cubeRT = new THREE.WebGLCubeRenderTarget(resolution, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  })
  new THREE.CubeCamera(0.1, 100, cubeRT).update(renderer, envScene)
  // render target 텍스처는 버전이 올라가야 three가 scene.environment용 PMREM을 만든다
  cubeRT.texture.needsPMREMUpdate = true

  envScene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      obj.material.dispose()
    }
  })

  return cubeRT
}
