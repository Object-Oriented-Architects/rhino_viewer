#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function run(script, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(path.join(root, 'tools/copy-rhino3dm.mjs'))
run(require.resolve('next/dist/bin/next'), ['build'], { NEXT_STATIC_EXPORT: '1' })
run(path.join(root, 'tools/pack-single-html.mjs'), [
  '--page',
  'viewer-live',
  '--no-scene',
  '--out',
  'dist/rhinoviewer-shell.html',
])
run(path.join(root, 'tools/pack-plugin-web.mjs'))
