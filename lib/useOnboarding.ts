'use client'

// Onboarding-state helper. "Onboarded" = the user is signed in AND has already
// named their assistant (one per account since 2026-09-25): the cache that
// belongs to this account (localStorage `sl-ai-name`, written at the end of
// onboarding) or, on a new device, assistant_profiles.name. Marketing CTAs and
// the onboarding pages use this so a logged-in, already-onboarded user is
// never dragged back through "name your assistant" again; `home` is per hat.
import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { getStoredAIName, resolveAccountName } from './aiName'
import type { AgentRole } from './agent/types'

export const ROLE_HOME: Record<AgentRole, string> = {
  tenant: '/tenant/agent',
  landlord: '/landlord/agent',
  agent: '/agent/agent',
}

export function useOnboarded(role: AgentRole): { ready: boolean; onboarded: boolean; home: string } {
  const { loading, user } = useAuth()
  const [named, setNamed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setNamed(!!getStoredAIName(user?.id ?? null))
    if (!user) return
    // Named on another device: the profile row says so even when this browser has no cache.
    resolveAccountName().then(({ uid, name }) => { if (!cancelled && uid === user.id && name) setNamed(true) })
    return () => { cancelled = true }
  }, [user])
  // `ready` gates any redirect until auth has resolved — avoids a flash of the
  // onboarding screen before we know the user is signed in.
  return { ready: !loading, onboarded: !!user && named, home: ROLE_HOME[role] }
}
