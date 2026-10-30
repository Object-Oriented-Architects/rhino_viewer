import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as THREE from 'three'

// 실제 TS 구현을 실행하되 WebGL·React 마운트는 필요하지 않다.
function compile(path, dependencies, globals = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInNewContext(
    code,
    {
      exports,
      require: (id) => {
        assert.ok(id in dependencies, `예상하지 않은 의존성: ${id}`)
        return dependencies[id]
      },
      Blob,
      Response,
      DecompressionStream,
      TextDecoder,
      Uint8Array,
      ArrayBuffer,
      DataView,
      atob,
      AbortController,
      performance,
      setTimeout,
      clearTimeout,
      ...globals,
    },
    { filename: path },
  )
  return exports
}

const protocol = compile('src/components/viewer/sceneProtocol.ts', { three: THREE })
const bytes = new Uint8Array(readFileSync(process.argv[2]))
const manifest = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const id = '00112233-4455-6677-8899-aabbccddeeff'
assert.equal(protocol.validateManifest(manifest), manifest)
const decoded = await protocol.decodeObject(bytes)
assert.equal(decoded.parts[0].materialId, '00000000-0000-0000-0000-000000000000')
assert.equal(decoded.parts[1].materialId, id)
assert.equal(decoded.parts[1].kind, manifest.materials[id].kind)
assert.equal(decoded.parts[1].geometry.getAttribute('position').count, 3)
decoded.parts.forEach((part) => part.geometry.dispose())
for (const change of [
  (m) => {
    delete m.materials
  },
  (m) => {
    m.materials = []
  },
  (m) => {
    m.materials[id].color = [1, NaN, 0]
  },
  (m) => {
    m.materials[id].ior = Infinity
  },
  (m) => {
    m.materials[id].opacity = -1
  },
  (m) => {
    m.materials[id].kind = 0
  },
  (m) => {
    m.materials.invalid = m.materials[id]
  },
]) {
  const invalid = structuredClone(manifest)
  change(invalid)
  assert.throws(() => protocol.validateManifest(invalid))
}
const raw = gunzipSync(bytes)
for (const change of [
  (b) => {
    b[3] = 0x31
  },
  (b) => {
    b[33] = 1
  },
  (b) => {
    b[32] = 3
  },
]) {
  const invalid = Buffer.from(raw)
  change(invalid)
  await assert.rejects(protocol.decodeObject(new Uint8Array(gzipSync(invalid))))
}
const rvs = readFileSync(resolve(dirname(process.argv[2]), 'material.rvs'))
const exported = protocol.decodeExport(rvs.toString('base64'))
assert.equal(exported.manifest.materials[id].ior, 1.76)
const block = await protocol.decodeObject([...exported.blocks.values()][0])
assert.equal(block.parts[1].materialId, id)
block.parts.forEach((part) => part.geometry.dispose())

class TestDiamond extends THREE.MeshBasicMaterial {
  constructor() {
    super()
  }
  update(options) {
    this.color.set(options.color ?? '#fff')
    this.ior = options.ior
  }
}
let bakes = 0
let frame = 0
const frames = new Map()
const live = compile(
  'src/components/viewer/LiveModel.tsx',
  {
    three: THREE,
    react: {},
    'react/jsx-runtime': {},
    '@/config': { ringPlusplasticConfig: { metal: { envMapIntensity: 0.8 }, diamond: {} } },
    '../canvas/gem/DiamondMaterial': { DiamondMaterial: TestDiamond },
    '../canvas/gem/gemGeometry': {
      splitFacetedStones: (geometry) => {
        const copy = geometry.clone()
        copy.computeBoundingSphere()
        return [copy]
      },
    },
    '../canvas/gem/GemEnvironment': {},
    '../canvas/gem/settingOcclusion': {
      createOccluder: ({ geometry }) => ({ geometry: geometry.clone() }),
      occluderIndex: () => {
        bakes++
        return () => false
      },
    },
    '../canvas/jewelryMaterials': {
      createMetalMaterial: (v) => new THREE.MeshPhysicalMaterial(v),
      gemControlDefaults: () => ({}),
      gemMaterialOptions: () => ({ center: { color: '#fff', ior: 2.417 }, pave: {} }),
      connectedGemOptions: (options) => options,
    },
    './sceneProtocol': protocol,
  },
  {
    requestAnimationFrame: (callback) => {
      frames.set(++frame, callback)
      return frame
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  },
)
const flush = () => {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback())
}
const refs = [{ id: 'object', rev: 1, url: '' }]
async function loadScene(materials, payload) {
  const scene = new live.LiveScene()
  scene.setEnvironment({})
  scene.reconcile({ ...manifest, materials, objects: refs }, new Map([['object', payload]]))
  while (scene.active) await new Promise((done) => setTimeout(done, 1))
  flush()
  return scene
}
const gems = await loadScene(manifest.materials, bytes)
const gemEntry = gems.entries.get('object')
const stone = gemEntry.stones[0]
const ruby = new THREE.Color().setRGB(0.878, 0.067, 0.373, THREE.SRGBColorSpace)
assert.ok(stone.mesh.material.color.equals(ruby))
assert.equal(stone.mesh.material.ior, 1.76)
assert.equal(gemEntry.group.children[0].material, gems.metal)

// 같은 id인 일반 리프 두 개도 실제 RVM2 디코드·load 경로로 만든다.
const generalRaw = Buffer.from(raw)
const second = 32 + 28 + generalRaw.readUInt32LE(52) * 24 + generalRaw.readUInt32LE(56) * 4
generalRaw[32] = generalRaw[second] = 1
generalRaw.copy(generalRaw, 36, second + 4, second + 20)
const updated = structuredClone(manifest)
updated.materials[id] = { ...updated.materials[id], kind: 1, color: [0.1, 0.2, 0.3], opacity: 0.25 }
const scene = await loadScene(updated.materials, new Uint8Array(gzipSync(generalRaw)))
const entry = scene.entries.get('object')
assert.equal(entry.stones.length, 0)
assert.equal(entry.surfaces.length, 2)
assert.equal(entry.occluders.length, 2)
const [surface1, surface2] = entry.surfaces.map((surface) => surface.mesh)
const shared = surface1.material
assert.equal(shared, surface2.material)
assert.equal(shared.transmission, 0.75)
assert.equal(shared.ior, 1.76)
assert.equal(shared.envMapIntensity, 0.8)
const baked = bakes
updated.materials[id].color = [0.8, 0.2, 0.1]
updated.materials[id].ior = 1.577
scene.reconcile({ ...updated, version: 3, objects: refs })
flush()
assert.equal(surface1.material, shared)
assert.equal(shared.ior, 1.577)
assert.equal(bakes, baked)
assert.ok(shared.color.equals(new THREE.Color().setRGB(0.8, 0.2, 0.1, THREE.SRGBColorSpace)))
gems.reconcile({
  ...updated,
  materials: { [id]: { ...updated.materials[id], kind: 2 } },
  version: 3,
  objects: refs,
})
flush()
gems.setEnvironment({})
assert.equal(stone.mesh.material.ior, 1.577)
assert.ok(stone.mesh.material.color.equals(shared.color))
assert.equal(bakes, baked)
// 불투명이면 Rhino의 IOR=1을 쓰지 않고, 투과와 왕복해도 기본값으로 돌아온다.
updated.materials[id].opacity = 1
updated.materials[id].ior = 1
scene.reconcile({ ...updated, version: 4, objects: refs })
flush()
assert.equal(surface1.material, shared)
assert.equal(shared.transmission, 0)
assert.equal(shared.ior, 1.5)
updated.materials[id].opacity = 0.5
updated.materials[id].ior = 1.523
scene.reconcile({ ...updated, version: 5, objects: refs })
flush()
assert.equal(shared.transmission, 0.5)
assert.equal(shared.ior, 1.523)
updated.materials[id].opacity = 1
updated.materials[id].ior = 1
scene.reconcile({ ...updated, version: 6, objects: refs })
flush()
assert.equal(shared.transmission, 0)
assert.equal(shared.ior, 1.5)
assert.equal(bakes, baked)
let disposed = 0
shared.addEventListener('dispose', () => disposed++)
scene.reconcile({ ...updated, materials: {}, version: 7, objects: refs })
flush()
assert.equal(surface1.material, scene.metal)
assert.equal(disposed, 1)
scene.reconcile({ ...updated, version: 8, objects: refs })
flush()
const unused = surface1.material
let unusedDisposed = 0
unused.addEventListener('dispose', () => unusedDisposed++)
scene.reconcile({ ...updated, version: 9, objects: [] })
flush()
assert.equal(unusedDisposed, 1)
scene.dispose()
gems.dispose()
