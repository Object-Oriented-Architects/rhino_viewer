'use client'

import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { DiamondMaterial, type DiamondMaterialOptions } from './DiamondMaterial'
import { createCutGeometry, type GemCut } from './cutGeometry'
import { useGemEnv } from './GemEnvironment'

// 거들 반지름 1 기준 — 링 뷰와 같은 카메라 거리에서 화면 높이의 절반 남짓을 채운다
export const PREVIEW_SCALE = 0.8

interface CutGemPreviewProps {
  cut: GemCut
  /** 센터석 광학 값 (환경은 GemEnvironment에서 받음) */
  options: DiamondMaterialOptions
  /** 지정 시 레이트레이싱 대신 MeshPhysicalMaterial로 비교 렌더 */
  physical: THREE.MeshPhysicalMaterialParameters | null
}

/** 모델 없이 이상적인 컷 하나만 보는 미리보기 (Jewel_test 브릴리언트/에메랄드 뷰) */
export function CutGemPreview({ cut, options, physical }: CutGemPreviewProps) {
  const gemEnv = useGemEnv()
  const geometry = useMemo(() => createCutGeometry(cut), [cut])
  const material = useMemo(() => new DiamondMaterial(geometry), [geometry])
  useEffect(
    () => () => {
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )

  useLayoutEffect(() => {
    if (gemEnv) material.update({ envMap: gemEnv.envMap, envRotation: gemEnv.rotation, ...options })
  }, [material, gemEnv, options])

  if (!physical && !gemEnv) return null

  return physical ? (
    <mesh key='physical' geometry={geometry} scale={PREVIEW_SCALE} userData={{ isGem: true }}>
      <meshPhysicalMaterial key={`physical-${physical.flatShading}`} {...physical} />
    </mesh>
  ) : (
    <mesh key='raytrace' geometry={geometry} material={material} scale={PREVIEW_SCALE} userData={{ isGem: true }} />
  )
}
