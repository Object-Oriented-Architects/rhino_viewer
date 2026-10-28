'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import * as THREE from 'three'
import { createStudioEnvCube, isStudioPreset, type StudioPreset } from './studioEnv'

export interface GemEnv {
  /** 보석 레이트레이서가 샘플하는 선명한 cube */
  envMap: THREE.CubeTexture
  /** 금속(scene.environmentRotation)과 같은 회전 규약의 샘플링 행렬 */
  rotation: THREE.Matrix3
}

const GemEnvContext = createContext<GemEnv | null>(null)

/** 가장 가까운 GemEnvironment의 보석용 환경 — 준비 전이면 null */
export const useGemEnv = () => useContext(GemEnvContext)

/** HDR equirect → 보석용 mipmap cube (pavé 자글거림 방지에 mip 필요) */
function equirectToMipmappedCube(gl: THREE.WebGLRenderer, equirect: THREE.Texture, resolution: number) {
  const cubeRT = new THREE.WebGLCubeRenderTarget(resolution)
  // fromEquirectangularTexture는 소스 텍스처의 필터 플래그를 RT에 복사하므로,
  // 변환하는 동안만 소스에 mip 플래그를 걸었다가 복원한다 (GPU 파라미터는 version
  // 변경 전엔 재적용되지 않아 소스 샘플링에는 영향 없음).
  const prevGenerateMipmaps = equirect.generateMipmaps
  const prevMinFilter = equirect.minFilter
  equirect.generateMipmaps = true
  equirect.minFilter = THREE.LinearMipmapLinearFilter
  cubeRT.fromEquirectangularTexture(gl, equirect)
  equirect.generateMipmaps = prevGenerateMipmaps
  equirect.minFilter = prevMinFilter
  return cubeRT
}

type LoadedEnv = { scene: THREE.Texture; gem: THREE.CubeTexture }

/** 소스(스튜디오 프리셋·HDR URL) 하나를 금속용 scene 텍스처 + 보석용 mipmap cube로 만든다 — null이면 건너뜀 */
function useLoadedEnv(source: string | null, resolution: number) {
  const gl = useThree((state) => state.gl)
  const [env, setEnv] = useState<LoadedEnv | null>(null)

  useEffect(() => {
    if (source === null) return
    const owned: { dispose(): void }[] = []
    let cancelled = false

    if (isStudioPreset(source)) {
      const cubeRT = createStudioEnvCube(gl, source, resolution)
      owned.push(cubeRT)
      setEnv({ scene: cubeRT.texture, gem: cubeRT.texture })
    } else {
      new RGBELoader().loadAsync(source).then((hdr) => {
        if (cancelled) {
          hdr.dispose()
          return
        }
        hdr.mapping = THREE.EquirectangularReflectionMapping
        const cubeRT = equirectToMipmappedCube(gl, hdr, resolution)
        owned.push(hdr, cubeRT)
        setEnv({ scene: hdr, gem: cubeRT.texture })
      })
    }

    return () => {
      cancelled = true
      setEnv(null)
      owned.forEach((resource) => resource.dispose())
    }
  }, [gl, source, resolution])

  return env
}

interface GemEnvironmentProps {
  /** 절차적 스튜디오 프리셋 이름, 또는 HDR(.hdr) URL (blob URL 포함) */
  source: StudioPreset | string
  /**
   * 보석 레이트레이서만 쓰는 환경 (없으면 source와 같음). 흰 배경용 밝은 환경은 금속엔 맞지만
   * 보석엔 반짝임이 눌린다 — 돔이 이미 1.0이라 핀라이트 하이라이트와 흰 facet이 톤매핑 뒤 거의 같은 흰색이 된다.
   * 어두운 스튜디오를 따로 비추면 검은 facet 위에 하이라이트가 선다 (ijewel3d도 보석 전용 envMap을 쓴다)
   */
  gemSource?: StudioPreset | string
  /** 금속용 scene.environmentIntensity — 보석은 재질의 envMapIntensity를 따로 쓴다 */
  intensity?: number
  rotation?: THREE.Euler
  /** 보석 cube만 돌리는 회전 (없으면 rotation과 같음) — Jewel_test의 라이트 회전 슬라이더는 보석 환경만 돌린다 */
  gemRotation?: THREE.Euler
  /** 보석용 cube 한 면 해상도 */
  resolution?: number
  children?: ReactNode
}

/**
 * 씬 환경(금속 반사)과 보석용 cube를 만든다 — gemSource가 없으면 한 소스를 공유해 둘을 일치시킨다.
 * 보석 메시는 children 안에서 useGemEnv()로 cube를 받는다.
 */
export function GemEnvironment({
  source,
  gemSource,
  intensity = 1,
  rotation,
  gemRotation: gemOnlyRotation,
  resolution = 512,
  children,
}: GemEnvironmentProps) {
  const separateGem = gemSource !== undefined && gemSource !== source
  const env = useLoadedEnv(source, resolution)
  const gemOnlyEnv = useLoadedEnv(separateGem ? gemSource : null, resolution)
  const gemCube = separateGem ? gemOnlyEnv?.gem : env?.gem

  // three는 envMapRotation의 xyz를 반전해 샘플링한다 (render target cube·equirect 공통) — 같은 규약으로 맞춤
  const gemRotation = useMemo(() => {
    const e = gemOnlyRotation ?? rotation ?? new THREE.Euler()
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-e.x, -e.y, -e.z, e.order))
    return new THREE.Matrix3().setFromMatrix4(m)
  }, [gemOnlyRotation, rotation])

  const gemEnv = useMemo(() => (gemCube ? { envMap: gemCube, rotation: gemRotation } : null), [gemCube, gemRotation])

  return (
    <>
      {env && <Environment map={env.scene} environmentIntensity={intensity} environmentRotation={rotation} />}
      <GemEnvContext.Provider value={gemEnv}>{children}</GemEnvContext.Provider>
    </>
  )
}
