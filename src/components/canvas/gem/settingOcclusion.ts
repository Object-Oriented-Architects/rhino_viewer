import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

/** 모델 안에서 같은 부모 그룹 아래 놓인 메시 — position/rotation/scale은 그 그룹 기준 */
export interface PlacedGeometry {
  geometry: THREE.BufferGeometry
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
}
/** 팔면체 맵 한 변 — 프롱처럼 가는 금속도 몇 텍셀은 덮는 크기 */
const MAP_SIZE = 32
const placement = (mesh: PlacedGeometry) =>
  new THREE.Matrix4().compose(mesh.position, new THREE.Quaternion().setFromEuler(mesh.rotation), mesh.scale)
/** DiamondMaterial 셰이더 octEncode의 역 — 텍셀 중심 (u, v) ∈ [0,1]² → 단위 방향 */
function octDecode(u: number, v: number, out: THREE.Vector3) {
  const x = u * 2 - 1,
    y = v * 2 - 1,
    z = 1 - Math.abs(x) - Math.abs(y)
  if (z >= 0) return out.set(x, y, z).normalize()
  return out.set((1 - Math.abs(y)) * Math.sign(x), (1 - Math.abs(x)) * Math.sign(y), z).normalize()
}

/** Owned by one object revision; BVH never mutates the render index. */
export function createOccluder(mesh: PlacedGeometry) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', mesh.geometry.getAttribute('position'))
  if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone())
  const matrix = placement(mesh)
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  return {
    geometry,
    bvh: new MeshBVH(geometry),
    inverse: matrix.clone().invert(),
    box: mesh.geometry.boundingBox!.clone().applyMatrix4(matrix),
  }
}
export type Occluder = ReturnType<typeof createOccluder>
type Node = { box: THREE.Box3; children?: [Node, Node]; leaf?: Occluder }

/** Broad phase over cached object BVHs. A metal edit rebuilds only this cheap box tree. */
export function occluderIndex(occluders: Occluder[]) {
  const build = (items: Occluder[]): Node | null => {
    if (!items.length) return null
    const box = new THREE.Box3()
    for (const item of items) box.union(item.box)
    if (items.length === 1) return { box, leaf: items[0] }
    const size = box.getSize(new THREE.Vector3())
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z'
    items.sort((a, b) => a.box.min[axis] + a.box.max[axis] - (b.box.min[axis] + b.box.max[axis]))
    const mid = items.length >> 1
    return { box, children: [build(items.slice(0, mid))!, build(items.slice(mid))!] }
  }
  const root = build([...occluders])
  const localRay = new THREE.Ray()
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    point = new THREE.Vector3()
  let current: Occluder
  // Boolean-only traversal: raycastFirst allocates a face, point and barycentrics for
  // every hit. None are used by a visibility map, and that garbage can stall a slice.
  const callbacks = {
    intersectsBounds: (box: THREE.Box3) => localRay.intersectsBox(box),
    intersectsRange: (offset: number, count: number) => {
      const position = current.geometry.getAttribute('position'),
        index = current.geometry.index!
      for (let tri = offset, end = offset + count; tri < end; tri++) {
        a.fromBufferAttribute(position, index.getX(tri * 3))
        b.fromBufferAttribute(position, index.getX(tri * 3 + 1))
        c.fromBufferAttribute(position, index.getX(tri * 3 + 2))
        // false = DoubleSide, using exactly the same Three ray/triangle predicate.
        if (localRay.intersectTriangle(a, b, c, false, point)) return true
      }
      return false
    },
  }
  const hit = (node: Node, ray: THREE.Ray): boolean => {
    if (!ray.intersectsBox(node.box)) return false
    if (node.leaf) {
      localRay.origin.copy(ray.origin).applyMatrix4(node.leaf.inverse)
      localRay.direction.copy(ray.direction).transformDirection(node.leaf.inverse)
      current = node.leaf
      return current.bvh.shapecast(callbacks)
    }
    return hit(node.children![0], ray) || hit(node.children![1], ray)
  }
  return (ray: THREE.Ray) => (root ? hit(root, ray) : false)
}

/**
 * 스톤마다 "어느 방향으로 빠져나간 빛이 금속(받침·프롱·헤일로)에 막히는가"를 구운 팔면체 맵 (R8, 255 = 환경이 보임).
 * 레이트레이서는 스톤 자신의 BVH만 추적해 받침 속으로 나간 빛도 밝은 환경을 읽는다 — 오프라인 참고 렌더의 pavé가
 * 진회색 바탕에 흰 반짝임인 것은 그 빛이 금속 받침에 갇히기 때문이다. 스톤 중심에서 방향마다 금속에 한 번 쏴서
 * 로드 시 굽고, 셰이더는 탈출 방향으로 텍스처 한 번만 읽는다. 방향은 스톤 로컬 공간(셰이더 광선이 로컬에서 추적됨).
 * 라이브 갱신은 개별 텍셀 경계에서 양보하며, Ring의 동기 API도 같은 방향·텍셀 판정을 사용한다.
 */
export function settingBake(stone: PlacedGeometry, blocked: (ray: THREE.Ray) => boolean) {
  const toGroup = placement(stone)
  const linear = new THREE.Matrix3().setFromMatrix4(toGroup)
  if (!stone.geometry.boundingSphere) stone.geometry.computeBoundingSphere()
  const ray = new THREE.Ray(stone.geometry.boundingSphere!.center.clone().applyMatrix4(toGroup))
  const local = new THREE.Vector3()
  const data = new Uint8Array(MAP_SIZE * MAP_SIZE)
  let cursor = 0
  return {
    step(deadline: number) {
      while (cursor < data.length && performance.now() < deadline) {
        const i = cursor % MAP_SIZE,
          j = Math.floor(cursor / MAP_SIZE)
        octDecode((i + 0.5) / MAP_SIZE, (j + 0.5) / MAP_SIZE, local)
        ray.direction.copy(local).applyMatrix3(linear).normalize()
        data[cursor++] = blocked(ray) ? 0 : 255
      }
      return cursor === data.length
    },
    texture() {
      const t = new THREE.DataTexture(data, MAP_SIZE, MAP_SIZE, THREE.RedFormat, THREE.UnsignedByteType)
      t.magFilter = THREE.LinearFilter
      t.minFilter = THREE.LinearFilter
      t.needsUpdate = true
      return t
    },
  }
}

/** Original synchronous Ring API; identical rays and texels, shared with LiveModel. */
export function bakeSettingOcclusion(metals: PlacedGeometry[], stones: PlacedGeometry[]): THREE.DataTexture[] {
  const occluders = metals.map(createOccluder)
  try {
    const blocked = occluderIndex(occluders)
    return stones.map((stone) => {
      const bake = settingBake(stone, blocked)
      bake.step(Infinity)
      return bake.texture()
    })
  } finally {
    occluders.forEach((o) => o.geometry.dispose())
  }
}
