'use client'

// One AI identity per role. Naming rules:
//   · Signed-in users see the name THEY set (agent_configs.agent_name,
//     written at onboarding; localStorage is only a fast cache).
//   · Signed-out / not-yet-named → the generic "AI Agent". Mock persona
//     names (Luna/Logic/Brief) never appear as the live agent name.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const GENERIC_AI_NAME = 'AI Agent'

function keyFor(role: string): string {
  return `sl-${role}-ai-name`
}

export function getAIName(role: string = 'tenant'): string {
  if (typeof window === 'undefined') return GENERIC_AI_NAME
  try {
    return localStorage.getItem(keyFor(role)) || GENERIC_AI_NAME
  } catch {
    return GENERIC_AI_NAME
  }
}

export function getStoredAIName(role: string = 'tenant'): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(keyFor(role))
  } catch {
    return null
  }
}

export function setAIName(name: string, role: string = 'tenant') {
  if (typeof window === 'undefined') return
  const trimmed = name.trim()
  if (!trimmed) return
  try {
    localStorage.setItem(keyFor(role), trimmed)
  } catch {}
}

export function getDefaultName(_role: string = 'tenant'): string {
  return GENERIC_AI_NAME
}

/**
 * The display name of the user's AI for a role. Resolves in three steps:
 * cached localStorage value → agent_configs.agent_name for the signed-in
 * user (then re-caches) → generic "AI Agent".
 */
export function useAIName(role: string = 'tenant'): string {
  const [name, setName] = useState<string>(GENERIC_AI_NAME)

  useEffect(() => {
    let cancelled = false
    setName(getAIName(role))

    // Authoritative source: the user's agent config in the DB (cross-device).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return
      supabase
        .from('agent_configs')
        .select('agent_name')
        .eq('user_id', session.user.id)
        .eq('role', role)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return
          const dbName = (data?.agent_name || '').trim()
          if (dbName) {
            setName(dbName)
            setAIName(dbName, role)
          }
        })
    })

    const key = keyFor(role)
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setName(e.newValue || GENERIC_AI_NAME)
    }
    window.addEventListener('storage', onStorage)
    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
    }
  }, [role])

  return name
}
