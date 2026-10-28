'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// three r186 블러 커널 크기 (r179는 [3, 5, 7, 9, 11]) — 계수 계산이 바뀌어 같은 번짐 폭을 내려면 이 크기가 필요
const KERNEL_SIZES = [6, 10, 14, 18, 22]

/**
 * three r186의 UnrealBloomPass (three.js, MIT) — 이 프로젝트의 three(r179)와 블러·합성 셰이더가 다르다.
 * r179는 합성 결과를 rgb × alpha로 더하고 r186은 premultiplied rgb(3 × strength)를 그대로 더해,
 * 같은 strength 0.12에서도 r186 빛번짐이 훨씬 세다. Jewel_test는 r186으로 빌드돼 그 값에 맞춰져 있다.
 * 렌더 루프·렌더 타깃은 r179와 같아 블러·합성 재질만 r186 것으로 바꾼다.
 */
class UnrealBloomPassR186 extends UnrealBloomPass {
  constructor(resolution: THREE.Vector2, strength: number, radius: number, threshold: number) {
    super(resolution, strength, radius, threshold)
    // super가 r179 커널 크기로 만든 블러 재질을 r186 크기로 다시 만든다 (재질 생성은 아래 재정의 메서드)
    this.separableBlurMaterials.forEach((material) => material.dispose())
    let resx = Math.round(this.resolution.x / 2)
    let resy = Math.round(this.resolution.y / 2)
    this.separableBlurMaterials = KERNEL_SIZES.map((kernelRadius) => {
      const material = this._getSeparableBlurMaterial(kernelRadius)
      material.uniforms.invSize.value = new THREE.Vector2(1 / resx, 1 / resy)
      resx = Math.round(resx / 2)
      resy = Math.round(resy / 2)
      return material
    })
    this.blendMaterial.premultipliedAlpha = true
  }

  _getSeparableBlurMaterial(kernelRadius: number) {
    const coefficients: number[] = []
    const sigma = kernelRadius / 3
    for (let i = 0; i < kernelRadius; i++) {
      coefficients.push((0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma)
    }

    // 이웃한 두 탭을 bilinear 샘플 하나로 합친다
    const offsets: number[] = []
    const weights: number[] = []
    for (let i = 1; i < kernelRadius; i += 2) {
      const wa = coefficients[i]
      const wb = i + 1 < kernelRadius ? coefficients[i + 1] : 0
      const w = wa + wb
      offsets.push((i * wa + (i + 1) * wb) / w)
      weights.push(w)
    }

    return new THREE.ShaderMaterial({
      defines: { KERNEL_PAIRS: offsets.length },
      uniforms: {
        colorTexture: { value: null },
        invSize: { value: new THREE.Vector2(0.5, 0.5) },
        direction: { value: new THREE.Vector2(0.5, 0.5) },
        centerWeight: { value: coefficients[0] },
        gaussianOffsets: { value: offsets },
        gaussianWeights: { value: weights },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        varying vec2 vUv;
        uniform sampler2D colorTexture;
        uniform vec2 invSize;
        uniform vec2 direction;
        uniform float centerWeight;
        uniform float gaussianOffsets[KERNEL_PAIRS];
        uniform float gaussianWeights[KERNEL_PAIRS];
        void main() {
          vec3 diffuseSum = texture2D(colorTexture, vUv).rgb * centerWeight;
          for (int i = 0; i < KERNEL_PAIRS; i++) {
            vec2 uvOffset = direction * invSize * gaussianOffsets[i];
            vec3 sample1 = texture2D(colorTexture, vUv + uvOffset).rgb;
            vec3 sample2 = texture2D(colorTexture, vUv - uvOffset).rgb;
            diffuseSum += (sample1 + sample2) * gaussianWeights[i];
          }
          gl_FragColor = vec4(diffuseSum, 1.0);
        }
      `,
    })
  }

  _getCompositeMaterial(nMips: number) {
    return new THREE.ShaderMaterial({
      defines: { NUM_MIPS: nMips },
      uniforms: {
        blurTexture1: { value: null },
        blurTexture2: { value: null },
        blurTexture3: { value: null },
        blurTexture4: { value: null },
        blurTexture5: { value: null },
        bloomStrength: { value: 1.0 },
        bloomFactors: { value: null },
        bloomTintColors: { value: null },
        bloomRadius: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D blurTexture1;
        uniform sampler2D blurTexture2;
        uniform sampler2D blurTexture3;
        uniform sampler2D blurTexture4;
        uniform sampler2D blurTexture5;
        uniform float bloomStrength;
        uniform float bloomRadius;
        uniform float bloomFactors[NUM_MIPS];
        uniform vec3 bloomTintColors[NUM_MIPS];

        float lerpBloomFactor(const in float factor) {
          float mirrorFactor = 1.2 - factor;
          return mix(factor, mirrorFactor, bloomRadius);
        }

        void main() {
          // 3.0: r179의 알파 기반 세기와 맞추려는 r186의 보정 계수
          vec3 bloom = 3.0 * bloomStrength * (
            lerpBloomFactor(bloomFactors[0]) * bloomTintColors[0] * texture2D(blurTexture1, vUv).rgb +
            lerpBloomFactor(bloomFactors[1]) * bloomTintColors[1] * texture2D(blurTexture2, vUv).rgb +
            lerpBloomFactor(bloomFactors[2]) * bloomTintColors[2] * texture2D(blurTexture3, vUv).rgb +
            lerpBloomFactor(bloomFactors[3]) * bloomTintColors[3] * texture2D(blurTexture4, vUv).rgb +
            lerpBloomFactor(bloomFactors[4]) * bloomTintColors[4] * texture2D(blurTexture5, vUv).rgb
          );
          float bloomAlpha = max(bloom.r, max(bloom.g, bloom.b));
          gl_FragColor = vec4(bloom, bloomAlpha);
        }
      `,
    })
  }
}

interface UnrealBloomComposerProps {
  /** 장면 렌더 타깃 MSAA 샘플 수 — 바꾸면 컴포저를 새로 만든다 */
  samples: number
  strength: number
  radius: number
  threshold: number
}

/**
 * three 기본 후처리 체인 RenderPass → UnrealBloomPass(r186) → OutputPass(톤매핑·sRGB) — Jewel_test 파이프라인.
 * 톤매핑 종류·노출은 renderer 설정을 OutputPass가 읽는다. useFrame 우선순위 1로 R3F 기본 렌더를 대신한다.
 */
export function UnrealBloomComposer({ samples, strength, radius, threshold }: UnrealBloomComposerProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)

  const { composer, bloomPass } = useMemo(() => {
    const composer = new EffectComposer(gl, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }))
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPassR186(new THREE.Vector2(1, 1), 0, 0, 0)
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())
    return { composer, bloomPass }
  }, [gl, scene, camera, samples])

  useEffect(() => {
    return () => {
      composer.passes.forEach((pass) => pass.dispose())
      composer.dispose()
    }
  }, [composer])

  // Jewel_test는 렌더 배율이 이미 곱해진 렌더 타깃을 EffectComposer에 넘겨, 로드 직후엔 블룸 버퍼에만 배율이 한 번 더
  // 곱해진다(addPass가 다시 곱함) — 창 크기·배율이 바뀌기 전까지 빛번짐 폭이 화면 기준 1/배율. 첫 크기 설정만 그 상태로
  const sizedOnce = useRef(false)
  useEffect(() => {
    composer.setPixelRatio(dpr)
    composer.setSize(size.width, size.height)
    if (!sizedOnce.current) {
      sizedOnce.current = true
      bloomPass.setSize(size.width * dpr * dpr, size.height * dpr * dpr)
    }
  }, [composer, bloomPass, size.width, size.height, dpr])

  useEffect(() => {
    bloomPass.strength = strength
    bloomPass.radius = radius
    bloomPass.threshold = threshold
  }, [bloomPass, strength, radius, threshold])

  useFrame((_, delta) => composer.render(delta), 1)

  return null
}
