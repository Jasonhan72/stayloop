import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '联系我们 · Stayloop',
  description: '产品问题、合作洽谈、媒体联络——找到 Stayloop 团队的方式。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
