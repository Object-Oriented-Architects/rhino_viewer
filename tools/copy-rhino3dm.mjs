#!/usr/bin/env node
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.dirname(require.resolve('rhino3dm/package.json'))
const target = path.join(root, 'public', 'rhino3dm')
mkdirSync(target, { recursive: true })
for (const name of ['rhino3dm.js', 'rhino3dm.wasm']) copyFileSync(path.join(source, name), path.join(target, name))
console.log('Copied rhino3dm 8.17.0 JS/WASM to public/rhino3dm/')
