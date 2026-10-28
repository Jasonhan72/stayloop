import type { Metadata } from 'next'

// Site test 2026-10-28 (B-D1): the page is a client component, so its <title> lives here.
export const metadata: Metadata = {
  title: '专业服务目录 · Stayloop',
  description: 'Paralegal、律师、保险经纪、房源摄影：只展示与转介，不收佣金。',
}

export default function UprovidersUprofessionalLayout({ children }: { children: React.ReactNode }) {
  return children
}
