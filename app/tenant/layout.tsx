import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '租客的 AI 助理 · Stayloop',
  description: '找房、申请、签约、护照、报修——租客的每一步都有你的 AI 助理。真实房源、TRREB 官方行情、免费开始。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
