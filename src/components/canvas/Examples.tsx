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

  // useLoader는 Suspense와 함께 작동하여 로딩 상태를 자동으로 처리
  const modelObj = useLoader(Rhino3dmLoader, filepath, (loader) => {
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
  })

  // 모델이 로드되면 콜백 호출
  useEffect(() => {
    if (modelObj && onLoadComplete) {
      onLoadComplete()
    }
  }, [modelObj, onLoadComplete])
  console.log(modelObj)

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} {...props}>
      <primitive object={modelObj} />
    </group>
  )
}
