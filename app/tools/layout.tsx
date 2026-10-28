import type { Metadata } from 'next'

// Site test 2026-10-28 (B-D1): the page is a client component, so its <title> lives here.
export const metadata: Metadata = {
  title: '租房小工具 · Stayloop',
  description: 'N1 / N4 / N12 日期算术、要价对照、「这个能问吗」——免登录、确定性的安省租房小工具。',
}

export default function UtoolsLayout({ children }: { children: React.ReactNode }) {
  return children
}
