import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Stayloop account to screen tenants, manage listings, and access AI-powered risk reports.',
  robots: { index: false },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
