import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '定价 · Stayloop',
  description: '三个角色各自的定价与权益：租客、房东、经纪，一目了然。',
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
