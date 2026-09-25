import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '经纪的 AI 助理 · Stayloop',
  description: '替房东客户筛查租客、给房源定价、准备带看、把握 TRESA 与人权法边界——RECO 注册核验后进入租客可选的经纪目录。Stayloop 不做经纪业务、不收费。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
