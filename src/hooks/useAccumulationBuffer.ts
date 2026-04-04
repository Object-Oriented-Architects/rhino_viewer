import { useRef, useMemo, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface AccumulationBufferState {
  readBuffer: THREE.WebGLRenderTarget
  writeBuffer: THREE.WebGLRenderTarget
  swap: () => void
  resetAccumulation: () => void
  frameCount: number
}

function createTarget(width: number, height: number, withDepthTexture = false): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  })
  if (withDepthTexture) {
    rt.depthTexture = new THREE.DepthTexture(width, height)
    rt.depthTexture.format = THREE.DepthFormat
    rt.depthTexture.type = THREE.UnsignedIntType
  }
  return rt
}

export function useAccumulationBuffer(): AccumulationBufferState {
  const { gl, size, viewport } = useThree()
  const dpr = viewport.dpr

  const targets = useMemo(() => {
    const w = Math.floor(size.width * dpr)
    const h = Math.floor(size.height * dpr)
    return {
      a: createTarget(w, h, true),  // writeBuffer: depth texture for reprojection
      b: createTarget(w, h, true),  // readBuffer: depth texture for reprojection
    }
  }, []) // Created once, resized via useEffect

  const currentIsA = useRef(true)
  const frameCountRef = useRef(0)

  // Resize targets when canvas size changes
  useEffect(() => {
    const w = Math.floor(size.width * dpr)
    const h = Math.floor(size.height * dpr)
    targets.a.setSize(w, h)
    targets.b.setSize(w, h)
    if (targets.a.depthTexture) {
      targets.a.depthTexture.image.width = w
      targets.a.depthTexture.image.height = h
      targets.a.depthTexture.needsUpdate = true
    }
    if (targets.b.depthTexture) {
      targets.b.depthTexture.image.width = w
      targets.b.depthTexture.image.height = h
      targets.b.depthTexture.needsUpdate = true
    }
    // Clear both buffers on resize
    gl.setRenderTarget(targets.a)
    gl.clear()
    gl.setRenderTarget(targets.b)
    gl.clear()
    gl.setRenderTarget(null)
    frameCountRef.current = 0
  }, [size.width, size.height, dpr, gl, targets])

  // Dispose on unmount
  useEffect(() => {
    return () => {
      targets.a.dispose()
      targets.b.dispose()
    }
  }, [targets])

  const state = useRef<AccumulationBufferState>({
    readBuffer: targets.a,
    writeBuffer: targets.b,
    swap: () => {
      currentIsA.current = !currentIsA.current
      state.current.readBuffer = currentIsA.current ? targets.a : targets.b
      state.current.writeBuffer = currentIsA.current ? targets.b : targets.a
    },
    resetAccumulation: () => {
      gl.setRenderTarget(targets.a)
      gl.clear()
      gl.setRenderTarget(targets.b)
      gl.clear()
      gl.setRenderTarget(null)
      frameCountRef.current = 0
    },
    frameCount: 0,
  })

  // Keep state refs in sync with targets
  state.current.readBuffer = currentIsA.current ? targets.a : targets.b
  state.current.writeBuffer = currentIsA.current ? targets.b : targets.a
  state.current.frameCount = frameCountRef.current

  // Expose a way to increment frame count from GemAccumulator
  Object.defineProperty(state.current, 'frameCount', {
    get: () => frameCountRef.current,
    set: (v: number) => { frameCountRef.current = v },
    configurable: true,
  })

  return state.current
}
