'use client'

import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Pass } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'

/** 정지 시 누적 평균에 넣는 최대 프레임 수 — 이후엔 1/N 가중 EMA로 계속 다듬는다 */
const PROGRESSIVE_FRAMES = 32

const halton = (index: number, base: number) => {
  let f = 1
  let r = 0
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base
    r += f * (i % base)
  }
  return r
}

// Halton(2,3) 서브픽셀 지터 시퀀스 (중심 기준 오프셋, ±0.5px) — 누적 프레임 수만큼 서로 다른 위치
const HALTON_JITTER: Array<[number, number]> = Array.from({ length: PROGRESSIVE_FRAMES }, (_, i) => [
  halton(i + 1, 2) - 0.5,
  halton(i + 1, 3) - 0.5,
])

/** 프레임 간 카메라 행렬 차이가 이보다 작으면 정지로 본다 (OrbitControls 감쇠 꼬리가 끝없이 남기는 미세 변화 무시) */
const STILL_EPSILON = 1e-5

/**
 * EMA 기반 시간축 안티앨리어싱 패스 (AfterimagePass 방식).
 * 작은 pavé 보석의 facet 단위 프레임 간 popping(자글거림)을 몇 프레임에 걸친
 * 페이드로 바꾼다. EffectComposer 체인 안에서 오프스크린 RT ping-pong으로만
 * 동작하므로 기본 프레임버퍼 읽기(파이프라인 스톨)가 없다.
 * - 정지 상태: 지터 프레임을 누적 평균(프로그레시브, 최대 32장)해 수퍼샘플 수준으로 수렴 — 자글거림·계단 제거
 * - 빠른 카메라 이동: 모션 크기에 비례해 블렌드를 줄여 잔상 억제
 */
class TemporalSmoothPass extends Pass {
  private historyRead: THREE.WebGLRenderTarget | null = null
  private historyWrite: THREE.WebGLRenderTarget | null = null
  private hasHistory = false
  private blendMaterial: THREE.ShaderMaterial
  private quadScene: THREE.Scene
  private quadCamera: THREE.OrthographicCamera
  private prevCamMatrix = new THREE.Matrix4()
  private sceneCamera: THREE.Camera
  /** 카메라가 멈춘 뒤 히스토리에 누적된 프레임 수 (움직이면 0) */
  private stillFrames = 0

  smoothing = 0.7

  constructor(sceneCamera: THREE.Camera) {
    super('TemporalSmoothPass')
    this.sceneCamera = sceneCamera

    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        currentFrame: { value: null },
        historyFrame: { value: null },
        blend: { value: 0 },
        texelSize: { value: new THREE.Vector2() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D currentFrame;
        uniform sampler2D historyFrame;
        uniform float blend;
        uniform vec2 texelSize;
        varying vec2 vUv;
        void main() {
          vec4 curr = texture2D(currentFrame, vUv);
          vec4 hist = texture2D(historyFrame, vUv);
          // Neighborhood clamp (anti-ghosting): 이전 프레임 값을 현재 프레임 3x3
          // 이웃의 min/max 범위로 제한 — 순간 스파이크/이동 잔상이 히스토리에
          // 잔류하는 것을 방지하면서 범위 내 시간 평균 효과는 유지한다.
          vec4 cmin = curr;
          vec4 cmax = curr;
          vec4 s;
          s = texture2D(currentFrame, vUv + texelSize * vec2(-1.0, -1.0)); cmin = min(cmin, s); cmax = max(cmax, s);
          s = texture2D(currentFrame, vUv + texelSize * vec2( 0.0, -1.0)); cmin = min(cmin, s); cmax = max(cmax, s);
          s = texture2D(currentFrame, vUv + texelSize * vec2( 1.0, -1.0)); cmin = min(cmin, s); cmax = max(cmax, s);
          s = texture2D(currentFrame, vUv + texelSize * vec2(-1.0,  0.0)); cmin = min(cmin, s); cmax = max(cmax, s);
          s = texture2D(currentFrame, vUv + texelSize * vec2( 1.0,  0.0)); cmin = min(cmin, s); cmax = max(cmax, s);
          s = texture2D(currentFrame, vUv + texelSize * vec2(-1.0,  1.0)); cmin = min(cmin, s); cmax = max(cmax, s);
          s = texture2D(currentFrame, vUv + texelSize * vec2( 0.0,  1.0)); cmin = min(cmin, s); cmax = max(cmax, s);
          s = texture2D(currentFrame, vUv + texelSize * vec2( 1.0,  1.0)); cmin = min(cmin, s); cmax = max(cmax, s);
          // 적응형 슬랙: 이웃 분산이 큰 곳(반짝이는 facet)은 clamp를 느슨하게 풀어
          // 시간 평균이 더 깊게 작동하고, 균일한 곳(배경)은 타이트하게 유지해
          // 고스팅을 차단한다.
          vec4 range = (cmax - cmin) * 0.5;
          cmin -= range;
          cmax += range;
          hist = clamp(hist, cmin, cmax);
          gl_FragColor = mix(curr, hist, blend);
          // 렌더타겟이 linear면 no-op, 화면(sRGB)이면 변환 — 타겟별 프로그램으로 자동 분기
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
    })
    this.quadScene = new THREE.Scene()
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blendMaterial)
    quad.frustumCulled = false
    this.quadScene.add(quad)
  }

  private ensureTargets(input: THREE.WebGLRenderTarget) {
    const w = input.width
    const h = input.height
    if (this.historyRead && this.historyRead.width === w && this.historyRead.height === h) return
    this.historyRead?.dispose()
    this.historyWrite?.dispose()
    const options: THREE.RenderTargetOptions = {
      depthBuffer: false,
      stencilBuffer: false,
      type: input.texture.type,
      colorSpace: input.texture.colorSpace as THREE.ColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    }
    this.historyRead = new THREE.WebGLRenderTarget(w, h, options)
    this.historyWrite = new THREE.WebGLRenderTarget(w, h, options)
    this.hasHistory = false
  }

  override render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    _outputBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.ensureTargets(inputBuffer)
    const historyRead = this.historyRead!
    const historyWrite = this.historyWrite!

    // 카메라 모션 크기 → 빠르게 움직일수록 블렌드 축소 (잔상 억제)
    const camMatrix = this.sceneCamera.matrixWorld
    let motion = 0
    let maxDelta = 0
    const prev = this.prevCamMatrix.elements
    const curr = camMatrix.elements
    for (let i = 0; i < 16; i++) {
      const delta = Math.abs(curr[i] - prev[i])
      maxDelta = Math.max(maxDelta, delta)
      if (i >= 12 && i < 15) motion += delta
    }
    this.prevCamMatrix.copy(camMatrix)
    // 빠른 드래그에선 히스토리를 거의 버린다 — 하한 0.3이면 블렌드 0.9에서 pavé가 이중상으로 남았다
    const motionScale = THREE.MathUtils.clamp(1 - motion * 8, 0.05, 1)

    // 정지면 running mean(1 - 1/n)으로 지터 샘플을 누적, 움직이면 EMA로 복귀
    this.stillFrames =
      this.hasHistory && maxDelta < STILL_EPSILON ? Math.min(this.stillFrames + 1, PROGRESSIVE_FRAMES) : 0
    const progressiveBlend = this.stillFrames > 0 ? 1 - 1 / (this.stillFrames + 1) : 0
    const effectiveBlend = this.hasHistory ? Math.max(this.smoothing * motionScale, progressiveBlend) : 0

    // 1) 현재+이전 프레임 블렌드 → historyWrite
    this.blendMaterial.uniforms.currentFrame.value = inputBuffer.texture
    this.blendMaterial.uniforms.historyFrame.value = historyRead.texture
    this.blendMaterial.uniforms.blend.value = effectiveBlend
    this.blendMaterial.uniforms.texelSize.value.set(1 / inputBuffer.width, 1 / inputBuffer.height)
    renderer.setRenderTarget(historyWrite)
    renderer.render(this.quadScene, this.quadCamera)

    // 2) 블렌드 결과 출력 (마지막 패스면 화면으로)
    this.blendMaterial.uniforms.currentFrame.value = historyWrite.texture
    this.blendMaterial.uniforms.blend.value = 0
    renderer.setRenderTarget(this.renderToScreen ? null : _outputBuffer)
    renderer.render(this.quadScene, this.quadCamera)

    // 3) ping-pong 스왑
    this.historyRead = historyWrite
    this.historyWrite = historyRead
    this.hasHistory = true
  }

  /** 직전 프레임에서 카메라가 멈춰 있었는지 — 지터는 이때만 켠다 */
  get isStill() {
    return this.stillFrames > 0
  }

  reset() {
    this.hasHistory = false
    this.stillFrames = 0
  }

  override dispose(): void {
    this.historyRead?.dispose()
    this.historyWrite?.dispose()
    this.blendMaterial.dispose()
    super.dispose()
  }
}

interface TemporalSmoothProps {
  /** 0~0.95. 이전 프레임 가중치 — 높을수록 자글거림 ↓ / 잔상(모션 블러) ↑. 0이면 통과 */
  smoothing?: number
  /**
   * 정지 시 카메라 서브픽셀 지터 — 누적 평균이 시간축 수퍼샘플링이 되게 함.
   * 움직이는 동안은 끈다: 짧은 EMA에선 지터가 평균되지 못하고 금속 엣지 깜빡임 노이즈로 남았다
   * (실측 자동회전 >8 깜빡임 픽셀: smoothing 0 → 7590, 0.75+지터 → 15087)
   */
  jitter?: boolean
}

/** EffectComposer 자식으로 넣는 시간축 스무딩 패스 (TAA: 지터 + EMA + 적응형 clamp, 정지 시 프로그레시브 누적) */
export function TemporalSmooth({ smoothing = 0.7, jitter = true }: TemporalSmoothProps) {
  const { camera, size } = useThree()
  const pass = useMemo(() => new TemporalSmoothPass(camera), [camera])
  const jitterFrame = useRef(0)

  useEffect(() => {
    pass.smoothing = smoothing
    if (smoothing === 0) pass.reset()
  }, [pass, smoothing])

  useEffect(() => {
    return () => pass.dispose()
  }, [pass])

  // 지터 해제 시(비활성/언마운트) 뷰 오프셋 원복
  const perspCamera = camera as THREE.PerspectiveCamera
  const jitterActive = jitter && smoothing > 0
  useEffect(() => {
    return () => {
      if (perspCamera.clearViewOffset) perspCamera.clearViewOffset()
    }
  }, [perspCamera, jitterActive])

  // composer(priority 1)가 씬을 렌더하기 전에 서브픽셀 오프셋 적용
  useFrame(() => {
    if (!jitterActive || !perspCamera.setViewOffset) return
    if (!pass.isStill) {
      if (perspCamera.view?.enabled) perspCamera.clearViewOffset()
      return
    }
    const [jx, jy] = HALTON_JITTER[jitterFrame.current % HALTON_JITTER.length]
    jitterFrame.current++
    perspCamera.setViewOffset(size.width, size.height, jx, jy, size.width, size.height)
  }, 0)

  return <primitive object={pass} />
}
