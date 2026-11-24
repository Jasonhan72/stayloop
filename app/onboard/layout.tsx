import type { Metadata } from 'next'

// The page is a client component, so its <title> lives here.
export const metadata: Metadata = {
  title: '申请加入 · Stayloop',
  description: '经纪、物业管理服务、专业服务申请加入 Stayloop：把资料交给 AI 助理，申请表它来填，你核对后提交，工作人员人工核验。',
}

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
