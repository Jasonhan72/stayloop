import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '产品 · Stayloop 全流程与 Stayloop API',
  description: '租前 · 租中 · 租后一条流程，同一条对话与审批链；同一套事实与规则以 Stayloop API 开放给合作方。',
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children
}
