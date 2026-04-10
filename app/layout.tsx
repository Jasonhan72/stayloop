import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

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
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className={inter.className}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
