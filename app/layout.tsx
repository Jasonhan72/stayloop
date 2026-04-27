import type { Metadata } from 'next'
import { Inter_Tight, JetBrains_Mono, Noto_Sans_SC } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n'
import HashRedirect from '@/components/HashRedirect'

// V3 typography stack (matches Stayloop V3 Prototype tokens.css).
// Inter Tight is the body/display sans. Noto Sans SC is the Chinese face.
const inter = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
})
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })
const noto = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cn',
})

export const metadata: Metadata = {
  title: {
    default: 'Stayloop — AI Tenant Screening for Ontario',
    template: '%s | Stayloop',
  },
  description: 'Screen tenants smarter with AI-powered analysis, CanLII court record checks, and instant risk scoring. Built for Ontario landlords. PIPEDA compliant.',
  keywords: ['tenant screening', 'Ontario', 'landlord', 'AI screening', 'LTB records', 'CanLII', 'rental risk', 'credit check', 'PIPEDA'],
  authors: [{ name: 'Stayloop' }],
  creator: 'Stayloop',
  metadataBase: new URL('https://www.stayloop.ai'),
  openGraph: {
    type: 'website',
    locale: 'en_CA',
    url: 'https://www.stayloop.ai',
    siteName: 'Stayloop',
    title: 'Stayloop — AI Tenant Screening for Ontario',
    description: 'Screen tenants in 60 seconds with AI-powered document analysis, CanLII court record checks, and instant risk scoring. Free for Ontario landlords.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Stayloop — AI Tenant Screening' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stayloop — AI Tenant Screening for Ontario',
    description: 'Screen tenants in 60 seconds with AI-powered analysis and court record checks. Free for Ontario landlords.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.stayloop.ai',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${noto.variable}`}>
      <body className={inter.className}>
        <HashRedirect />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
