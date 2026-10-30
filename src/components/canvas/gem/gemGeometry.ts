import * as THREE from 'three'

/** 보석은 각면체 — 정점을 면마다 분리해 진입 굴절 법선을 facet 단위로 고정한다 */
export function toFacetedGeometry(geometry: THREE.BufferGeometry) {
  const faceted = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  faceted.deleteAttribute('normal')
  faceted.computeVertexNormals()
  return faceted
}

/**
 * 한 메시에 합쳐진 여러 스톤을 연결 성분(스톤 1개)마다 각면 geometry로 나눈다.
 * 레이트레이서는 스톤마다 BVH·광선 오프셋·품질(센터/pavé)을 따로 잡아야 한다 —
 * 합쳐 두면 수십 개 pavé가 전부 센터석 품질로 추적되고 오프셋도 링 전체 크기 기준이 된다.
 * 결과 geometry는 원본과 같은 로컬 공간에 있다.
 */
export function splitFacetedStones(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  const position = source.getAttribute('position')
  const triCount = position.count / 3

  // 면마다 분리된 정점도 같은 위치면 같은 키 — 삼각형 연결성 판단용
  const keyOf = (i: number) =>
    `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`

  const parent = Int32Array.from({ length: triCount }, (_, i) => i)
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }

  const ownerOfVertex = new Map<string, number>()
  for (let tri = 0; tri < triCount; tri++) {
    for (let corner = 0; corner < 3; corner++) {
      const key = keyOf(tri * 3 + corner)
      const owner = ownerOfVertex.get(key)
      if (owner === undefined) {
        ownerOfVertex.set(key, tri)
      } else {
        const a = find(owner)
        const b = find(tri)
        if (a !== b) parent[a] = b
      }
    }
  }

  const stones = new Map<number, number[]>()
  for (let tri = 0; tri < triCount; tri++) {
    const root = find(tri)
    const tris = stones.get(root)
    if (tris) tris.push(tri)
    else stones.set(root, [tri])
  }

  const result = [...stones.values()].map((tris) => {
    const array = new Float32Array(tris.length * 9)
    tris.forEach((tri, j) => {
      for (let corner = 0; corner < 3; corner++) {
        const v = tri * 3 + corner
        array.set([position.getX(v), position.getY(v), position.getZ(v)], j * 9 + corner * 3)
      }
    })
    const stone = new THREE.BufferGeometry()
    stone.setAttribute('position', new THREE.BufferAttribute(array, 3))
    stone.computeVertexNormals()
    return stone
  })
  if (source !== geometry) source.dispose()
  return result
}
