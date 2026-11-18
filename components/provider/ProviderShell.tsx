'use client'

// The frame of the provider's three pages (jobs · history · profile): the site header, the provider rail
// once the account has a provider record (an applicant who has not submitted yet sees the plain page),
// the page, the footer. Replaces the three private copies of `Shell` those pages carried (2026-11-17).
import type { ReactNode } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { ProviderRail } from './ProviderNav'

export default function ProviderShell({ children, narrow = false }: { children: ReactNode; /** 760px column (the onboarding form) instead of 860px. */ narrow?: boolean }) {
  const auth = useAuth()
  const hats = useHats()
  const hasRecord = !auth.loading && !!auth.user && !hats.loading && !!hats.provider
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header />
      <div className="flex flex-1 flex-col md:flex-row">
        {hasRecord && <ProviderRail />}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className={`mx-auto w-full ${narrow ? 'max-w-[760px]' : 'max-w-[860px]'} flex-1 px-5 py-8`}>{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  )
}
