import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export interface CameraMotionState {
  isMoving: boolean
  framesSinceStopped: number
  movementSpeed: number
}

const THRESHOLD = 1e-6

export function useCameraMotion(): CameraMotionState {
  const prevMatrix = useRef(new Float64Array(16))
  const state = useRef<CameraMotionState>({
    isMoving: true,
    framesSinceStopped: 0,
    movementSpeed: 0,
  })
  const initialized = useRef(false)

  useFrame(({ camera }) => {
    const elements = camera.matrixWorld.elements

    if (!initialized.current) {
      for (let i = 0; i < 16; i++) prevMatrix.current[i] = elements[i]
      initialized.current = true
      return
    }

    let maxDiff = 0
    for (let i = 0; i < 16; i++) {
      const diff = Math.abs(elements[i] - prevMatrix.current[i])
      if (diff > maxDiff) maxDiff = diff
      prevMatrix.current[i] = elements[i]
    }

    state.current.movementSpeed = maxDiff

    if (maxDiff > THRESHOLD) {
      state.current.isMoving = true
      state.current.framesSinceStopped = 0
    } else {
      state.current.isMoving = false
      state.current.framesSinceStopped++
    }
  })

  return state.current
}
