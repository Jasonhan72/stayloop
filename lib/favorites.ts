'use client'

// Local favorites (localStorage) — no DB involved. We store a full card
// snapshot (title/price/image/href/…) at save time so the "我的收藏" view can
// always render a card, even for external Realtor.ca results that aren't in
// the current /listings dataset.
import { useCallback, useEffect, useState } from 'react'

export type FavListing = {
  /** Stable identity — see favKey(). */
  key: string
  source: 'stayloop' | 'realtor'
  title: string
  address?: string
  neighborhood?: string
  city?: string
  price: number
  beds?: number | null
  baths?: number | null
  sqft?: number | null
  image?: string | null
  /** Internal path (/listings/slug) or external Realtor.ca URL. */
  href: string
  savedAt: number
}

const STORAGE_KEY = 'stayloop_favs'
// Fired after every local write so all mounted hearts stay in sync in the
// same tab; the native 'storage' event covers other tabs.
const LOCAL_EVENT = 'stayloop:favs'

/**
 * Stable identity for a listing across every surface that shows a heart.
 * Stayloop rows use their DB id; Realtor.ca externals (no stable id) key on
 * their URL, falling back to address. The same inputs are available on both
 * the /listings browse cards and the agent-chat listing cards, so a listing
 * favorited in one place reads as favorited in the other.
 */
export function favKey(input: {
  source?: string | null
  id?: string | null
  url?: string | null
  address?: string | null
}): string {
  if (input.source === 'realtor') {
    const basis = (input.url || input.address || input.id || '').trim().toLowerCase()
    return `rc:${basis}`
  }
  const basis = input.id || (input.url || input.address || '').trim().toLowerCase()
  return `sl:${basis}`
}

function readFavs(): FavListing[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (f): f is FavListing => !!f && typeof f.key === 'string' && typeof f.href === 'string',
    )
  } catch {
    return []
  }
}

function writeFavs(list: FavListing[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage full / privacy mode — favorites just won't persist.
  }
  window.dispatchEvent(new Event(LOCAL_EVENT))
}

/**
 * Favorites hook: `favs` (snapshots, save order), `isFav(key)`,
 * `toggle(snapshot)`, `count`. Synced across components via a custom event
 * and across tabs via the 'storage' event. Initial state is empty and reads
 * happen in an effect, so SSR/hydration stays clean.
 */
export function useFavorites() {
  const [favs, setFavs] = useState<FavListing[]>([])

  useEffect(() => {
    const sync = () => setFavs(readFavs())
    sync()
    window.addEventListener(LOCAL_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(LOCAL_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const isFav = useCallback((key: string) => favs.some((f) => f.key === key), [favs])

  const toggle = useCallback((snap: Omit<FavListing, 'savedAt'>) => {
    const cur = readFavs()
    const next = cur.some((f) => f.key === snap.key)
      ? cur.filter((f) => f.key !== snap.key)
      : [...cur, { ...snap, savedAt: Date.now() }]
    writeFavs(next)
    setFavs(next)
  }, [])

  return { favs, isFav, toggle, count: favs.length }
}
