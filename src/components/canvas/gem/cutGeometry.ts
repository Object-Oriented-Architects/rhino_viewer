import * as THREE from 'three'
import { toFacetedGeometry } from './gemGeometry'

export type GemCut = 'brilliant' | 'emerald'

/**
 * 57면 라운드 브릴리언트 (Jewel_test DiamondGeometry 이식).
 * Tolkowsky 이상 비율(테이블 56%, 크라운 ≈33°, 파빌리온 ≈41.7°) — 테이블로 들어온 빛이
 * 파빌리온에서 두 번 전반사돼 위로 돌아오는 각이다. 거들 반지름 = radius, +Y가 테이블.
 */
function createRoundBrilliantGeometry(radius: number) {
  const positions: number[] = []
  const indices: number[] = []

  const addVertex = (x: number, y: number, z: number) => {
    const idx = positions.length / 3
    positions.push(x * radius, y * radius, z * radius)
    return idx
  }
  const addTriangle = (a: number, b: number, c: number) => indices.push(a, b, c)
  const ring = (count: number, offset: number, r: number, y: (i: number) => number) =>
    Array.from({ length: count }, (_, i) => {
      const angle = ((i + offset) * Math.PI * 2) / count
      return addVertex(Math.cos(angle) * r, y(i), Math.sin(angle) * r)
    })

  const rTable = 0.56
  const yCrown = 0.31
  const yUpperGirdle = 0.025
  const yLowerGirdle = -0.025
  const yPavilionTip = -0.89
  const rStar = 0.785
  const yStar = 0.175
  const rPavMid = 0.72
  const yPavMid = -0.26

  const vTableCenter = addVertex(0, yCrown, 0)
  const vCulet = addVertex(0, yPavilionTip, 0)
  const vTable = ring(8, 0, rTable, () => yCrown)
  const vStar = ring(8, 0.5, rStar, () => yStar)
  // 짝수 거들 점을 살짝 띄워 facet 접합부를 실제처럼 물결지게
  const vUpperGirdle = ring(16, 0, 1, (i) => yUpperGirdle + (i % 2 === 0 ? 0.008 : 0))
  const vLowerGirdle = ring(16, 0, 1, (i) => yLowerGirdle + (i % 2 === 0 ? -0.008 : 0))
  const vPavMid = ring(8, 0.5, rPavMid, () => yPavMid)

  // 위에서 볼 때 i→i+1은 시계 방향이라 바깥 법선을 위해 (중심, i+1, i) 순으로 감는다
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8
    const prev = (i + 7) % 8
    addTriangle(vTableCenter, vTable[next], vTable[i]) // 테이블
    addTriangle(vTable[i], vTable[next], vStar[i]) // 스타
    addTriangle(vTable[i], vStar[i], vUpperGirdle[2 * i]) // 베젤(카이트)
    addTriangle(vTable[i], vUpperGirdle[2 * i], vStar[prev])
    addTriangle(vStar[i], vUpperGirdle[2 * i + 1], vUpperGirdle[2 * i]) // 상부 거들
    addTriangle(vStar[i], vUpperGirdle[(2 * i + 2) % 16], vUpperGirdle[2 * i + 1])
  }
  for (let i = 0; i < 16; i++) {
    const next = (i + 1) % 16
    addTriangle(vUpperGirdle[i], vUpperGirdle[next], vLowerGirdle[next]) // 거들
    addTriangle(vUpperGirdle[i], vLowerGirdle[next], vLowerGirdle[i])
  }
  for (let i = 0; i < 8; i++) {
    const prev = (i + 7) % 8
    const gLeft = 2 * i
    const gMid = 2 * i + 1
    const gRight = (2 * i + 2) % 16
    addTriangle(vLowerGirdle[gLeft], vLowerGirdle[gMid], vPavMid[i]) // 하부 거들
    addTriangle(vLowerGirdle[gMid], vLowerGirdle[gRight], vPavMid[i])
    addTriangle(vLowerGirdle[gLeft], vPavMid[i], vCulet) // 파빌리온 메인(카이트)
    addTriangle(vLowerGirdle[gLeft], vCulet, vPavMid[prev])
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return toFacetedGeometry(geometry)
}

/**
 * 에메랄드 컷 (계단식 팔각, Z로 늘린 직사각) — Jewel_test 이식.
 * 원본은 삼각형이 전부 안쪽을 향해(inside-out) 앞면 컬링 시 반대편 면이 그려졌다 — 감기 순서를 뒤집어 바깥 법선으로.
 */
function createEmeraldCutGeometry(radius: number) {
  const positions: number[] = []
  const indices: number[] = []

  // 모서리를 깎은 직사각형(팔각) 링
  const addRing = (rx: number, rz: number, y: number, chamfer: number) => {
    const start = positions.length / 3
    const points = [
      [rx * (1 - chamfer), rz],
      [-rx * (1 - chamfer), rz],
      [-rx, rz * (1 - chamfer)],
      [-rx, -rz * (1 - chamfer)],
      [-rx * (1 - chamfer), -rz],
      [rx * (1 - chamfer), -rz],
      [rx, -rz * (1 - chamfer)],
      [rx, rz * (1 - chamfer)],
    ]
    for (const [x, z] of points) positions.push(x * radius, y * radius, z * radius)
    return start
  }
  const connectRings = (a: number, b: number) => {
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8
      indices.push(a + i, b + next, b + i, a + i, a + next, b + next)
    }
  }

  const rings = [
    addRing(0.54, 0.72, 0.28, 0.25), // 테이블
    addRing(0.72, 0.9, 0.2, 0.26), // 크라운 계단
    addRing(0.88, 1.06, 0.11, 0.27),
    addRing(1.0, 1.18, 0.025, 0.28), // 거들
    addRing(1.0, 1.18, -0.025, 0.28),
    addRing(0.76, 0.94, -0.26, 0.26), // 파빌리온 계단
    addRing(0.5, 0.68, -0.5, 0.24),
    addRing(0.24, 0.42, -0.72, 0.22),
  ]

  const top = positions.length / 3
  positions.push(0, 0.28 * radius, 0)
  for (let i = 0; i < 8; i++) indices.push(top, rings[0] + ((i + 1) % 8), rings[0] + i)

  for (let r = 0; r < rings.length - 1; r++) connectRings(rings[r], rings[r + 1])

  const keel = positions.length / 3
  positions.push(0, -0.88 * radius, 0)
  const last = rings[rings.length - 1]
  for (let i = 0; i < 8; i++) indices.push(last + i, last + ((i + 1) % 8), keel)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return toFacetedGeometry(geometry)
}

export function createCutGeometry(cut: GemCut, radius = 1) {
  return cut === 'brilliant' ? createRoundBrilliantGeometry(radius) : createEmeraldCutGeometry(radius)
}
