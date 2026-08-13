import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '给经纪的 AI 助理 Brief · Stayloop',
  description: '客户管理、带看安排、替客户下单租客筛查、转介费结算——RECO 合规边界内的经纪 AI 工作台。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
