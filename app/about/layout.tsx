import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '关于我们 · Stayloop',
  description: 'Stayloop 是面向多伦多的 AI 租房操作系统:租客、房东、经纪各有一个 AI,真实数据、可审计的决策。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
