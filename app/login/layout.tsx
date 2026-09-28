import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '登录 · Stayloop',
  description: '登录 Stayloop——Google 或邮箱 + 密码。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
