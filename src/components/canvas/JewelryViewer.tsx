'use client'

import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo, useEffect, useLayoutEffect, useState } from 'react'
import { useControls } from 'leva'
import { DiamondMaterial } from './gem/DiamondMaterial'
import { toFacetedGeometry } from './gem/gemGeometry'
import { createStudioEnvCube } from './gem/studioEnv'

// Metal 타입 정의
type MetalType = 'white' | 'yellow' | 'rose'

interface JewelryViewerProps {
  onLoadComplete?: () => void
}

// Matcap 텍스처 경로
const matcapPaths: Record<MetalType, string> = {
  white: '/model/bluenile/matcap/white.png',
  yellow: '/model/bluenile/matcap/yellow.png',
  rose: '/model/bluenile/matcap/rose.png',
}

// 라운드 브릴리언트 다이아몬드 파라미터 (Jewel_test 센터석 기본값)
const diamondParams = {
  ior: 2.417,
  bounces: 5,
  aberrationStrength: 0.024,
}

export function JewelryViewer({ onLoadComplete }: JewelryViewerProps) {
  // glTF 모델 로드 (Draco 압축 자동 지원)
  const shank = useGLTF('/model/bluenile/Shank_BNS08.gltf')
  const head = useGLTF('/model/bluenile/Head_BNH09_PC_RND_100.gltf')
  const diamond = useGLTF('/model/bluenile/RND.gltf')

  // 다이아몬드용 절차적 스튜디오 환경 (금속은 matcap이라 환경맵 불필요)
  const gl = useThree((state) => state.gl)
  const [envCube, setEnvCube] = useState<THREE.WebGLCubeRenderTarget | null>(null)
  useEffect(() => {
    const cubeRT = createStudioEnvCube(gl, 'studio_luxury')
    setEnvCube(cubeRT)
    return () => cubeRT.dispose()
  }, [gl])

  // Matcap 텍스처 로드
  const [matcapTextures, setMatcapTextures] = useState<Record<MetalType, THREE.Texture | null>>({
    white: null,
    yellow: null,
    rose: null,
  })

  // Matcap 텍스처 로딩
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const loadPromises = Object.entries(matcapPaths).map(([key, path]) =>
      new Promise<[MetalType, THREE.Texture]>((resolve) => {
        loader.load(path, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace
          resolve([key as MetalType, texture])
        })
      }),
    )

    Promise.all(loadPromises).then((results) => {
      const textures = Object.fromEntries(results) as Record<MetalType, THREE.Texture>
      setMatcapTextures(textures)
    })
  }, [])

  // Metal 컨트롤
  const metalControls = useControls('Metal', {
    type: { value: 'white' as MetalType, options: ['white', 'yellow', 'rose'] },
  })

  // Transform 컨트롤 (스케일 및 위치 조정)
  const transformControls = useControls('Transform', {
    scale: { value: 100, min: 1, max: 500, step: 1 },
    positionY: { value: 0, min: -5, max: 5, step: 0.1 },
    headPositionY: { value: 0.006, min: -0.02, max: 0.02, step: 0.001 },
  })

  // Diamond 컨트롤
  const diamondControls = useControls('Diamond', {
    color: { value: '#ffffff' },
    ior: { value: diamondParams.ior, min: 1.5, max: 3, step: 0.01 },
    bounces: { value: diamondParams.bounces, min: 1, max: 7, step: 1 },
    aberrationStrength: { value: diamondParams.aberrationStrength, min: 0, max: 0.06, step: 0.001 },
    // 다이아몬드 Transform
    scale: { value: 0.01, min: 0.001, max: 0.1, step: 0.001 },
    positionY: { value: 0.003, min: -0.05, max: 0.05, step: 0.001 },
  })

  // 다이아몬드 geometry 추출 — 재질의 BVH와 메시가 같은 각면 geometry를 공유해야 한다
  const diamondGeometry = useMemo(() => {
    let geometry: THREE.BufferGeometry | null = null
    diamond.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && !geometry) {
        geometry = toFacetedGeometry(child.geometry)
      }
    })
    return geometry
  }, [diamond])

  const diamondMaterial = useMemo(() => diamondGeometry && new DiamondMaterial(diamondGeometry), [diamondGeometry])
  useEffect(() => () => diamondMaterial?.dispose(), [diamondMaterial])

  useLayoutEffect(() => {
    diamondMaterial?.update({
      envMap: envCube?.texture ?? null,
      color: diamondControls.color,
      ior: diamondControls.ior,
      bounces: diamondControls.bounces,
      aberrationStrength: diamondControls.aberrationStrength,
    })
  }, [diamondMaterial, envCube, diamondControls])

  // Matcap 재질 생성 및 적용
  const matcapMaterial = useMemo(() => {
    const selectedTexture = matcapTextures[metalControls.type]
    if (!selectedTexture) return null

    return new THREE.MeshMatcapMaterial({
      matcap: selectedTexture,
      color: '#ffffff',
    })
  }, [matcapTextures, metalControls.type])

  // 모델에 Matcap 재질 적용
  useEffect(() => {
    if (!matcapMaterial) return

    // Shank (반지 밴드)에 Matcap 적용
    shank.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = matcapMaterial
      }
    })

    // Head (반지 헤드)에 Matcap 적용
    head.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = matcapMaterial
      }
    })
  }, [shank, head, matcapMaterial])

  // 로딩 완료 콜백
  useEffect(() => {
    if (matcapMaterial && diamondGeometry && onLoadComplete) {
      onLoadComplete()
    }
  }, [matcapMaterial, diamondGeometry, onLoadComplete])

  if (!matcapMaterial || !diamondGeometry || !diamondMaterial || !envCube) {
    return null
  }

  return (
    <group scale={transformControls.scale} position={[0, transformControls.positionY, 0]}>
      {/* 반지 밴드 (Shank) */}
      <primitive object={shank.scene} />

      {/* 반지 헤드 */}
      <group position={[0, transformControls.headPositionY, 0]}>
        <primitive object={head.scene} />
      </group>

      {/* 메인 다이아몬드 - BVH 레이트레이싱 */}
      <mesh
        geometry={diamondGeometry}
        material={diamondMaterial}
        scale={diamondControls.scale}
        position={[0, transformControls.headPositionY + diamondControls.positionY, 0]}
      />
    </group>
  )
}

// glTF 모델 프리로드
useGLTF.preload('/model/bluenile/Shank_BNS08.gltf')
useGLTF.preload('/model/bluenile/Head_BNH09_PC_RND_100.gltf')
useGLTF.preload('/model/bluenile/RND.gltf')
