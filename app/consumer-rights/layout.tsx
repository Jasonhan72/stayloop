import type { Metadata } from 'next'

// Site test 2026-10-28 (B-D1): the page is a client component, so its <title> lives here.
export const metadata: Metadata = {
  title: '消费者权利与筛查方法 · Stayloop',
  description: '申请人的档案权利、争议与身份警示，以及租客筛查的计分方法。',
}

export default function UconsumerUrightsLayout({ children }: { children: React.ReactNode }) {
  return children
}
