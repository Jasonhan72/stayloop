import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '房源 · Stayloop',
  description: '浏览多伦多真实认证房源，AI Agent 帮你问询、看房、递交申请。',
}

export default function ListingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
