import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '登录 · Stayloop',
  description: '登录 Stayloop——邮箱魔法链接,免密码。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
