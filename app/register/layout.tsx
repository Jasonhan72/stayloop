import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '注册 · Stayloop',
  description: '创建 Stayloop 账号,免费开始:租客筛查、AI 管家、在管租约。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
