import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '服务条款 · Stayloop',
  description: '使用 Stayloop 平台的条款与条件。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
