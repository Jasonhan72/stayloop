'use client'

// Signed-in landlords skip the marketing landing entirely: every legacy
// bookmark, nav link and report back-link points at /screening, and for an
// existing landlord those must keep meaning "my screening workspace", exactly
// as before the landing page existed. Visitors without a session see the
// landing — and so does a signed-in tenant (节点 3 verification 2026-09-26:
// forwarding every session sent tenant-test to /screening/app, whose landlord
// gate bounced them to /landlord/become; the landing's hat-aware CTA is the
// tenant's door). Agents with a live RECO registration use /screening/app
// for client screenings, so they are forwarded too.
//
// Renders nothing — it only forwards. replace() rather than push() so the
// landing page doesn't pollute the back button.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { isRegistrationLive } from '@/lib/agentProfile'

export default function AutoEnter() {
  const router = useRouter()
  const auth = useAuth()
  const hats = useHats()
  useEffect(() => {
    if (auth.loading || !auth.user || hats.loading) return
    if (hats.landlord || isRegistrationLive(hats.agent)) router.replace('/screening/app')
  }, [auth.loading, auth.user, hats.loading, hats.landlord, hats.agent, router])
  return null
}
