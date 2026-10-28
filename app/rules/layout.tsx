import type { Metadata } from 'next'

// Site test 2026-10-28 (B-D1): the page is a client component, so its <title> lives here.
export const metadata: Metadata = {
  title: '安省租房规则与更新记录 · Stayloop',
  description: 'Stayloop 依据的安省租赁规则清单：每条带条文、官方链接、生效日期与更新记录。',
}

export default function UrulesLayout({ children }: { children: React.ReactNode }) {
  return children
}
