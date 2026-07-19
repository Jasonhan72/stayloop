import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'Stayloop — 租房的 AI 操作系统 · The AI-native rental OS for Toronto',
  description:
    '租房路上的难题，交给各自的 AI：找房、尽调、签约、续约，日常事务由 Agent 处理，关键决定由你确认。The AI-native rental OS for Toronto — dedicated agents for tenants, landlords and realtors; real listings and official TRREB data; you confirm every key decision.',
  metadataBase: new URL('https://www.stayloop.ai'),
  openGraph: {
    title: 'Stayloop — 租房的 AI 操作系统 · The AI-native rental OS',
    description:
      '找房、尽调、签约、续约，日常事务由 AI Agent 处理，关键决定由你确认。Dedicated AI agents for tenants, landlords and realtors in Toronto.',
    url: 'https://www.stayloop.ai',
    siteName: 'Stayloop',
    locale: 'zh_CN',
    alternateLocale: ['en_CA'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stayloop — 租房的 AI 操作系统 · The AI-native rental OS',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#FAF7EE" />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}
