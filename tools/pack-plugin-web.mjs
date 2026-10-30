#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { viewerAssets } from './viewer-assets.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'out')
const target = path.join(root, 'dist/plugin-web')
if (!fs.existsSync(path.join(source, 'viewer-live/index.html'))) {
  throw new Error('정적 빌드가 없습니다. pnpm build:shell 을 실행하세요.')
}
fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
for (const entry of fs.readdirSync(source)) {
  if (entry === 'model' || entry === 'rhino3dm') continue
  fs.cpSync(path.join(source, entry), path.join(target, entry), { recursive: true })
}
for (const asset of viewerAssets(root, { liveOnly: true })) {
  const relative = asset.replace(/^\//, '')
  if (!relative.startsWith('model/') || relative.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`모델 자산 경로가 잘못되었습니다: ${asset}`)
  }
  const destination = path.join(target, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(path.join(source, relative), destination)
}
console.log('플러그인 웹 자산: dist/plugin-web (MSBuild에서 셸·EXE와 함께 ZIP 압축)')
