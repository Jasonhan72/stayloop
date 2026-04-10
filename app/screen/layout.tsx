import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Screen Tenant',
  description: 'Upload tenant documents and get an AI-powered risk score in 60 seconds. Includes CanLII court record search across all Ontario databases.',
}

export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return children
}
