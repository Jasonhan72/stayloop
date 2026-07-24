import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '争议解决 · Stayloop',
  description: '租房争议的三阶递进处理：AI 协助沟通、律师对接、LTB 程序指引。',
}

export default function DisputesLayout({ children }: { children: React.ReactNode }) {
  return children
}
