// /agents metadata (the directory page is a client component). /agents/<slug> sets its own.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '找经纪 · Stayloop',
  description: '在 RECO 注册、经 Stayloop 人工核验的租赁经纪：按语言、专长和区域查找，在站内直接发消息。',
}

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return children
}
