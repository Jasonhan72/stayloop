import type { Metadata } from 'next'

// The page is a client component, so its <title> lives here. /providers/professional sets its own.
export const metadata: Metadata = {
  title: '维修服务商 · Stayloop',
  description: '水管、电气、供暖等上门维修的服务商：资质人工核验，登录后查看与联系；只展示与转介，不抽成。',
}

export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return children
}
