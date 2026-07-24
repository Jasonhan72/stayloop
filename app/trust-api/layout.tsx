import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Trust API · Stayloop',
  description: '面向合作方的租客信任验证接口：一次调用返回可审计的认证结果。',
}

export default function TrustApiLayout({ children }: { children: React.ReactNode }) {
  return children
}
