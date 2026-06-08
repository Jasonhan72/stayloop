import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'Stayloop — 为 AI 时代而生的租房方式 · Toronto AI rental agent',
  description:
    '在 AI 时代,你只要说出想要的生活,你的专属 AI 助手就替你找房、尽调、申请、签约。每个关键决定,依然由你拍板。多伦多的可信任租住基础设施。',
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
