import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Stayloop API · Stayloop',
  description: '安省租房核验 API：房源合规检查、申请人出示的核验结论、发起筛查——三个端点，每个都有真实后端。',
}

export default function TrustApiLayout({ children }: { children: React.ReactNode }) {
  return children
}
