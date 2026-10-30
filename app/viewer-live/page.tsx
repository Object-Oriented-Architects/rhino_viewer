'use client'

// 플러그인용 뷰어 — 샘플 반지 없이 Rhino 문서만 보여준다.
import ViewerScene from '@/components/viewer/ViewerScene'

export default function ViewerLivePage() {
  return <ViewerScene liveOnly />
}
