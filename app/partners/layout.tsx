import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '合作伙伴 · Stayloop',
  description: '与 Stayloop 合作:经纪团队、物业公司、租房服务生态的接入方式。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
