'use client'

import { useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'

// Jewel_test 렌더링 품질 프로필 — 센터석 분산 모드·반사 횟수, 렌더 배율, MSAA를 기기 성능에 맞춘다

export type QualityTier = 'desktop' | 'mobile'
export type QualityTierSetting = 'auto' | QualityTier

export const qualityTierOptions: Record<string, QualityTierSetting> = {
  '자동 감지': 'auto',
  '데스크톱 (6채널)': 'desktop',
  '모바일 최적화 (3채널)': 'mobile',
}

export const qualityTierLabel: Record<QualityTier, string> = {
  desktop: 'Desktop 6-Ch Ultra',
  mobile: 'Mobile 3-Ch Fast',
}

/** 모바일 UA, 터치 맥(iPad), 좁은 터치 화면이면 모바일 */
export function detectMobileDevice() {
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const coarseSmall = window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 820
  return uaMobile || touchMac || coarseSmall
}

/** 모바일은 렌더 배율을 1.5로 캡하고, 드래그 중엔 1.05까지 낮춰 프레임을 지킨다 */
export function tierDpr(tier: QualityTier, renderScale: number, interacting: boolean) {
  if (tier === 'desktop') return renderScale
  return Math.min(renderScale, interacting ? 1.05 : 1.5)
}

export const tierMultisampling = (tier: QualityTier) => (tier === 'mobile' ? 2 : 4)

const FPS_WINDOW_MS = 500
const LOW_FPS = 35
// 0.5초 창 6번 연속 = 3초 — 1.5초면 다른 탭·창이 GPU를 잠깐 나눠 쓴 것만으로 강등됐다 (강등은 되돌리지 않음)
const LOW_FPS_WINDOWS = 6
/** 마운트 직후는 모델 파싱·BVH 생성·셰이더 컴파일 멈칫거림이라 판정에서 뺀다 */
const WARMUP_MS = 3000

interface FpsGuardProps {
  /** 0.5초마다 갱신되는 FPS (표시용) */
  fpsRef: MutableRefObject<number>
  /**
   * 3초 연속 35fps 미만이면 호출 — 저사양 노트북·태블릿을 모바일 프로필로 자동 강등. 없으면 FPS만 잰다.
   * 강등은 보는 도중 보석 품질이 눈에 띄게 바뀌어 보인다 (분산 6→3채널, 반사 5→4회)
   */
  onLowFps?: () => void
}

/** FPS를 재고, onLowFps가 있으면 저 FPS가 이어질 때 알린다 */
export function FpsGuard({ fpsRef, onLowFps }: FpsGuardProps) {
  const frames = useRef(0)
  const mountedAt = useRef(performance.now())
  const windowStart = useRef(performance.now())
  const lowStreak = useRef(0)

  useFrame(() => {
    frames.current++
    const now = performance.now()
    const elapsed = now - windowStart.current
    if (elapsed < FPS_WINDOW_MS) return

    const fps = Math.round((frames.current * 1000) / elapsed)
    fpsRef.current = fps
    frames.current = 0
    windowStart.current = now

    const judged = onLowFps !== undefined && !document.hidden && now - mountedAt.current >= WARMUP_MS
    lowStreak.current = judged && fps < LOW_FPS ? lowStreak.current + 1 : 0
    if (lowStreak.current >= LOW_FPS_WINDOWS) {
      lowStreak.current = 0
      onLowFps?.()
    }
  })

  return null
}
