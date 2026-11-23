import type { Metadata } from 'next'

// The page is a client component, so its <title> lives here. /provider/onboard/professional sets its own.
export const metadata: Metadata = {
  title: '物业管理服务入驻 · Stayloop',
  description: '水管、电气、供暖、门锁、清洁等服务商入驻 Stayloop：资质人工核验，核验后可以接到房东的派单；不收入驻费，不抽成。',
}

export default function ProviderOnboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
