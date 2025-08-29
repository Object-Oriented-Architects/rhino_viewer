'use client'

import { useGLTF } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo, useRef, useState, useEffect } from 'react'
import { Line, useCursor, MeshDistortMaterial } from '@react-three/drei'
import { useRouter } from 'next/navigation'

export const Blob = ({ route = '/', ...props }) => {
  const router = useRouter()
  const [hovered, hover] = useState(false)
  useCursor(hovered)
  return (
    <mesh
      onClick={() => router.push(route)}
      onPointerOver={() => hover(true)}
      onPointerOut={() => hover(false)}
      {...props}
    >
      <sphereGeometry args={[1, 64, 64]} />
      <MeshDistortMaterial roughness={0.5} color={hovered ? 'hotpink' : '#1fb2f5'} />
    </mesh>
  )
}

export function Breezm({ onLoadComplete, ...props }) {
  const filepath = '/model/Breezm_Pbr.3dm'

  // 텍스처들을 미리 로드
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    return {
      color: loader.load('/model/Breezm_Pbr_embedded_files/Color.jpg'),
      normal: loader.load('/model/Breezm_Pbr_embedded_files/Normal.jpg'),
      roughness: loader.load('/model/Breezm_Pbr_embedded_files/Roughness.jpg'),
      curvature: loader.load('/model/Breezm_Pbr_embedded_files/Curvature.png'),
    }
  }, [])

  const modelObj = useLoader(Rhino3dmLoader, filepath, (loader) => {
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
  })

  // 모델 로드 후 텍스처 수동 적용
  useEffect(() => {
    if (modelObj) {
      modelObj.traverse((child) => {
        // 타입 가드를 사용하여 Mesh인지 확인
        if (child instanceof THREE.Mesh) {
          const material = child.material

          // 재질이 MeshStandardMaterial 또는 MeshPhysicalMaterial인지 확인
          if (material instanceof THREE.MeshPhysicalMaterial) {
            // console.log(child.material.name)
            // 텍스처가 없는 경우에만 적용
            if (!material.map) {
              ;``
              if (child.material.name == 'Frame') {
                material.map = textures.color

                const hueShift = 220 / 360
                material.color.setHSL(hueShift, 0.8, 0.5)
                material.color.multiplyScalar(3)

                material.aoMap = textures.curvature
                material.aoMapIntensity = 0.7
              }
              if (child.material.name == 'Temple') {
                material.color.setHex(0xffffff) // 순백색
                material.metalness = 1.0 // 완전한 메탈
                material.roughness = 0.05 // 매우 낮은 거칠기
                material.envMapIntensity = 2.0 // 환경 맵 강도 더 증가
                material.clearcoat = 1.0 // 클리어코트 추가 (MeshPhysicalMaterial인 경우)
                material.clearcoatRoughness = 0.0 // 클리어코트 거칠기
                material.normalMap = textures.normal
              }
            }
            if (!material.roughnessMap) {
              material.roughnessMap = textures.roughness
            }

            material.needsUpdate = true
          }
        }
      })

      if (onLoadComplete) {
        onLoadComplete()
      }
    }
  }, [modelObj, textures, onLoadComplete])

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} {...props}>
      <primitive object={modelObj} />
    </group>
  )
}
