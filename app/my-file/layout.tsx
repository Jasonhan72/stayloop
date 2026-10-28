import type { Metadata } from 'next'

// Site test 2026-10-28 (B-D1): the page is a client component, so its <title> lives here.
export const metadata: Metadata = {
  title: '我的筛查档案 · Stayloop',
  description: '申请人索取自己的筛查档案、提出争议或设置身份警示。',
}

export default function UmyUfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
