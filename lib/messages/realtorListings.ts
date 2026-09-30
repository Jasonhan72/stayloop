'use client'
// Which of these listings are Realtor.ca imports (找得到人 2026-09-30). Those rows
// have no Stayloop landlord — listings.landlord_id is whoever imported them — so
// no in-app message button may point at them. One batched read per list, through
// listing_sources() so inactive listings (hidden by the public RLS) are known too.
// Until the answer arrives the set is `null` (unknown): callers hide the button.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useRealtorListings(ids: (string | null | undefined)[]): Set<string> | null {
  const key = Array.from(new Set(ids.filter((x): x is string => !!x))).sort().join(',')
  const [set, setSet] = useState<Set<string> | null>(key ? null : new Set())
  useEffect(() => {
    if (!key) { setSet(new Set()); return }
    let on = true
    setSet(null)
    supabase.rpc('listing_sources', { p_ids: key.split(',') }).then(({ data, error }) => {
      if (!on) return
      // On failure treat every listing as unknown-but-blocked rather than guessing it is safe.
      if (error) { setSet(new Set(key.split(','))); return }
      setSet(new Set(((data ?? []) as { id: string; source: string | null }[]).filter((l) => l.source === 'realtor').map((l) => l.id)))
    })
    return () => { on = false }
  }, [key])
  return set
}
