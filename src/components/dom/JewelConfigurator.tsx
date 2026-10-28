'use client'

import { useEffect, useState, type MutableRefObject } from 'react'
import { Cormorant_Garamond, Plus_Jakarta_Sans } from 'next/font/google'
import type { GemCut } from '@/components/canvas/gem/cutGeometry'
import type { StudioPreset } from '@/components/canvas/gem/studioEnv'
import { GEM_PRESETS, METAL_PRESETS, type GemPresetKey, type MetalPresetKey } from '@/components/canvas/gem/presets'
import {
  qualityTierLabel,
  qualityTierOptions,
  type QualityTier,
  type QualityTierSetting,
} from '@/components/canvas/QualityTier'
import styles from './JewelConfigurator.module.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
})

export type JewelView = 'ring' | GemCut

export interface JewelSettings {
  tierSetting: QualityTierSetting
  view: JewelView
  gemPreset: GemPresetKey
  metalPreset: MetalPresetKey
  envPreset: Extract<StudioPreset, 'studio_luxury' | 'warm_boutique' | 'cyber_neon'>
  ior: number
  /** DiamondMaterial aberrationStrength */
  dispersion: number
  bounces: number
  /** 보석 환경 회전 (도) */
  envRotation: number
  bloomStrength: number
  autoRotate: boolean
  comparePbr: boolean
}

const viewOptions: [JewelView, string][] = [
  ['ring', '솔리테어 링'],
  ['brilliant', '브릴리언트 컷'],
  ['emerald', '에메랄드 컷'],
]

const envOptions: [JewelSettings['envPreset'], string][] = [
  ['studio_luxury', '럭셔리 돔'],
  ['warm_boutique', '부티크 웜'],
  ['cyber_neon', '프리즘 네온'],
]

const gemSwatches: Record<GemPresetKey, string> = {
  diamond: 'radial-gradient(circle at 30% 30%, #ffffff, #cfd9e8)',
  fancy_blue: 'radial-gradient(circle at 30% 30%, #b5e2ff, #2d7ec9)',
  fancy_pink: 'radial-gradient(circle at 30% 30%, #ffc2dc, #d44683)',
  canary_yellow: 'radial-gradient(circle at 30% 30%, #fff099, #d99f16)',
  ruby: 'radial-gradient(circle at 30% 30%, #ff5c77, #8f0822)',
  emerald: 'radial-gradient(circle at 30% 30%, #5effa9, #097842)',
}

const metalSwatches: Record<MetalPresetKey, string> = {
  platinum: 'linear-gradient(135deg, #ffffff, #adb5bd)',
  yellow_gold: 'linear-gradient(135deg, #ffea9f, #c9972c)',
  rose_gold: 'linear-gradient(135deg, #ffd1c2, #c77b65)',
}

const cx = (...names: (string | false)[]) => names.filter(Boolean).join(' ')

const themeClass = cx(styles.theme, cormorant.variable, jakarta.variable)

function InfoCard({ comparePbr, tier }: { comparePbr: boolean; tier: QualityTier }) {
  if (comparePbr) {
    return (
      <div className={styles.comparisonCard}>
        <strong style={{ color: '#ff8a65' }}>비교 모드: 일반 Three.js MeshPhysicalMaterial (단일 표면 굴절)</strong>
        내부 다중 전반사(TIR) 계산이 없어 보석 아랫면(파빌리온)으로 빛이 그대로 투과해 빠져나가며, 다이아몬드 특유의
        내부 브릴리언스와 불꽃(Fire) 패턴이 사라집니다.
      </div>
    )
  }
  if (tier === 'mobile') {
    return (
      <div className={styles.comparisonCard}>
        <strong style={{ color: '#64d2ff' }}>모바일 최적화 모드: BVH 3-Channel RGB + 동적 해상도</strong>
        스택 깊이 제한(<code>BVH_STACK_DEPTH 24</code>), 메인석 3채널 RGB 전반사(4회), 보조석 1-Ray 크로마틱 오프셋을
        결합해 모바일 GPU에서도 발열 없이 60fps를 유지합니다.
      </div>
    )
  }
  return (
    <div className={styles.comparisonCard}>
      <strong>데스크톱 울트라 모드: BVH 6-Band Spectral Ray-Tracing</strong>
      57면 브릴리언트 컷 내부로 진입한 광선이 <code>three-mesh-bvh</code> 가속 트리를 따라 5~7회 전반사(TIR)하며 6채널
      스펙트럼 분산(Fire)을 실시간 계산합니다.
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className={styles.sliderRow}>
      <div className={styles.sliderHeader}>
        <span>{label}</span>
        <span className={styles.sliderVal}>{format(value)}</span>
      </div>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

interface JewelConfigPanelProps {
  settings: JewelSettings
  onChange: (patch: Partial<JewelSettings>) => void
  activeTier: QualityTier
  /** 0.5초마다 갱신되는 FPS */
  fpsRef: MutableRefObject<number>
  onResetCamera: () => void
}

/**
 * Jewel_test 설정 패널 (Gem & Ring Configurator) — 화면 오른쪽에 고정.
 * 원본은 빠른 동작 버튼(자동 회전·카메라 초기화·PBR 비교)이 전체 화면 캔버스 왼쪽 아래에 떠 있지만,
 * 그리드 안의 작은 뷰어 칸에선 두 줄로 접혀 모델을 가려 패널 맨 위로 옮겼다
 */
export function JewelConfigPanel({ settings, onChange, activeTier, fpsRef, onResetCamera }: JewelConfigPanelProps) {
  const [fps, setFps] = useState(60)
  useEffect(() => {
    const id = window.setInterval(() => setFps(fpsRef.current), 500)
    return () => window.clearInterval(id)
  }, [fpsRef])

  return (
    <aside className={cx(themeClass, styles.configuratorPanel)}>
      <div className={styles.panelHeader}>
        <h2>Gem &amp; Ring Configurator</h2>
        <div className={styles.badges}>
          <span className={cx(styles.fpsBadge, activeTier === 'mobile' ? styles.tierMobile : styles.tierDesktop)}>
            {qualityTierLabel[activeTier]}
          </span>
          <span className={styles.fpsBadge}>{fps} FPS</span>
        </div>
      </div>

      <div className={styles.panelBody}>
        <div className={styles.actionBar}>
          <button
            className={cx(styles.actionBtn, settings.autoRotate && styles.active)}
            onClick={() => onChange({ autoRotate: !settings.autoRotate })}
          >
            <span>↻</span> 자동 회전 (Auto-Rotate)
          </button>
          <button className={styles.actionBtn} onClick={onResetCamera}>
            <span>⌖</span> 카메라 초기화
          </button>
          <button
            className={cx(styles.actionBtn, settings.comparePbr && styles.active)}
            onClick={() => onChange({ comparePbr: !settings.comparePbr })}
          >
            <span>⇄</span> 일반 PBR vs BVH 광선추적 비교
          </button>
        </div>

        <div className={styles.controlSection}>
          <div className={styles.sectionLabel}>
            <span>렌더링 품질 프로필 (Device Quality Tier)</span>
          </div>
          <div className={cx(styles.segmentedGroup, styles.cols3)}>
            {Object.entries(qualityTierOptions).map(([label, tier]) => (
              <button
                key={tier}
                className={cx(styles.segBtn, settings.tierSetting === tier && styles.active)}
                onClick={() => onChange({ tierSetting: tier })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlSection}>
          <div className={styles.sectionLabel}>
            <span>주얼리 마운트 &amp; 컷 (View &amp; Cut)</span>
          </div>
          <div className={cx(styles.segmentedGroup, styles.cols3)}>
            {viewOptions.map(([view, label]) => (
              <button
                key={view}
                className={cx(styles.segBtn, settings.view === view && styles.active)}
                onClick={() => onChange({ view })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlSection}>
          <div className={styles.sectionLabel}>
            <span>보석 재질 (Gemstone Preset)</span>
          </div>
          <div className={styles.swatchGrid}>
            {(Object.keys(GEM_PRESETS) as GemPresetKey[]).map((key) => (
              <button
                key={key}
                className={cx(styles.swatchBtn, settings.gemPreset === key && styles.active)}
                onClick={() =>
                  onChange({ gemPreset: key, ior: GEM_PRESETS[key].ior, dispersion: GEM_PRESETS[key].dispersion })
                }
              >
                <span className={styles.swatchDot} style={{ background: gemSwatches[key] }} />
                {GEM_PRESETS[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlSection}>
          <div className={styles.sectionLabel}>
            <span>링 귀금속 재질 (Band Metal)</span>
          </div>
          <div className={styles.swatchGrid}>
            {(Object.keys(METAL_PRESETS) as MetalPresetKey[]).map((key) => (
              <button
                key={key}
                className={cx(styles.swatchBtn, settings.metalPreset === key && styles.active)}
                onClick={() => onChange({ metalPreset: key })}
              >
                <span className={styles.swatchDot} style={{ background: metalSwatches[key] }} />
                {METAL_PRESETS[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlSection}>
          <div className={styles.sectionLabel}>
            <span>스튜디오 조명 환경 (HDRI Dome)</span>
          </div>
          <div className={cx(styles.segmentedGroup, styles.cols3)}>
            {envOptions.map(([envPreset, label]) => (
              <button
                key={envPreset}
                className={cx(styles.segBtn, settings.envPreset === envPreset && styles.active)}
                onClick={() => onChange({ envPreset })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlSection}>
          <div className={styles.sectionLabel}>
            <span>광학 레이트레이싱 파라미터 (Optical Physics)</span>
          </div>
          <Slider
            label='굴절률 (Index of Refraction, IOR)'
            value={settings.ior}
            min={1.45}
            max={2.65}
            step={0.005}
            format={(v) => v.toFixed(3)}
            onChange={(ior) => onChange({ ior })}
          />
          <Slider
            label='색분산 / 파이어 (Dispersion Fire)'
            value={settings.dispersion}
            min={0}
            max={0.06}
            step={0.001}
            format={(v) => v.toFixed(3)}
            onChange={(dispersion) => onChange({ dispersion })}
          />
          <Slider
            label='내부 전반사 횟수 (TIR Bounces)'
            value={settings.bounces}
            min={1}
            max={7}
            step={1}
            format={(v) => `${v} 회`}
            onChange={(bounces) => onChange({ bounces })}
          />
          <Slider
            label='스튜디오 라이트 회전 (Light Angle)'
            value={settings.envRotation}
            min={0}
            max={360}
            step={1}
            format={(v) => `${Math.round(v)}°`}
            onChange={(envRotation) => onChange({ envRotation })}
          />
          <Slider
            label='블룸 광채 강도 (Sparkle Bloom)'
            value={settings.bloomStrength}
            min={0}
            max={0.6}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(bloomStrength) => onChange({ bloomStrength })}
          />
        </div>

        <InfoCard comparePbr={settings.comparePbr} tier={activeTier} />
      </div>
    </aside>
  )
}
