'use client'

import { BlendFunction, Effect } from 'postprocessing'
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'

const fragmentShader = /* glsl */ `
  uniform vec3 backgroundColor;
  uniform float vignette;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 같은 패스의 앞선 이펙트(Bloom SCREEN 블렌드는 알파를 max로 올린다) 대신 패스 입력의 원래 알파 = 물체 커버리지
    float coverage = clamp(texture2D(inputBuffer, uv).a, 0.0, 1.0);
    // 씬은 투명(검정·알파 0) 위에 그려져 색이 이미 커버리지로 premultiply돼 있다.
    // contrast > 0이면 BrightnessContrast가 배경 0을 음수로 밀어낸다 — 표시 범위로 자른 뒤 합성
    vec3 color = max(inputColor.rgb, vec3(0.0));
    // 중앙 = backgroundColor, 변 중앙(r=1)에서 vignette 비율만큼 어둡게 (r²)
    float r = length(uv - 0.5) * 2.0;
    vec3 background = backgroundColor * (1.0 - vignette * r * r);
    outputColor = vec4(color + background * (1.0 - coverage), 1.0);
  }
`

/**
 * 톤매핑·그레이딩을 거친 뒤 배경색을 깔아주는 이펙트 — EffectComposer의 마지막 Effect로 둔다.
 * 배경을 씬(scene.background)에 넣으면 ACES가 흰색(1.0)을 #e2 회색으로 눌러버린다.
 * 씬은 배경 없이 렌더하고, MSAA·SMAA로 부드러워진 알파(커버리지)로 합성해 실루엣 경계도 배경과 섞인다.
 * Bloom 빛번짐은 색 쪽에 이미 더해져 있어 배경 위에도 남는다.
 * 입력은 sRGB로 받는다 — 앞의 BrightnessContrast(sRGB 이펙트)와 사이에 선형 변환이 끼면 그 pow()에 음수가 들어가
 * NaN이 됐다(contrast > 0에서 배경이 검게 나옴).
 */
class BackgroundCompositeEffect extends Effect {
  constructor() {
    super('BackgroundCompositeEffect', fragmentShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['backgroundColor', new THREE.Uniform(new THREE.Color())],
        ['vignette', new THREE.Uniform(0)],
      ]),
    })
    this.inputColorSpace = THREE.SRGBColorSpace
  }
}

/** 씬에 `<color attach='background'>`를 두지 말 것 — 알파가 1로 차서 합성이 무효가 된다 */
export function BackgroundComposite({ color, vignette = 0 }: { color: THREE.ColorRepresentation; vignette?: number }) {
  const effect = useMemo(() => new BackgroundCompositeEffect(), [])

  useEffect(() => {
    // 셰이더가 sRGB 공간이라 선형 Color를 sRGB 값으로
    effect.uniforms.get('backgroundColor')!.value.set(color).convertLinearToSRGB()
  }, [effect, color])

  useEffect(() => {
    effect.uniforms.get('vignette')!.value = vignette
  }, [effect, vignette])

  useEffect(() => {
    return () => effect.dispose()
  }, [effect])

  return <primitive object={effect} />
}
