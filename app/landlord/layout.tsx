import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '给房东的 AI 管家 Logic · Stayloop',
  description: '租客筛查、租约起草、收租提醒、续约雷达——安省房东的日常管理交给 AI,关键决定由你确认。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
