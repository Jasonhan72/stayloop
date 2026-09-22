import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'Stayloop — 租房的 AI 操作系统 · The AI-native rental OS for Toronto',
  description:
    '租房路上的难题，交给各自的 AI：找房、尽调、签约、续约，日常事务由 Agent 处理，关键决定由你确认。The AI-native rental OS for Toronto — dedicated agents for tenants, landlords and realtors; real listings and official TRREB data; you confirm every key decision.',
  metadataBase: new URL('https://www.stayloop.ai'),
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Stayloop — 租房的 AI 操作系统 · The AI-native rental OS',
    description:
      '找房、尽调、签约、续约，日常事务由 AI Agent 处理，关键决定由你确认。Dedicated AI agents for tenants, landlords and realtors in Toronto.',
    url: 'https://www.stayloop.ai',
    siteName: 'Stayloop',
    locale: 'zh_CN',
    alternateLocale: ['en_CA'],
    type: 'website',
    images: ['/home/hero-mist.jpg'],
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
    // suppressHydrationWarning: the inline script below sets lang/data-lang on
    // <html> before hydration (anti-FOUC for EN users), so the client attribute
    // may legitimately differ from the server-rendered lang="zh".
    <html lang="zh" suppressHydrationWarning>
      <head>
        {/* Sync language BEFORE first paint — same resolution logic as
            I18nProvider's lazy initial state (lib/i18n.tsx). Keep in sync. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var l=localStorage.getItem('stayloop_lang');if(l!=='en'&&l!=='zh'){l=((navigator.language||'').toLowerCase().indexOf('zh')===0)?'zh':'en'}var d=document.documentElement;d.lang=l==='zh'?'zh-CN':'en';d.dataset.lang=l}catch(e){}})()",
          }}
        />
        <meta name="theme-color" content="#F3F8FC" />
        {/* PWA (2026-09-22, Muse benchmark item F): installable, standalone on phones. */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Stayloop" />
        <meta name="mobile-web-app-capable" content="yes" />
        <noscript>
          <style>{`.v7-page .rv{opacity:1;transform:none}`}</style>
        </noscript>
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}
