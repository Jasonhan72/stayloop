import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '隐私政策 · Stayloop',
  description: 'Stayloop 如何收集、使用与保护个人信息——遵循 PIPEDA,数据加密存储,申请人有权查阅与更正。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
