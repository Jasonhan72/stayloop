// The directory's reads, as its three tabs make them (2026-11-24), for the AI conversation's
// directory card (components/agent/DirectoryChatCard):
//   agents        GET /api/agents?language=&area= — public fields only (app/agents/page.tsx)
//   repairs       provider_directory + provider_credentials_public + provider_review_stats (app/providers/page.tsx)
//   professional  provider_directory where trades overlap the professional ones + credentials (app/providers/professional/page.tsx)
// The provider views are readable by signed-in accounts only — an anonymous visitor reads no provider
// data, here as on the pages. Ratings come from the stats view, never from the review table (each
// account sees only its own reviews there). A failed read throws: "nobody" must mean nobody.
import { supabase } from '@/lib/supabase'
import type { BasicAgent, PublicAgent } from '@/lib/agentPublic'
import type { DirectoryCredential, DirectoryProvider, DirectoryReview } from './directory'
import { PROFESSIONAL_TRADES } from './trades'

export async function loadAgentDirectory(filter: { language?: string | null; area?: string | null }): Promise<{ items: PublicAgent[]; basic: BasicAgent[] }> {
  const qs = new URLSearchParams()
  if (filter.language) qs.set('language', filter.language)
  if (filter.area?.trim()) qs.set('area', filter.area.trim())
  const res = await fetch(`/api/agents?${qs.toString()}`, { cache: 'no-store' })
  const data = await res.json().catch(() => null) as { items?: PublicAgent[]; basic?: BasicAgent[] } | null
  if (!res.ok || !data) throw new Error(`agents ${res.status}`)
  return { items: data.items ?? [], basic: data.basic ?? [] }
}

export async function loadRepairDirectory(): Promise<{ providers: DirectoryProvider[]; creds: DirectoryCredential[]; reviews: DirectoryReview[] }> {
  const { data, error } = await supabase.from('provider_directory').select('id, legal_name, trade_name, trades, service_cities, pricing_mode, call_out_fee, hourly_rate, contact_email, contact_phone, verified_at, languages, photo_key').limit(200)
  if (error) throw new Error(error.message)
  const providers = (data ?? []) as DirectoryProvider[]
  const ids = providers.map((p) => p.id)
  if (!ids.length) return { providers, creds: [], reviews: [] }
  const [{ data: c, error: cErr }, { data: r, error: rErr }] = await Promise.all([
    supabase.from('provider_credentials_public').select('provider_id, kind, expires_at, verified_at').in('provider_id', ids),
    supabase.from('provider_review_stats').select('provider_id, overall, reviews').in('provider_id', ids),
  ])
  if (cErr) throw new Error(cErr.message)
  if (rErr) throw new Error(rErr.message)
  return { providers, creds: (c ?? []) as DirectoryCredential[], reviews: (r ?? []) as DirectoryReview[] }
}

export async function loadProfessionalDirectory(): Promise<{ providers: DirectoryProvider[]; creds: DirectoryCredential[] }> {
  const { data, error } = await supabase.from('provider_directory').select('id, legal_name, trade_name, trades, service_cities, contact_email, contact_phone, verified_at, languages, photo_key').overlaps('trades', [...PROFESSIONAL_TRADES]).limit(200)
  if (error) throw new Error(error.message)
  const providers = (data ?? []) as DirectoryProvider[]
  const ids = providers.map((p) => p.id)
  if (!ids.length) return { providers, creds: [] }
  const { data: c, error: cErr } = await supabase.from('provider_credentials_public').select('provider_id, kind, expires_at, verified_at').in('provider_id', ids)
  if (cErr) throw new Error(cErr.message)
  return { providers, creds: (c ?? []) as DirectoryCredential[] }
}
