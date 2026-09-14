'use client'

// Review 2026-09-14: this page was a static brochure describing licence
// upload, automatic RECO checks, Stripe Connect referral fees, dispatch and
// a fabricated income statistic — all of which contradict the 2026-09-13
// decisions (manual RECO check, no dispatch, no fees, engine frozen). The
// real agent flow is /agent/verify; pricing and old links land here, so the
// route stays as a redirect.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AgentOnboardingRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/agent/verify') }, [router])
  return null
}
