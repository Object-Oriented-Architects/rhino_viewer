import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PlusPlastic Jewelry Viewer Sampler',
  description: 'PlusPlastic Jewelry Viewer Sampler',
}

export default function RingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
