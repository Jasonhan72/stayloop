import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Join Stayloop for free. AI-powered tenant screening with CanLII court record checks, document forensics, and bilingual reports for Ontario landlords.',
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
