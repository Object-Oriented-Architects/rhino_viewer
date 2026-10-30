import * as THREE from 'three'

export type Vec3 = [number, number, number]
export interface CameraPayload {
  pos: Vec3
  target: Vec3
  up: Vec3
  halfV: number
  halfH: number
  parallel: boolean
  halfHeight: number
  halfWidth: number
}
export interface ObjectRef {
  id: string
  rev: number
  url: string
}
export interface MaterialDescriptor {
  kind: 1 | 2
  color: Vec3
  metallic: number
  roughness: number
  ior: number
  opacity: number
  clearcoat: number
  clearcoatRoughness: number
}
export interface Manifest {
  version: number
  center: Vec3
  scale: number
  background: string
  camera: CameraPayload | null
  materials: Record<string, MaterialDescriptor>
  objects: ObjectRef[]
}
export interface ExportScene {
  manifest: Manifest
  blocks: Map<string, Uint8Array<ArrayBuffer>>
}
const magic = (v: DataView, expected: string) => {
  if (v.byteLength < 8 || String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset, 4)) !== expected)
    throw new Error(`${expected} 헤더가 올바르지 않습니다`)
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** C# Guid.ToByteArray의 앞 세 필드는 little-endian이다. */
export function materialGuid(view: DataView, offset: number) {
  const hex = (value: number, length: number) => value.toString(16).padStart(length, '0')
  const bytes = (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => hex(view.getUint8(offset + start + i), 2)).join('')
  return `${hex(view.getUint32(offset, true), 8)}-${hex(view.getUint16(offset + 4, true), 4)}-${hex(view.getUint16(offset + 6, true), 4)}-${bytes(8, 2)}-${bytes(10, 6)}`
}

export function validateManifest(m: Manifest) {
  if (
    !Number.isSafeInteger(m.version) ||
    !Array.isArray(m.center) ||
    m.center.length !== 3 ||
    !m.center.every(Number.isFinite) ||
    !Number.isFinite(m.scale) ||
    m.scale <= 0 ||
    !Array.isArray(m.objects)
  )
    throw new Error('장면 매니페스트가 올바르지 않습니다')
  if (!m.materials || typeof m.materials !== 'object' || Array.isArray(m.materials))
    throw new Error('장면 재질 표가 올바르지 않습니다')
  const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1
  for (const [id, material] of Object.entries(m.materials)) {
    if (
      !guid.test(id) ||
      !material ||
      (material.kind !== 1 && material.kind !== 2) ||
      !Array.isArray(material.color) ||
      material.color.length !== 3 ||
      !material.color.every(unit) ||
      ![material.metallic, material.roughness, material.opacity, material.clearcoat, material.clearcoatRoughness].every(
        unit,
      ) ||
      !Number.isFinite(material.ior) ||
      material.ior < 1
    )
      throw new Error('장면 재질 값이 올바르지 않습니다')
  }
  const ids = new Set<string>()
  for (const o of m.objects) {
    if (typeof o.id !== 'string' || ids.has(o.id) || !Number.isSafeInteger(o.rev) || typeof o.url !== 'string')
      throw new Error('장면 객체 참조가 올바르지 않습니다')
    ids.add(o.id)
  }
  return m
}

/** Decode once, keep bytes rather than a data URL or a giant React key/state string. */
export function decodeExport(base64: string): ExportScene {
  // 4문자 경계 청크를 한 번씩만 디코드해 거대한 바이너리 문자열 임시 사본을 피한다.
  if (base64.length % 4) throw new Error('RVS1 base64 길이가 올바르지 않습니다')
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const buffer = new ArrayBuffer((base64.length / 4) * 3 - padding)
  const bytes = new Uint8Array(buffer)
  for (let offset = 0; offset < base64.length; offset += 65536) {
    const binary = atob(base64.slice(offset, offset + 65536))
    const start = (offset / 4) * 3
    for (let i = 0; i < binary.length; i++) bytes[start + i] = binary.charCodeAt(i)
  }
  const view = new DataView(buffer)
  magic(view, 'RVS1')
  const length = view.getUint32(4, true),
    start = Math.ceil((8 + length) / 4) * 4
  if (start > buffer.byteLength) throw new Error('RVS1 헤더가 잘렸습니다')
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length)))
  const blocks = new Map<string, Uint8Array<ArrayBuffer>>()
  const objects = header.objects.map((o: { id: string; offset: number; length: number }) => {
    if (
      !Number.isSafeInteger(o.offset) ||
      !Number.isSafeInteger(o.length) ||
      o.offset < 0 ||
      o.length < 2 ||
      start + o.offset + o.length > buffer.byteLength
    )
      throw new Error('RVS1 객체 범위가 올바르지 않습니다')
    blocks.set(o.id, bytes.subarray(start + o.offset, start + o.offset + o.length))
    return { id: o.id, rev: 0, url: '' }
  })
  return { manifest: validateManifest({ ...header, version: 1, objects }), blocks }
}

/** Arrays are aligned, zero-copy views of the decompressed RVM2 buffer. */
export async function decodeObject(compressed: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  const view = new DataView(buffer)
  magic(view, 'RVM2')
  if (buffer.byteLength < 32) throw new Error('RVM2 기준점이 잘렸습니다')
  const origin = new THREE.Vector3(view.getFloat64(8, true), view.getFloat64(16, true), view.getFloat64(24, true))
  if (!origin.toArray().every(Number.isFinite)) throw new Error('RVM2 기준점이 올바르지 않습니다')
  const count = view.getUint32(4, true)
  let at = 32
  const parts: { kind: number; materialId: string; geometry: THREE.BufferGeometry }[] = []
  try {
    for (let i = 0; i < count; i++) {
      if (at + 28 > buffer.byteLength) throw new Error('RVM2 파트가 잘렸습니다')
      const kind = view.getUint8(at),
        materialId = materialGuid(view, at + 4),
        vertices = view.getUint32(at + 20, true),
        indices = view.getUint32(at + 24, true)
      const end = at + 28 + vertices * 24 + indices * 4
      if (
        kind > 2 ||
        view.getUint8(at + 1) ||
        view.getUint8(at + 2) ||
        view.getUint8(at + 3) ||
        vertices === 0 ||
        indices === 0 ||
        indices % 3 ||
        end > buffer.byteLength
      )
        throw new Error('RVM2 파트가 올바르지 않습니다')
      const positions = new Float32Array(buffer, at + 28, vertices * 3)
      const normals = new Float32Array(buffer, at + 28 + vertices * 12, vertices * 3)
      const index = new Uint32Array(buffer, at + 28 + vertices * 24, indices)
      if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite) || index.some((n) => n >= vertices))
        throw new Error('RVM2 메시 데이터가 올바르지 않습니다')
      const geometry = new THREE.BufferGeometry()
      parts.push({ kind, materialId, geometry })
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
      geometry.setIndex(new THREE.BufferAttribute(index, 1))
      if (!normals.some((n) => n !== 0)) geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      at = end
    }
    if (!parts.length || at !== buffer.byteLength) throw new Error('RVM2 길이 또는 파트 수가 올바르지 않습니다')
    return { origin, parts }
  } catch (error) {
    parts.forEach((p) => p.geometry.dispose())
    throw error
  }
}
