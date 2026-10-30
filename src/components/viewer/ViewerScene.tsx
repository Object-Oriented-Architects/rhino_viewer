'use client'

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { EffectComposer, SMAA, Bloom, BrightnessContrast, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useCreateStore } from 'leva'
import * as THREE from 'three'
import { ringPlusplasticConfig as config } from '@/config'
import { TemporalSmooth } from '@/components/canvas/TemporalSmooth'
import { BackgroundComposite } from '@/components/canvas/BackgroundComposite'
import { LoadingSpinner } from '@/components/dom/LoadingSpinner'
import { GemEnvironment } from '@/components/canvas/gem/GemEnvironment'
import { tierDpr, tierMultisampling, type QualityTier } from '@/components/canvas/QualityTier'
import { Ring } from '@/components/canvas/Models'
import { LiveModel, LiveScene } from './LiveModel'
import { decodeExport, type CameraPayload, type Manifest, type ExportScene } from './sceneProtocol'

const TIER: QualityTier = 'desktop'
const toneMappingModes = {
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
  linear: ToneMappingMode.LINEAR,
} as const
type Mode = 'live' | 'export' | 'sample'
interface ViewerBridge {
  __SCENE_RVS?: string
  __rhinoPull?: () => boolean
  __rhinoSetCamera?: (payload: CameraPayload) => boolean
  __VIEWER_STATE?: () => unknown
  __RHINOVIEW_ERRORS?: string[]
}
const bridge = () => window as unknown as ViewerBridge
const toViewer = (p: [number, number, number]) => new THREE.Vector3(p[0], p[2], -p[1])
type Runtime = {
  mode: Mode
  version: number
  cameraRevision: number
  pendingCamera: CameraPayload | null
  applyCamera: ((payload: CameraPayload) => void) | null
  clearCamera: (() => void) | null
  sampleBox: THREE.Box3 | null
  live: LiveScene
}
function fitHalfHeight(view: CameraPayload, aspect: number) {
  return view.parallel
    ? Math.max(view.halfHeight, view.halfWidth / aspect)
    : Math.max(Math.tan(view.halfV), Math.tan(view.halfH) / aspect)
}
function LiveCamera({
  runtime,
  controlsRef,
}: {
  runtime: Runtime
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const last = useRef<CameraPayload | null>(null)
  const d0 = useRef(1)
  const interacted = useRef(false)
  const previousRadius = useRef(1.5)
  const radius = () =>
    runtime.mode === 'sample'
      ? (runtime.sampleBox?.getSize(new THREE.Vector3()).length() ?? 3) / 2
      : runtime.live.radius
  const clip = () => {
    if (runtime.mode === 'sample') return
    const r = radius(),
      dist = camera.position.length()
    const near = Math.max(1e-3, 0.5 * (dist - r)),
      far = dist + 2 * r
    if (camera.near !== near || camera.far !== far) {
      camera.near = near
      camera.far = far
      camera.updateProjectionMatrix()
    }
  }
  const apply = useCallback(
    (payload: CameraPayload) => {
      if (runtime.mode === 'sample') return
      const aspect = Math.max(camera.aspect, 1e-6)
      const h = fitHalfHeight(payload, aspect),
        target = toViewer(payload.target)
      last.current = payload
      interacted.current = false
      camera.position.copy(toViewer(payload.pos))
      camera.up.copy(toViewer(payload.up)).normalize()
      const r = runtime.live.radius
      if (payload.parallel) {
        d0.current = Math.max(h / Math.tan(THREE.MathUtils.degToRad(5)), target.length() + 2 * r)
        const dir = target.clone().sub(camera.position).normalize()
        camera.position.copy(target).addScaledVector(dir, -d0.current)
      }
      previousRadius.current = r
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(payload.parallel ? h / d0.current : h))
      camera.lookAt(target)
      const orbit = controlsRef.current
      if (orbit) {
        orbit.target.copy(target)
        orbit.update()
      }
      const dist = camera.position.length()
      camera.near = Math.max(1e-3, 0.5 * (dist - r))
      camera.far = dist + 2 * r
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
    },
    [camera, controlsRef, runtime],
  )

  useLayoutEffect(() => {
    runtime.applyCamera = apply
    runtime.clearCamera = () => {
      last.current = null
      runtime.pendingCamera = null
    }
    const w = bridge()
    w.__RHINOVIEW_ERRORS ??= []
    const setCamera = (payload: CameraPayload) => {
      if (runtime.mode === 'live') {
        runtime.cameraRevision++
        apply(payload)
      }
      return true
    }
    const read = () => {
      const box = runtime.mode === 'sample' ? runtime.sampleBox : runtime.live.box
      return {
        cam: camera.position.toArray(),
        target: controlsRef.current?.target.toArray() ?? null,
        fov: camera.fov,
        up: camera.up.toArray(),
        near: camera.near,
        far: camera.far,
        modelBox: box ? { min: box.min.toArray(), max: box.max.toArray() } : null,
        R: radius(),
        version: runtime.version,
        mode: runtime.mode,
        objectsLive: runtime.live.entries.size,
        errors: [...runtime.live.errors],
      }
    }
    w.__rhinoSetCamera = setCamera
    w.__VIEWER_STATE = read
    if (runtime.pendingCamera) {
      apply(runtime.pendingCamera)
      runtime.pendingCamera = null
    }
    return () => {
      runtime.applyCamera = runtime.clearCamera = null
      if (w.__rhinoSetCamera === setCamera) delete w.__rhinoSetCamera
      if (w.__VIEWER_STATE === read) delete w.__VIEWER_STATE
    }
  }, [apply, camera, controlsRef, runtime])
  useLayoutEffect(() => {
    camera.aspect = Math.max(size.width, 1) / Math.max(size.height, 1)
    const payload = last.current
    if (payload) {
      const h = fitHalfHeight(payload, camera.aspect)
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(payload.parallel ? h / d0.current : h))
      camera.updateProjectionMatrix()
    }
  }, [camera, size.width, size.height])
  useEffect(() => {
    const orbit = controlsRef.current
    const start = () => {
      interacted.current = true
    }
    orbit?.addEventListener('start', start)
    return () => orbit?.removeEventListener('start', start)
  }, [controlsRef])
  useFrame(() => {
    const r = radius()
    if (last.current?.parallel && !interacted.current && previousRadius.current !== r) apply(last.current)
    clip()
  })
  return null
}
class ModelBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    this.props.onError(error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
/** Only the sample path creates a hidden Leva store or uses the 3dm loader. */
function SampleModel({
  onLoadComplete,
  onBounds,
}: {
  onLoadComplete: () => void
  onBounds: (box: THREE.Box3) => void
}) {
  const levaStore = useCreateStore()
  return (
    <Ring
      modelPath={config.modelPath}
      shadowTexturePath={config.shadowTexturePath}
      shadowOpacity={config.shadowOpacity}
      showShadow
      metalDefaults={config.metal}
      prongDefaults={config.prong}
      diamondDefaults={config.diamond}
      transformDefaults={config.transform}
      gemMaterial='refraction'
      view='ring'
      qualityTier={TIER}
      levaStore={levaStore}
      onLoadComplete={onLoadComplete}
      onBounds={onBounds}
    />
  )
}

export default function ViewerScene({ liveOnly = false }: { liveOnly?: boolean }) {
  const [mode, setMode] = useState<Mode>(liveOnly ? 'live' : 'sample')
  const [loading, setLoading] = useState(!liveOnly)
  const [error, setError] = useState<string | null>(null)
  const [background, setBackground] = useState(config.view.backgroundColor || '#ffffff')
  const [live] = useState(() => new LiveScene())
  const runtime = useRef<Runtime>({
    mode: liveOnly ? 'live' : 'sample',
    version: 0,
    cameraRevision: 0,
    pendingCamera: null,
    applyCamera: null,
    clearCamera: null,
    sampleBox: null,
    live,
  }).current
  const exported = useRef<ExportScene | null>(null)
  const orbitRef = useRef<OrbitControlsImpl | null>(null)
  const onLoadComplete = useCallback(() => setLoading(false), [])
  const onBounds = useCallback(
    (box: THREE.Box3) => {
      runtime.sampleBox = box
    },
    [runtime],
  )
  const onError = useCallback((cause: Error) => {
    const message = cause.message || String(cause)
    setError(message)
    setLoading(false)
    bridge().__RHINOVIEW_ERRORS?.push(message)
  }, [])

  useEffect(() => {
    const w = bridge()
    w.__RHINOVIEW_ERRORS ??= []
    let active = true
    let repullTimer: ReturnType<typeof setTimeout> | undefined
    const controllers = new Set<AbortController>()
    const applyCamera = (camera: CameraPayload | null) => {
      if (camera) {
        if (runtime.applyCamera) runtime.applyCamera(camera)
        else runtime.pendingCamera = camera
      } else runtime.clearCamera?.()
    }
    if (liveOnly && (exported.current || w.__SCENE_RVS)) {
      try {
        if (!exported.current) {
          exported.current = decodeExport(w.__SCENE_RVS!)
          delete w.__SCENE_RVS
        }
        runtime.mode = 'export'
        setMode('export')
        const { manifest, blocks } = exported.current
        live.reconcile(manifest, blocks)
        runtime.version = manifest.version
        setBackground(manifest.background)
        applyCamera(manifest.camera)
      } catch (cause) {
        onError(cause as Error)
      }
    }
    const pullAsync = async () => {
      if (!active || !liveOnly || runtime.mode === 'export') return
      const revision = runtime.cameraRevision
      const controller = new AbortController()
      controllers.add(controller)
      try {
        const response = await fetch('/live/state.json', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) return
        const manifest = (await response.json()) as Manifest
        if (!active || manifest.version < runtime.version) return
        const newVersion = manifest.version > runtime.version
        live.reconcile(manifest)
        runtime.version = manifest.version
        setBackground(manifest.background)
        // A same-version retry is for missing objects, not another camera application.
        if (newVersion && revision === runtime.cameraRevision) applyCamera(manifest.camera)
      } catch {
        /* Transient state fetch failures do not tear down the visible scene. */
      } finally {
        controllers.delete(controller)
      }
    }
    const pull = () => {
      void pullAsync()
      return true
    }
    live.on404 = () => {
      if (!repullTimer)
        repullTimer = setTimeout(() => {
          repullTimer = undefined
          pull()
        }, 0)
    }
    live.onChange = () => {
      if (active) setLoading(false)
    }
    w.__rhinoPull = pull
    if (runtime.mode !== 'export') pull()
    return () => {
      active = false
      clearTimeout(repullTimer)
      controllers.forEach((c) => c.abort())
      live.on404 = live.onChange = () => {}
      if (w.__rhinoPull === pull) delete w.__rhinoPull
    }
  }, [liveOnly, live, onError, runtime])
  // Defer disposal one microtask so React StrictMode's effect rehearsal can remount safely.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) live.dispose()
      })
    }
  }, [live])
  const envRotation = useMemo(
    () =>
      new THREE.Euler(
        THREE.MathUtils.degToRad(config.light.envRotX || 0),
        THREE.MathUtils.degToRad(config.light.envRotY || 0),
        THREE.MathUtils.degToRad(config.light.envRotZ || 0),
      ),
    [],
  )
  return (
    <div className='fixed inset-0 bg-white'>
      {loading && <LoadingSpinner message='불러오는 중…' />}
      {error && (
        <div role='alert' className='absolute left-4 top-4 z-50 max-w-lg rounded bg-red-950 p-3 text-sm text-white'>
          모델을 불러오지 못했습니다: {error}
        </div>
      )}
      <Canvas
        gl={{ antialias: false, toneMappingExposure: config.view.exposure ?? 1 }}
        dpr={tierDpr(TIER, config.view.dpr ?? 2, false)}
        shadows
      >
        <PerspectiveCamera makeDefault fov={config.view.fov} position={config.cameraPosition} />
        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping={mode !== 'live'}
          enablePan={mode !== 'live'}
          minDistance={mode === 'sample' ? 6 : 0}
          maxDistance={mode === 'sample' ? 9 : Infinity}
          {...(mode === 'sample' ? { target: config.orbitTarget } : {})}
        />
        <LiveCamera runtime={runtime} controlsRef={orbitRef} />
        <GemEnvironment
          source={config.hdrPath}
          gemSource={config.light.gemStudioPreset}
          intensity={config.light.environmentIntensity}
          rotation={envRotation}
          resolution={512}
        >
          {mode === 'sample' ? (
            <ModelBoundary onError={onError}>
              <Suspense fallback={null}>
                <SampleModel onLoadComplete={onLoadComplete} onBounds={onBounds} />
              </Suspense>
            </ModelBoundary>
          ) : (
            <LiveModel scene={live} />
          )}
        </GemEnvironment>
        <EffectComposer multisampling={tierMultisampling(TIER)} enableNormalPass={false}>
          <SMAA />
          <Bloom
            intensity={config.bloom.enabled ? config.bloom.intensity : 0}
            luminanceThreshold={config.bloom.luminanceThreshold}
            luminanceSmoothing={config.bloom.luminanceSmoothing}
            levels={config.bloom.levels ?? 9}
            radius={config.bloom.radius}
            mipmapBlur
          />
          <ToneMapping mode={toneMappingModes[config.view.toneMapping ?? 'aces']} />
          <BrightnessContrast brightness={config.grade?.brightness ?? 0} contrast={config.grade?.contrast ?? 0} />
          <BackgroundComposite color={background} vignette={config.view.backgroundVignette ?? 0} />
          <TemporalSmooth smoothing={config.view.temporalSmoothing ?? 0} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
