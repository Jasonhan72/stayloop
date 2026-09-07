import type { Metadata } from 'next'
import HomeNext from '@/components/home/HomeNext'

// Candidate homepage (AI-native: the assistant IS the hero). Hidden route for
// review — not linked, not indexed. Swap into app/page.tsx once approved.
export const metadata: Metadata = {
  title: 'Stayloop — 租房的 AI 操作系统 · 预览',
  robots: { index: false, follow: false },
}

export default function NextHomePage() {
  return <HomeNext />
}
