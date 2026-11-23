import type { Metadata } from 'next'

// The page is a client component, so its <title> lives here. The title is generic on purpose:
// a provider's name is shown to signed-in accounts only, so it cannot be in the server-rendered
// head; and the page has nothing for a crawler to index.
export const metadata: Metadata = {
  title: '服务商主页 · Stayloop',
  description: '服务商的服务范围、已核资质与站内联系：登录后查看；只展示与转介，不抽成。',
  robots: { index: false, follow: false },
}

export default function ProviderProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
