import { useRef, useMemo, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer as ThreeEffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { useCameraMotion } from '@/hooks/useCameraMotion'

interface ScreenBloomProps {
  intensity?: number
  threshold?: number
  radius?: number
  motionEnabled?: boolean
  fadeInSpeed?: number
  fadeOutSpeed?: number
}

export function ScreenBloom({
  intensity = 1.0,
  threshold = 0.9,
  radius = 0.8,
  motionEnabled = true,
  fadeInSpeed = 8,
  fadeOutSpeed = 3,
}: ScreenBloomProps) {
  const { gl, size, viewport } = useThree()
  const cameraMotion = useCameraMotion()
  const currentIntensity = useRef(0)
  const targetIntensityRef = useRef(intensity)

  useEffect(() => {
    targetIntensityRef.current = intensity
  }, [intensity])

  const resources = useMemo(() => {
    const dpr = viewport.dpr
    const w = Math.floor(size.width * dpr)
    const h = Math.floor(size.height * dpr)

    const fbTexture = new THREE.FramebufferTexture(w, h)
    fbTexture.minFilter = THREE.LinearFilter
    fbTexture.magFilter = THREE.LinearFilter

    const composer = new ThreeEffectComposer(gl)
    composer.renderToScreen = true
    composer.setSize(w, h)

    const texturePass = new TexturePass(fbTexture)
    texturePass.needsSwap = true

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      intensity,
      radius,
      threshold,
    )

    composer.addPass(texturePass)
    composer.addPass(bloomPass)

    return { composer, texturePass, bloomPass, fbTexture }
  }, [gl, size.width, size.height, viewport.dpr])

  useEffect(() => {
    return () => {
      resources.fbTexture.dispose()
      resources.bloomPass.dispose()
      resources.composer.renderTarget1.dispose()
      resources.composer.renderTarget2.dispose()
    }
  }, [resources])

  useFrame((_, delta) => {
    let effectiveIntensity: number

    if (!motionEnabled) {
      effectiveIntensity = targetIntensityRef.current
    } else {
      const target = cameraMotion.isMoving ? targetIntensityRef.current : 0
      const speed = cameraMotion.isMoving ? fadeInSpeed : fadeOutSpeed
      currentIntensity.current = THREE.MathUtils.lerp(
        currentIntensity.current,
        target,
        1 - Math.exp(-speed * delta),
      )
      effectiveIntensity = currentIntensity.current
    }

    if (effectiveIntensity < 0.001) return

    resources.bloomPass.strength = effectiveIntensity
    resources.bloomPass.threshold = threshold
    resources.bloomPass.radius = radius

    // 스크린 버퍼는 이미 톤매핑+sRGB 적용 상태이므로
    // bloom 패스 중에 이중 적용되지 않도록 임시 비활성화
    const prevToneMapping = gl.toneMapping
    const prevOutputColorSpace = gl.outputColorSpace
    gl.toneMapping = THREE.NoToneMapping
    gl.outputColorSpace = THREE.LinearSRGBColorSpace

    gl.copyFramebufferToTexture(resources.fbTexture)
    resources.composer.render(delta)

    gl.toneMapping = prevToneMapping
    gl.outputColorSpace = prevOutputColorSpace
  }, 3)

  return null
}
