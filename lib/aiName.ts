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
// One in-flight DB resolve per role, shared across all hook instances mounted
// in the same page — without this, every component that shows the AI name
// (chat header, watch bars, memory aside, audit log…) fires its own identical
// agent_configs SELECT on each navigation.
const nameResolve = new Map<string, Promise<string | null>>()

/** Clear every per-role cached agent name (localStorage + in-flight resolve
 *  cache). Called on sign-out: without this, user B signing in on user A's
 *  browser inherited A's agent name — and reconcileAgentName then wrote it
 *  into B's own agent_configs row. */
export function clearCachedAiNames() {
  nameResolve.clear()
  allNames = null
  if (typeof window === 'undefined') return
  for (const role of ['tenant', 'landlord', 'agent']) {
    try { window.localStorage.removeItem(`sl-${role}-ai-name`) } catch { /* ignore */ }
  }
}

// One agent_configs SELECT for ALL roles per page load (the Header names
// three hats at once; three per-role queries were three round trips — perf
// review 2026-09-23). Per-role promises derive from it.
let allNames: Promise<Map<string, string>> | null = null

function resolveAllDbNames(): Promise<Map<string, string>> {
  if (allNames) return allNames
  const p = supabase.auth.getSession().then(async ({ data: { session } }) => {
    const m = new Map<string, string>()
    if (!session?.user) return m
    const { data } = await supabase
      .from('agent_configs')
      .select('role, agent_name')
      .eq('user_id', session.user.id)
    for (const r of (data ?? []) as { role: string; agent_name: string | null }[]) {
      const n = (r.agent_name || '').trim()
      if (n) m.set(r.role, n)
    }
    return m
  }).catch(() => new Map<string, string>())
  allNames = p
  return p
}

function resolveDbName(role: string): Promise<string | null> {
  const cached = nameResolve.get(role)
  if (cached) return cached
  const p = resolveAllDbNames().then((m) => m.get(role) ?? null)
  nameResolve.set(role, p)
  return p
}

export function useAIName(role: string = 'tenant'): string {
  const [name, setName] = useState<string>(GENERIC_AI_NAME)

  useEffect(() => {
    let cancelled = false
    setName(getAIName(role))

    // Authoritative source: the user's agent config in the DB (cross-device),
    // fetched once per role per session and shared by all hook instances.
    resolveDbName(role).then((dbName) => {
      if (cancelled || !dbName) return
      setName(dbName)
      setAIName(dbName, role)
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
