import type { Metadata } from 'next'

// Site test 2026-10-28 (B-D1): the page is a client component, so its <title> lives here.
export const metadata: Metadata = {
  title: '维修与服务市场 · Stayloop',
  description: '多伦多及周边的维修与服务商：派单、报价、评价，付款线下。',
}

export default function UservicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
