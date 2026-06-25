'use client'

import { useEffect, useState } from 'react'
import type { AgentRole } from './agent/types'

const ROLE_DEFAULTS: Record<string, string> = {
  tenant: 'Luna',
  landlord: 'Logic',
  agent: 'Brief',
}

function keyFor(role: string): string {
  return `sl-${role}-ai-name`
}

export function getAIName(role: string = 'tenant'): string {
  const def = ROLE_DEFAULTS[role] || 'Luna'
  if (typeof window === 'undefined') return def
  try {
    return localStorage.getItem(keyFor(role)) || def
  } catch {
    return def
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
  const def = ROLE_DEFAULTS[role] || 'Luna'
  if (typeof window === 'undefined') return
  const trimmed = name.trim() || def
  try {
    localStorage.setItem(keyFor(role), trimmed)
  } catch {}
}

export function getDefaultName(role: string = 'tenant'): string {
  return ROLE_DEFAULTS[role] || 'Luna'
}

export function useAIName(role: string = 'tenant'): string {
  const def = ROLE_DEFAULTS[role] || 'Luna'
  const [name, setName] = useState<string>(def)
  useEffect(() => {
    setName(getAIName(role))
    const key = keyFor(role)
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setName(e.newValue || def)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [role, def])
  return name
}
