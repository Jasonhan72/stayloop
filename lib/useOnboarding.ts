'use client'

// Onboarding-state helper. "Onboarded for role X" = the user is signed in AND
// has already named their agent for that role (localStorage `sl-<role>-ai-name`,
// written at the end of onboarding). Marketing CTAs and the onboarding pages
// use this so a logged-in, already-onboarded user is never dragged back
// through "name your agent" again.
import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { getStoredAIName } from './aiName'
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
    setNamed(!!getStoredAIName(role))
  }, [role, user])
  // `ready` gates any redirect until auth has resolved — avoids a flash of the
  // onboarding screen before we know the user is signed in.
  return { ready: !loading, onboarded: !!user && named, home: ROLE_HOME[role] }
}
