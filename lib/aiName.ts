'use client'

// One AI assistant per account (2026-09-25 — until then one name per hat).
// Naming rules:
//   · Signed-in users see the name THEY set (assistant_profiles.name, written
//     at onboarding or from the assistant panel; localStorage is only a fast
//     cache for the first paint).
//   · Signed-out / not-yet-named → the generic "AI Agent". The demo personas'
//     names (Luna / Logic / Brief) never appear as the live assistant's name.
//   · The cache belongs to ONE account (`sl-ai-name-owner`). A name chosen
//     before signing in is "unclaimed" and is adopted by the account that signs
//     in next; a name another account left on this browser is never shown to,
//     or written into, the account that is signed in now. (Prod 2026-09-25: a
//     magic-link sign-in on a browser that still held the previous account's
//     cache pushed that name into the new account's profile — sign-out clears
//     the cache, but a session can be replaced without one.)
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { readAssistantProfile } from './agent/assistantProfile'

export const GENERIC_AI_NAME = 'AI Agent'
const KEY = 'sl-ai-name'
const OWNER_KEY = 'sl-ai-name-owner'
// Pre-2026-09-25 per-hat keys, cleared on sign-out so nothing stale lingers.
const LEGACY_KEYS = ['sl-tenant-ai-name', 'sl-landlord-ai-name', 'sl-agent-ai-name']

function rawCache(): { name: string | null; owner: string | null } {
  if (typeof window === 'undefined') return { name: null, owner: null }
  try {
    return { name: localStorage.getItem(KEY) || null, owner: localStorage.getItem(OWNER_KEY) || null }
  } catch {
    return { name: null, owner: null }
  }
}

/**
 * The cached name usable for `uid`: the account's own, or one chosen before
 * signing in (unclaimed). Another account's cache is never returned. Pass
 * null (or nothing) when signed out — only an unclaimed name counts then.
 */
export function getStoredAIName(uid?: string | null): string | null {
  const { name, owner } = rawCache()
  if (!name) return null
  if (owner && owner !== (uid ?? null)) return null
  return name
}

export function getAIName(uid?: string | null): string {
  return getStoredAIName(uid) || GENERIC_AI_NAME
}

/** Cache a name. `owner` = the signed-in account it belongs to; null = chosen before signing in (unclaimed). */
export function setAIName(name: string, owner: string | null) {
  if (typeof window === 'undefined') return
  const trimmed = name.trim()
  if (!trimmed) return
  try {
    localStorage.setItem(KEY, trimmed)
    if (owner) localStorage.setItem(OWNER_KEY, owner)
    else localStorage.removeItem(OWNER_KEY)
  } catch {}
}

/** Remove a cache that belongs to a different account than `uid` (nothing happens for own or unclaimed caches). */
export function dropForeignAIName(uid: string) {
  const { name, owner } = rawCache()
  if (name && owner && owner !== uid) clearCachedAiNames()
}

export function getDefaultName(): string {
  return GENERIC_AI_NAME
}

// One in-flight DB resolve shared across every hook instance on the page —
// without this, each component that shows the name (chat header, watch bars,
// memory aside, audit log…) fired its own identical SELECT per navigation.
let nameResolve: Promise<{ uid: string | null; name: string | null }> | null = null

/** Clear the cached assistant name (localStorage + in-flight resolve).
 *  Called on sign-out and whenever another account's cache is found. */
export function clearCachedAiNames() {
  nameResolve = null
  if (typeof window === 'undefined') return
  for (const k of [KEY, OWNER_KEY, ...LEGACY_KEYS]) {
    try { window.localStorage.removeItem(k) } catch { /* ignore */ }
  }
}

/** The signed-in account and its saved assistant name (null when signed out or unnamed); shared per page load. */
export function resolveAccountName(): Promise<{ uid: string | null; name: string | null }> {
  if (nameResolve) return nameResolve
  const p = supabase.auth.getSession().then(async ({ data: { session } }) => {
    const uid = session?.user?.id ?? null
    if (!uid) return { uid, name: null }
    const profile = await readAssistantProfile(supabase)
    return { uid, name: profile?.name ?? null }
  }).catch(() => ({ uid: null as string | null, name: null as string | null }))
  nameResolve = p
  return p
}

/** Forget the resolved name so the next hook mount re-reads the profile (after a rename). */
export function invalidateAiName() {
  nameResolve = null
}

/**
 * The display name of the user's assistant. Resolves in three steps: the
 * cache that belongs to the signed-in account (or an unclaimed one) →
 * assistant_profiles.name for the signed-in user (then re-caches) → generic
 * "AI Agent".
 */
export function useAIName(): string {
  const [name, setName] = useState<string>(GENERIC_AI_NAME)

  useEffect(() => {
    let cancelled = false
    let uid: string | null = null
    // Who is signed in decides which cache may show — getSession() is local, no round trip.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      uid = session?.user?.id ?? null
      if (uid) dropForeignAIName(uid)
      setName(getAIName(uid))
    }).catch(() => { if (!cancelled) setName(getAIName(null)) })

    // Authoritative source: the account's profile in the DB (cross-device),
    // fetched once per session and shared by all hook instances.
    resolveAccountName().then(({ uid: u, name: dbName }) => {
      if (cancelled || !u || !dbName) return
      uid = u
      setName(dbName)
      setAIName(dbName, u)
    })

    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === OWNER_KEY || e.key === null) setName(getAIName(uid))
    }
    window.addEventListener('storage', onStorage)
    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return name
}
