import fs from 'node:fs'
import path from 'node:path'

// 셸과 패널이 같은 설정에서 자산 경로를 읽는다.
export function viewerAssets(repoRoot, { noScene = false, liveOnly = false } = {}) {
  const source = fs.readFileSync(path.join(repoRoot, 'src/config/ring-plusplastic.ts'), 'utf8')
  const assets = new Set()
  for (const match of source.matchAll(/(modelPath|hdrPath|shadowTexturePath):\s*'([^']+)'/g)) {
    if (noScene && match[1] !== 'hdrPath') continue
    if (liveOnly && match[1] === 'modelPath') continue
    assets.add(match[2])
  }
  if (assets.size === 0) throw new Error('뷰어 설정에 참조 자산이 없습니다')
  return assets
}
