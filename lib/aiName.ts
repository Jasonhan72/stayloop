'use client'

// One AI assistant per account (2026-09-25 — until then one name per hat).
// Naming rules:
//   · Signed-in users see the name THEY set (assistant_profiles.name, written
//     at onboarding or from the assistant panel; localStorage is only a fast
//     cache for the first paint).
//   · Signed-out / not-yet-named → the generic "AI Agent". The demo personas'
//     names (Luna / Logic / Brief) never appear as the live assistant's name.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { readAssistantProfile } from './agent/assistantProfile'

export const GENERIC_AI_NAME = 'AI Agent'
const KEY = 'sl-ai-name'
// Pre-2026-09-25 per-hat keys, cleared on sign-out so nothing stale lingers.
const LEGACY_KEYS = ['sl-tenant-ai-name', 'sl-landlord-ai-name', 'sl-agent-ai-name']

export function getAIName(): string {
  if (typeof window === 'undefined') return GENERIC_AI_NAME
  try {
    return localStorage.getItem(KEY) || GENERIC_AI_NAME
  } catch {
    return GENERIC_AI_NAME
  }
}

export function getStoredAIName(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setAIName(name: string) {
  if (typeof window === 'undefined') return
  const trimmed = name.trim()
  if (!trimmed) return
  try {
    localStorage.setItem(KEY, trimmed)
  } catch {}
}

export function getDefaultName(): string {
  return GENERIC_AI_NAME
}

// One in-flight DB resolve shared across every hook instance on the page —
// without this, each component that shows the name (chat header, watch bars,
// memory aside, audit log…) fired its own identical SELECT per navigation.
let nameResolve: Promise<string | null> | null = null

/** Clear the cached assistant name (localStorage + in-flight resolve).
 *  Called on sign-out: without this, user B signing in on user A's browser
 *  inherited A's assistant name — and the reconcile step then wrote it into
 *  B's own profile. */
export function clearCachedAiNames() {
  nameResolve = null
  if (typeof window === 'undefined') return
  for (const k of [KEY, ...LEGACY_KEYS]) {
    try { window.localStorage.removeItem(k) } catch { /* ignore */ }
  }
}

function resolveDbName(): Promise<string | null> {
  if (nameResolve) return nameResolve
  const p = supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session?.user) return null
    const profile = await readAssistantProfile(supabase)
    return profile?.name ?? null
  }).catch(() => null)
  nameResolve = p
  return p
}

/** Forget the resolved name so the next hook mount re-reads the profile (after a rename). */
export function invalidateAiName() {
  nameResolve = null
}

/**
 * The display name of the user's assistant. Resolves in three steps: cached
 * localStorage value → assistant_profiles.name for the signed-in user (then
 * re-caches) → generic "AI Agent".
 */
export function useAIName(): string {
  const [name, setName] = useState<string>(GENERIC_AI_NAME)

  useEffect(() => {
    let cancelled = false
    setName(getAIName())

    // Authoritative source: the account's profile in the DB (cross-device),
    // fetched once per session and shared by all hook instances.
    resolveDbName().then((dbName) => {
      if (cancelled || !dbName) return
      setName(dbName)
      setAIName(dbName)
    })

    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setName(e.newValue || GENERIC_AI_NAME)
    }
    window.addEventListener('storage', onStorage)
    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return name
}
