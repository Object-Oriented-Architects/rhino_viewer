import { useRef, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useCameraMotion } from '@/hooks/useCameraMotion'

interface MotionBloomProps {
  intensity?: number
  luminanceThreshold?: number
  luminanceSmoothing?: number
  radius?: number
  levels?: number
  mipmapBlur?: boolean
  motionEnabled?: boolean
  fadeInSpeed?: number
  fadeOutSpeed?: number
}

export function MotionBloom({
  intensity = 1.0,
  luminanceThreshold,
  luminanceSmoothing,
  radius,
  levels,
  mipmapBlur,
  motionEnabled = true,
  fadeInSpeed = 8,
  fadeOutSpeed = 3,
}: MotionBloomProps) {
  const bloomEffect = useRef<any>(null)
  const bloomRefCallback = useCallback((effect: any) => {
    bloomEffect.current = effect
  }, [])
  const cameraMotion = useCameraMotion()
  const currentIntensity = useRef(0)
  const targetIntensityRef = useRef(intensity)

  useEffect(() => {
    targetIntensityRef.current = intensity
  }, [intensity])

  useFrame((_, delta) => {
    if (!bloomEffect.current) return

    if (!motionEnabled) {
      bloomEffect.current.intensity = targetIntensityRef.current
      return
    }

    const target = cameraMotion.isMoving ? targetIntensityRef.current : 0
    const speed = cameraMotion.isMoving ? fadeInSpeed : fadeOutSpeed
    currentIntensity.current = THREE.MathUtils.lerp(
      currentIntensity.current,
      target,
      1 - Math.exp(-speed * delta),
    )
    bloomEffect.current.intensity = currentIntensity.current
  })

  return (
    <Bloom
      ref={bloomRefCallback}
      intensity={0}
      luminanceThreshold={luminanceThreshold}
      luminanceSmoothing={luminanceSmoothing}
      radius={radius}
      levels={levels}
      mipmapBlur={mipmapBlur}
    />
  )
}
