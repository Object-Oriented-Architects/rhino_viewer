import { useMemo, useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCameraMotion } from '@/hooks/useCameraMotion'
import { useAccumulationBuffer } from '@/hooks/useAccumulationBuffer'

// Halton sequence for sub-pixel jitter
function halton(index: number, base: number): number {
  let f = 1
  let r = 0
  let i = index
  while (i > 0) {
    f /= base
    r += f * (i % base)
    i = Math.floor(i / base)
  }
  return r
}

// Shared vertex shader
const fullscreenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Reprojection blend shader:
// 현재 프레임의 depth로 world position을 복원 → 이전 프레임의 UV로 재투영 → 블렌딩
const reprojectBlendFrag = /* glsl */ `
  uniform sampler2D tCurrent;
  uniform sampler2D tCurrentDepth;
  uniform sampler2D tAccumulated;
  uniform float blendFactor;
  uniform mat4 currentInvViewProj;   // current frame: inverse(proj * view)
  uniform mat4 prevViewProj;         // previous frame: proj * view
  uniform vec2 resolution;

  varying vec2 vUv;

  void main() {
    vec4 current = texture2D(tCurrent, vUv);

    // 현재 프레임에 gem이 없으면 (alpha 0)
    // 즉시 (0,0,0,0)으로 지우면 다음 프레임 TIR 시 가드 작동 불가 → 영구 검정
    // 대신 이전 누적값을 빠르게 페이드: 회전 시 즉시 사라지고, 정지 시 보존
    if (current.a < 0.001) {
      vec4 accum = texture2D(tAccumulated, vUv);
      if (accum.a > 0.001) {
        float fade = max(1.0 - blendFactor * 5.0, 0.0);
        gl_FragColor = accum * fade;
      } else {
        gl_FragColor = vec4(0.0);
      }
      return;
    }

    // 1. 현재 depth로 clip-space position 복원
    float depth = texture2D(tCurrentDepth, vUv).r;
    vec2 ndc = vUv * 2.0 - 1.0;
    float ndcZ = depth * 2.0 - 1.0;
    vec4 clipPos = vec4(ndc, ndcZ, 1.0);

    // 2. world position 복원
    vec4 worldPos = currentInvViewProj * clipPos;
    worldPos /= worldPos.w;

    // 3. 이전 프레임의 screen position으로 재투영
    vec4 prevClip = prevViewProj * worldPos;
    vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;

    // 4. 화면 밖이면 현재 프레임만 사용 (disocclusion)
    if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
      gl_FragColor = current;
      return;
    }

    // 5. 이전 누적 버퍼에서 재투영된 위치를 샘플링
    vec4 accumulated = texture2D(tAccumulated, prevUv);

    // 이전 프레임에 데이터가 없으면 현재만 사용
    if (accumulated.a < 0.001) {
      gl_FragColor = current;
      return;
    }

    // 6. TIR (전반사) 감지 및 블렌딩
    float lumCurrent = dot(current.rgb, vec3(0.2126, 0.7152, 0.0722));
    float lumAccum = dot(accumulated.rgb, vec3(0.2126, 0.7152, 0.0722));

    // TIR black-out 방지: 현재 프레임이 거의 검정이면 무조건 누적값 유지
    // (검은 TIR 프레임이 누적 버퍼에 들어가면 영구 고착되므로 차단)
    if (lumCurrent < 0.01 && current.a > 0.5) {
      gl_FragColor = accumulated;
      return;
    }

    // 현재 프레임이 누적보다 밝으면 → sparkle/fire → 더 많이 반영
    // 현재 프레임이 비슷하거나 어두우면 → noise → 강하게 스무딩
    float brightnessBias = smoothstep(0.0, 0.5, lumCurrent - lumAccum);
    float adjustedBlend = mix(blendFactor, max(blendFactor, 0.8), brightnessBias);

    gl_FragColor = mix(accumulated, current, adjustedBlend);
  }
`

// Composite shader: alpha-over onto framebuffer (with sRGB conversion for screen output)
// gem은 의도적으로 toneMapped=false → HDR 밝기를 유지하여 반짝임/brilliance 표현
const compositeFrag = /* glsl */ `
  uniform sampler2D tGems;
  uniform bool toScreen;
  varying vec2 vUv;

  vec3 linearToSRGB(vec3 color) {
    return mix(
      pow(color, vec3(1.0 / 2.4)) * 1.055 - 0.055,
      color * 12.92,
      step(color, vec3(0.0031308))
    );
  }

  void main() {
    vec4 gems = texture2D(tGems, vUv);
    if (gems.a < 0.001) discard;
    if (toScreen) {
      gl_FragColor = vec4(linearToSRGB(gems.rgb), gems.a);
    } else {
      gl_FragColor = gems;
    }
  }
`

interface GemAccumulatorProps {
  enabled?: boolean
  movingBlendFactor?: number
  maxAccumulationFrames?: number
  jitterEnabled?: boolean
  /** 값이 바뀔 때마다 누적 버퍼 초기화 (옵션 변경 시 오래된 데이터 방지) */
  resetKey?: number
}

export function GemAccumulator({
  enabled = true,
  movingBlendFactor = 0.4,
  maxAccumulationFrames = 64,
  jitterEnabled = true,
  resetKey = 0,
}: GemAccumulatorProps) {
  const { scene, camera, gl } = useThree()
  const cameraMotion = useCameraMotion()
  const accumBuffer = useAccumulationBuffer()
  const jitterFrame = useRef(0)

  // resetKey가 바뀌면 누적 버퍼 초기화 (옵션 변경 시 오래된 데이터 제거)
  const prevResetKey = useRef(resetKey)
  useEffect(() => {
    if (prevResetKey.current !== resetKey) {
      prevResetKey.current = resetKey
      accumBuffer.resetAccumulation()
      jitterFrame.current = 0
    }
  }, [resetKey, accumBuffer])

  // 이전 프레임의 viewProjection matrix 저장
  const prevViewProjMatrix = useRef(new THREE.Matrix4())
  const currentInvViewProjMatrix = useRef(new THREE.Matrix4())
  const tempMatrix = useRef(new THREE.Matrix4())

  // Fullscreen quad + materials
  const fsQuad = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const vertices = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0])
    const uvs = new Float32Array([0, 0, 2, 0, 0, 2])
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

    const blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tCurrentDepth: { value: null },
        tAccumulated: { value: null },
        blendFactor: { value: 1.0 },
        currentInvViewProj: { value: new THREE.Matrix4() },
        prevViewProj: { value: new THREE.Matrix4() },
        resolution: { value: new THREE.Vector2() },
      },
      vertexShader: fullscreenVert,
      fragmentShader: reprojectBlendFrag,
      depthTest: false,
      depthWrite: false,
    })

    const compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tGems: { value: null },
        toScreen: { value: false },
      },
      vertexShader: fullscreenVert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })

    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const blendMesh = new THREE.Mesh(geometry, blendMaterial)
    const compositeMesh = new THREE.Mesh(geometry, compositeMaterial)
    blendMesh.frustumCulled = false
    compositeMesh.frustumCulled = false

    // Temp render target for blend output
    const blendTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    })

    return { geometry, blendMaterial, compositeMaterial, orthoCamera, blendMesh, compositeMesh, blendTarget }
  }, [])

  // Resize blend target with canvas
  const { size, viewport } = useThree()
  useEffect(() => {
    const w = Math.floor(size.width * viewport.dpr)
    const h = Math.floor(size.height * viewport.dpr)
    fsQuad.blendTarget.setSize(w, h)
    fsQuad.blendMaterial.uniforms.resolution.value.set(w, h)
  }, [size.width, size.height, viewport.dpr, fsQuad])

  // Cleanup
  useEffect(() => {
    return () => {
      fsQuad.geometry.dispose()
      fsQuad.blendMaterial.dispose()
      fsQuad.compositeMaterial.dispose()
      fsQuad.blendTarget.dispose()
    }
  }, [fsQuad])

  // Main rendering pipeline
  useFrame(() => {
    const prevBackground = scene.background
    scene.background = null
    gl.autoClear = false

    const ctx = gl.getContext()
    const { writeBuffer, readBuffer } = accumBuffer

    // === Phase A: Metal depth pre-pass into writeBuffer ===
    gl.setRenderTarget(writeBuffer)
    gl.clear(true, true, false) // clear color + depth

    const gemMeshes: THREE.Object3D[] = []
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.isGem && obj.visible) {
        obj.visible = false
        gemMeshes.push(obj)
      }
    })
    ctx.colorMask(false, false, false, false)
    gl.render(scene, camera)
    ctx.colorMask(true, true, true, true)

    // === Phase B: Gem render to writeBuffer (with depth test against metal) ===
    const nonGemMeshes: THREE.Object3D[] = []
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !obj.userData.isGem && obj.visible) {
        obj.visible = false
        nonGemMeshes.push(obj)
      }
    })
    gemMeshes.forEach((m) => {
      m.visible = true
    })

    // Camera jitter when stopped (sub-pixel offset for supersampling)
    let origProjElement8 = 0
    let origProjElement9 = 0
    const shouldJitter = enabled && jitterEnabled && !cameraMotion.isMoving
    if (shouldJitter) {
      const frame = jitterFrame.current++
      const jitterX = (halton(frame % 1024, 2) - 0.5) / (size.width * viewport.dpr)
      const jitterY = (halton(frame % 1024, 3) - 0.5) / (size.height * viewport.dpr)
      origProjElement8 = camera.projectionMatrix.elements[8]
      origProjElement9 = camera.projectionMatrix.elements[9]
      camera.projectionMatrix.elements[8] += jitterX * 2
      camera.projectionMatrix.elements[9] += jitterY * 2
    }

    gl.render(scene, camera)

    // Restore camera projection
    if (shouldJitter) {
      camera.projectionMatrix.elements[8] = origProjElement8
      camera.projectionMatrix.elements[9] = origProjElement9
    }

    // Restore scene
    nonGemMeshes.forEach((m) => {
      m.visible = true
    })
    scene.background = prevBackground

    if (!enabled) {
      // Accumulation 비활성: 바로 화면에 출력 (sRGB 변환 필요)
      gl.setRenderTarget(null)
      fsQuad.compositeMaterial.uniforms.tGems.value = writeBuffer.texture
      fsQuad.compositeMaterial.uniforms.toScreen.value = true
      gl.render(fsQuad.compositeMesh, fsQuad.orthoCamera)
      gl.autoClear = true
      // 현재 viewProjection 저장
      tempMatrix.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      prevViewProjMatrix.current.copy(tempMatrix.current)
      return
    }

    // === Phase C: Reprojection blend (회전 중 + 정지 모두) ===

    // 현재 viewProjection matrix
    tempMatrix.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    // 현재 inverse viewProjection
    currentInvViewProjMatrix.current.copy(tempMatrix.current).invert()

    // Blend factor 결정
    let blendFactor: number
    if (cameraMotion.isMoving) {
      // 회전 중: EMA (reprojection으로 잔상 없이 블렌딩)
      blendFactor = movingBlendFactor
    } else {
      // 정지 시: 1/N 산술 평균 누적
      const n = Math.min(cameraMotion.framesSinceStopped + 1, maxAccumulationFrames)
      blendFactor = 1.0 / n
    }

    // Blend uniforms 설정
    const blendUniforms = fsQuad.blendMaterial.uniforms
    blendUniforms.tCurrent.value = writeBuffer.texture
    blendUniforms.tCurrentDepth.value = writeBuffer.depthTexture
    blendUniforms.tAccumulated.value = readBuffer.texture
    blendUniforms.blendFactor.value = blendFactor
    blendUniforms.currentInvViewProj.value.copy(currentInvViewProjMatrix.current)
    blendUniforms.prevViewProj.value.copy(prevViewProjMatrix.current)

    // Blend → blendTarget
    gl.setRenderTarget(fsQuad.blendTarget)
    gl.clear()
    gl.render(fsQuad.blendMesh, fsQuad.orthoCamera)

    // Copy blend result to readBuffer for next frame (linear space, no gamma)
    gl.setRenderTarget(readBuffer)
    gl.clear()
    fsQuad.compositeMaterial.uniforms.tGems.value = fsQuad.blendTarget.texture
    fsQuad.compositeMaterial.uniforms.toScreen.value = false
    gl.render(fsQuad.compositeMesh, fsQuad.orthoCamera)

    // === Phase D: Composite accumulated result to screen (sRGB 변환) ===
    gl.setRenderTarget(null)
    fsQuad.compositeMaterial.uniforms.tGems.value = fsQuad.blendTarget.texture
    fsQuad.compositeMaterial.uniforms.toScreen.value = true
    gl.render(fsQuad.compositeMesh, fsQuad.orthoCamera)

    gl.autoClear = true

    // 현재 viewProjection을 다음 프레임의 prevViewProj로 저장
    prevViewProjMatrix.current.copy(tempMatrix.current)
    accumBuffer.frameCount++
  }, 2) // priority 2: after EffectComposer

  return null
}
