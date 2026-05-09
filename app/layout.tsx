import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'Stayloop — 让租住回到应有的秩序 · Toronto AI rental agent',
  description:
    '每位用户都有自己的个人 AI Agent — Stayloop 把找房、申请、签约与后续服务整理成清晰的流程。Trusted rental infrastructure for Toronto.',
  metadataBase: new URL('https://www.stayloop.ai'),
  openGraph: {
    title: 'Stayloop',
    description: 'AI tenant screening + personal rental agent for Toronto.',
    url: 'https://www.stayloop.ai',
    siteName: 'Stayloop',
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stayloop',
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
