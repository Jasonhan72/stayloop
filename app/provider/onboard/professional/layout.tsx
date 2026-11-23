import type { Metadata } from 'next'

// The page is a client component, so its <title> lives here.
export const metadata: Metadata = {
  title: '专业服务入驻 · Stayloop',
  description: '持牌 Paralegal、律师、保险经纪、房源摄影入驻 Stayloop 专业服务目录：牌照人工核验，只展示与转介，不派单、不收佣金。',
}

export default function ProfessionalOnboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
