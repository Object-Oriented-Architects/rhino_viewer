#!/usr/bin/env node
/**
 * 정적 빌드(out/) → 단일 HTML 패키지.
 *
 * out/<page>/index.html 이 참조하는 CSS·에셋과 **모든 JS 청크**를 인라인해 파일 하나로 만든다.
 *
 * Next(Turbopack)를 인라인으로 접을 때 걸리는 함정 세 가지를 여기서 처리한다:
 *
 * 1. 청크 헤더의 `document.currentScript` 는 런타임이 청크 URL 을 계산하는 값이다.
 *    인라인 스크립트는 src 가 없어 null 이 되므로, 그 청크의 URL 을 직접 넣는다.
 *    단 런타임은 이 값에서 '/_next/' 접두사를 떼어 키로 쓰므로 **상대 경로**를 넣어야 한다.
 *    (전체 경로를 넣으면 키가 '/_next//_next/...' 로 어긋나 청크 대기 promise 가 안 풀린다)
 *
 * 2. Next 런타임은 document.currentScript.src 로 에셋 프리픽스를 계산하고 pathname 에
 *    '/_next/' 가 없으면 throw 한다. 인라인 스크립트는 src 가 '' 라 new URL('') 이 터지므로
 *    자기 URL 을 돌려주는 getter 를 심는다.
 *
 * 3. 런타임이 스크립트를 주입해 청크를 로드하면 그 URL 은 blob: 이 되어 다시 1번과 같은 키
 *    불일치가 생긴다. 그래서 **모든 청크를 미리 등록**해 주입 자체를 없앤다. 엔트리 메타데이터
 *    청크(otherChunks/runtimeModuleIds)는 다른 청크가 모두 등록된 뒤 마지막에 실행한다.
 *
 * 에셋(3dm/HDR/그림자 텍스처)은 fetch·XHR 훅으로 내장 data: URL 을 돌려준다.
 * file:// 에서는 경로가 '/C:/...' 로 해석되므로 정확 일치 대신 접미사로 매칭한다.
 *
 * 사용: node tools/pack-single-html.mjs [--page viewer] [--out dist/rhinoviewer.html]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const page = argOf('--page', 'viewer')
// --no-scene: 샘플 3dm 을 넣지 않는다 (플러그인 export shell — 씬은 export 시 주입된다)
const noScene = args.includes('--no-scene')
const includeRhino3dm = page !== 'viewer-live'
const outFile = path.resolve(repoRoot, argOf('--out', 'dist/rhinoviewer.html'))
const outDir = path.join(repoRoot, 'out')
const pageHtml = path.join(outDir, page, 'index.html')

if (!fs.existsSync(pageHtml)) {
  console.error(`정적 빌드가 없습니다: ${pageHtml}\n  NEXT_STATIC_EXPORT=1 pnpm build 를 먼저 실행하세요.`)
  process.exit(1)
}

const MIME = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.3dm': 'application/octet-stream',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
}

const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB'

/** 인라인 <script> 본문에 넣을 수 있게 </script 를 escape (JS 문자열 리터럴 안에서 안전) */
const inlineSafe = (js) => js.replace(/<\/script/gi, '<\\/script')

const CURRENT_SCRIPT_EXPR = '"object"==typeof document?document.currentScript:void 0'

/** 함정 1 — 청크 URL 을 '/_next/' 뗀 상대 경로로 넣는다 */
const patchChunkHeader = (js, url) => {
  const count = js.split(CURRENT_SCRIPT_EXPR).length - 1
  if (count !== 1) throw new Error(`청크 헤더 교체 대상이 1개여야 합니다(실제 ${count}개): ${url}`)
  return js.replaceAll(CURRENT_SCRIPT_EXPR, JSON.stringify(url.replace(/^\/_next\//, '')))
}

/** 함정 2 — 인라인 스크립트의 src 를 자기 URL 로 응답하게 만든다 */
const inlineSrcShim = (url) =>
  `try{var __cs=document.currentScript;` +
  `if(__cs&&!__cs.getAttribute("src"))Object.defineProperty(__cs,"src",{configurable:true,` +
  `get:function(){return new URL(${JSON.stringify(url)},location.href).href}})}catch(__e){};`

// ---------------------------------------------------------------- 에셋
// 뷰어 config 가 참조하는 파일만 넣는다 (다른 페이지 모델까지 끌어오면 수십 MB가 된다)
const configSrc = fs.readFileSync(path.join(repoRoot, 'src', 'config', 'ring-plusplastic.ts'), 'utf8')
const assetPaths = new Set(includeRhino3dm ? ['/rhino3dm/rhino3dm.js', '/rhino3dm/rhino3dm.wasm'] : [])
if (!noScene) assetPaths.add('/model/glasses/Breezm_Pbr_shadow_embedded_files/gradient_02.jpg')
for (const m of configSrc.matchAll(/(modelPath|hdrPath|shadowTexturePath):\s*'([^']+)'/g)) {
  if (noScene && (m[1] === 'modelPath' || m[1] === 'shadowTexturePath')) continue
  assetPaths.add(m[2])
}

// Turbopack may request CSS again during hydration, even though the initial link is inlined.
const attr = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]
for (const match of fs.readFileSync(pageHtml, 'utf8').matchAll(/<link\b[^>]*>/gi)) {
  if (attr(match[0], 'rel')?.toLowerCase() === 'stylesheet') {
    const href = attr(match[0], 'href')
    if (!href) throw new Error('스타일시트에 href가 없습니다')
    assetPaths.add(href)
  }
}

const assetDataUrl = new Map()
let assetBytes = 0
for (const urlPath of assetPaths) {
  const file = path.join(outDir, urlPath.replace(/^\//, ''))
  if (!fs.existsSync(file)) {
    throw new Error(`필수 에셋이 없습니다: ${urlPath}`)
  }
  assetBytes += fs.statSync(file).size
  const mime = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  assetDataUrl.set(urlPath, `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`)
}

// ---------------------------------------------------------------- HTML 변환
let html = fs.readFileSync(pageHtml, 'utf8')

if ((html.match(/<head>/gi) ?? []).length !== 1) throw new Error('<head> 앵커가 정확히 1개여야 합니다')
if (!(html.match(/<\/body>/gi) ?? []).length) throw new Error('</body> 앵커가 없습니다')
let stylesheetCount = 0,
  inlinedStylesheets = 0
html = html.replace(/<link\b[^>]*>/gi, (whole) => {
  const rel = attr(whole, 'rel')?.toLowerCase()
  if (rel === 'preload') return ''
  if (rel !== 'stylesheet') return whole
  stylesheetCount++
  const href = attr(whole, 'href')
  if (!href) throw new Error('스타일시트에 href가 없습니다')
  const file = path.join(outDir, href.replace(/^\//, ''))
  if (!fs.existsSync(file)) throw new Error(`필수 스타일시트가 없습니다: ${href}`)
  inlinedStylesheets++
  return `<style>${fs.readFileSync(file, 'utf8')}</style>`
})
if (
  stylesheetCount !== inlinedStylesheets ||
  [...html.matchAll(/<link\b[^>]*>/gi)].some((m) => attr(m[0], 'rel')?.toLowerCase() === 'stylesheet')
)
  throw new Error('일부 스타일시트를 인라인하지 못했습니다')

// 원본 HTML 의 스크립트 태그를 걷어내고 속성(id="_R_" 등)만 기억한다
const scriptAttrs = new Map()
const noModuleScripts = new Set()
html = html.replace(/<script\b([^>]*)><\/script>/gi, (whole, attributes) => {
  const src = attr(attributes, 'src')
  if (!src || !src.startsWith('/_next/')) return whole
  const attrs = attributes.replace(/\s*src\s*=\s*["'][^"']*["']/i, '')
  if (/\bnomodule\b/i.test(attrs)) {
    noModuleScripts.add(src)
    return '' // Do not reintroduce this polyfill in the all-chunks pass below.
  }
  scriptAttrs.set(src, attrs.replace(/\s*async=""/g, ''))
  return ''
})

// 함정 3 — 모든 청크를 미리 인라인. 엔트리 메타데이터 청크는 마지막.
const chunkDir = path.join(outDir, '_next', 'static', 'chunks')
const normal = []
const entryMeta = []
for (const name of fs.readdirSync(chunkDir).sort()) {
  if (!name.endsWith('.js')) continue
  const src = `/_next/static/chunks/${name}`
  if (noModuleScripts.has(src)) continue
  const patched = patchChunkHeader(fs.readFileSync(path.join(chunkDir, name), 'utf8'), src)
  const tag = `<script${scriptAttrs.get(src) ?? ''}>${inlineSrcShim(src)}${inlineSafe(patched)}</script>`
  ;(patched.includes('runtimeModuleIds') ? entryMeta : normal).push(tag)
}

if (entryMeta.length !== 1) throw new Error(`runtimeModuleIds 청크가 1개여야 합니다(실제 ${entryMeta.length}개)`)

// ---------------------------------------------------------------- 런타임 훅
const prelude = `
<script>
(function(){
  var ASSETS = ${JSON.stringify(Object.fromEntries(assetDataUrl))};
  var assetKeys = Object.keys(ASSETS);

  // file:// 에서는 pathname 이 '/C:/...' 로 해석된다 — 접미사로 매칭한다
  function matchAsset(pathname){
    if (ASSETS[pathname]) return pathname;
    for (var i = 0; i < assetKeys.length; i++) {
      var k = assetKeys[i];
      if (pathname.length >= k.length && pathname.slice(-k.length) === k) return k;
    }
    return null;
  }

  var origFetch = window.fetch;
  window.fetch = function(input, init){
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var k = matchAsset(new URL(url, location.href).pathname);
      if (k) return origFetch(ASSETS[k], init);
    } catch(e) {}
    return origFetch(input, init);
  };

  // 모든 청크를 이미 등록했으므로 런타임이 /_next/ 스크립트를 주입하면 404 만 남는다 — 빈 스크립트로 무해화
  function neutralize(node){
    try {
      if (node && node.tagName === 'LINK' && node.href) {
        var k = matchAsset(new URL(node.href, location.href).pathname);
        if (k) node.href = ASSETS[k];
      }
      if (node && node.tagName === 'SCRIPT' && node.src) {
        var p = new URL(node.src, location.href).pathname;
        if (p.indexOf('/_next/') !== -1) node.src = 'data:text/javascript,';
      }
    } catch(e) {}
  }
  var origAppend = Node.prototype.appendChild;
  Node.prototype.appendChild = function(node){ neutralize(node); return origAppend.call(this, node); };
  var origInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(node, ref){ neutralize(node); return origInsert.call(this, node, ref); };

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url){
    try {
      var k = matchAsset(new URL(url, location.href).pathname);
      if (k) arguments[1] = ASSETS[k];
    } catch(e) {}
    return origOpen.apply(this, arguments);
  };

  // TextureLoader uses <img>, not fetch/XHR. Cover both DOM ways of assigning src.
  function imageUrl(value){
    try {
      var k = matchAsset(new URL(value, location.href).pathname);
      if (k) return ASSETS[k];
    } catch(e) {}
    return value;
  }
  var imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: imageSrc.configurable, enumerable: imageSrc.enumerable,
    get: imageSrc.get,
    set: function(value){ imageSrc.set.call(this, imageUrl(value)); }
  });
  var imageSetAttribute = HTMLImageElement.prototype.setAttribute;
  HTMLImageElement.prototype.setAttribute = function(name, value){
    return imageSetAttribute.call(this, name, String(name).toLowerCase() === 'src' ? imageUrl(value) : value);
  };

  window.__RHINOVIEW_ERRORS = [];
  window.addEventListener('error', function(e){
    window.__RHINOVIEW_ERRORS.push(e.message || e.type);
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e.reason;
    window.__RHINOVIEW_ERRORS.push('처리 실패: ' + (r && (r.stack || r.message || String(r))));
  });
})();
</script>
`

html = html.replace(/<head>/i, '<head>' + prelude)

// flight data 안의 문자열에 '</body>' 가 들어있을 수 있으니 마지막(실제) 태그 앞에 넣는다
const chunksHtml = normal.join('') + entryMeta.join('')
const bodyMatches = [...html.matchAll(/<\/body>/gi)]
if (!bodyMatches.length) throw new Error('</body> 삽입 앵커가 없습니다')
const at = bodyMatches[bodyMatches.length - 1].index
html = html.slice(0, at) + chunksHtml + html.slice(at)
if ([...html.matchAll(/<script\b[^>]*>/gi)].some((m) => attr(m[0], 'src')?.includes('/_next/')))
  throw new Error('외부 /_next/ 스크립트가 남아 있습니다')

// ---------------------------------------------------------------- 쓰기
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, html)

console.log(`패키징 완료: ${outFile}`)
console.log(`  html    ${mb(Buffer.byteLength(html))}`)
console.log(`  chunks  ${normal.length + entryMeta.length} 개 (entry-meta ${entryMeta.length})`)
console.log(`  assets  ${assetDataUrl.size} 개 (${mb(assetBytes)} 원본)`)
