'use client'

import { useGLTF, MeshRefractionMaterial } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo, useEffect, useState } from 'react'
import { useControls } from 'leva'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

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

// Blue Nile 실제 다이아몬드 파라미터
const blueNileDiamondParams = {
  ior: 2.41,
  bounces: 4,
  aberrationStrength: 0.044,
  fresnel: 0.1,
  fastChroma: true,
}

export function JewelryViewer({ onLoadComplete }: JewelryViewerProps) {
  // glTF 모델 로드 (Draco 압축 자동 지원)
  const shank = useGLTF('/model/bluenile/Shank_BNS08.gltf')
  const head = useGLTF('/model/bluenile/Head_BNH09_PC_RND_100.gltf')
  const diamond = useGLTF('/model/bluenile/RND.gltf')

  // 환경맵 로드 (다이아몬드용)
  const envMap = useLoader(RGBELoader, '/model/ring/env.hdr')
  envMap.mapping = THREE.EquirectangularReflectionMapping

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

  // Diamond 컨트롤 (Blue Nile 파라미터 기본값)
  const diamondControls = useControls('Diamond', {
    color: { value: '#ffffff' },
    ior: { value: blueNileDiamondParams.ior, min: 1.5, max: 3, step: 0.01 },
    bounces: { value: blueNileDiamondParams.bounces, min: 1, max: 10, step: 1 },
    fresnel: { value: blueNileDiamondParams.fresnel, min: 0, max: 1, step: 0.01 },
    aberrationStrength: { value: blueNileDiamondParams.aberrationStrength, min: 0, max: 0.1, step: 0.001 },
    fastChroma: { value: blueNileDiamondParams.fastChroma },
    // 다이아몬드 Transform
    scale: { value: 0.01, min: 0.001, max: 0.1, step: 0.001 },
    positionY: { value: 0.003, min: -0.05, max: 0.05, step: 0.001 },
  })

  // 다이아몬드 geometry 추출
  const diamondGeometry = useMemo(() => {
    let geometry: THREE.BufferGeometry | null = null
    diamond.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && !geometry) {
        geometry = child.geometry
      }
    })
    return geometry
  }, [diamond])

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

  if (!matcapMaterial || !diamondGeometry) {
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

      {/* 메인 다이아몬드 - MeshRefractionMaterial 사용 */}
      <mesh
        geometry={diamondGeometry}
        scale={diamondControls.scale}
        position={[0, transformControls.headPositionY + diamondControls.positionY, 0]}
      >
        <MeshRefractionMaterial
          envMap={envMap}
          color={diamondControls.color}
          ior={diamondControls.ior}
          bounces={diamondControls.bounces}
          fresnel={diamondControls.fresnel}
          aberrationStrength={diamondControls.aberrationStrength}
          fastChroma={diamondControls.fastChroma}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

// glTF 모델 프리로드
useGLTF.preload('/model/bluenile/Shank_BNS08.gltf')
useGLTF.preload('/model/bluenile/Head_BNH09_PC_RND_100.gltf')
useGLTF.preload('/model/bluenile/RND.gltf')
