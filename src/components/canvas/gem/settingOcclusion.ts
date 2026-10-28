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
  const x = u * 2 - 1
  const y = v * 2 - 1
  const z = 1 - Math.abs(x) - Math.abs(y)
  if (z >= 0) return out.set(x, y, z).normalize()
  return out.set((1 - Math.abs(y)) * Math.sign(x), (1 - Math.abs(x)) * Math.sign(y), z).normalize()
}

/**
 * 스톤마다 "어느 방향으로 빠져나간 빛이 금속(받침·프롱·헤일로)에 막히는가"를 구운 팔면체 맵 (R8, 255 = 환경이 보임).
 * 레이트레이서는 스톤 자신의 BVH만 추적해 받침 속으로 나간 빛도 밝은 환경을 읽는다 — 오프라인 참고 렌더의 pavé가
 * 진회색 바탕에 흰 반짝임인 것은 그 빛이 금속 받침에 갇히기 때문이다. 스톤 중심에서 방향마다 금속에 한 번 쏴서
 * 로드 시 굽고, 셰이더는 탈출 방향으로 텍스처 한 번만 읽는다. 방향은 스톤 로컬 공간(셰이더 광선이 로컬에서 추적됨).
 */
export function bakeSettingOcclusion(metals: PlacedGeometry[], stones: PlacedGeometry[]): THREE.DataTexture[] {
  const occluders = metals.map((mesh) => {
    // BVH 빌드가 index를 재배열하므로 렌더용 geometry 대신 position을 공유하는 사본으로
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', mesh.geometry.getAttribute('position'))
    if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone())
    return { bvh: new MeshBVH(geometry), inverse: placement(mesh).invert() }
  })

  const ray = new THREE.Ray()
  const localDir = new THREE.Vector3()
  const groupDir = new THREE.Vector3()
  const linear = new THREE.Matrix3()

  return stones.map((stone) => {
    const toGroup = placement(stone)
    linear.setFromMatrix4(toGroup)
    stone.geometry.computeBoundingSphere()
    const origin = stone.geometry.boundingSphere!.center.clone().applyMatrix4(toGroup)

    const data = new Uint8Array(MAP_SIZE * MAP_SIZE)
    for (let j = 0; j < MAP_SIZE; j++) {
      for (let i = 0; i < MAP_SIZE; i++) {
        octDecode((i + 0.5) / MAP_SIZE, (j + 0.5) / MAP_SIZE, localDir)
        groupDir.copy(localDir).applyMatrix3(linear).normalize()
        const blocked = occluders.some(({ bvh, inverse }) => {
          ray.origin.copy(origin).applyMatrix4(inverse)
          ray.direction.copy(groupDir).transformDirection(inverse)
          return bvh.raycastFirst(ray, THREE.DoubleSide) !== null
        })
        data[j * MAP_SIZE + i] = blocked ? 0 : 255
      }
    }

    const texture = new THREE.DataTexture(data, MAP_SIZE, MAP_SIZE, THREE.RedFormat, THREE.UnsignedByteType)
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearFilter
    texture.needsUpdate = true
    return texture
  })
}
