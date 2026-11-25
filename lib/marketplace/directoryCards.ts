// What a directory card says about a provider, as data (2026-11-24). The two provider tabs
// (app/providers/page.tsx, app/providers/professional/page.tsx) work these out inline; the AI
// conversation's directory card (components/agent/DirectoryChatCard) shows the same providers on the
// same card (components/directory/ProviderCard.tsx), so the wording both must agree on is here, and
// tests/directoryChat20261124 fails if a page and this file ever word a badge or a rating differently.
// Pure. Nothing is ranked: the order is the directory's own (lib/marketplace/directory.ts for the
// repair trades; licence category, then the order read, for the professional ones).
import { priceLine, providerDisplayName, type DirectoryCredential, type DirectoryProvider, type DirectoryRow } from './directory'
import { CREDENTIAL_LABEL, coverageFor, isProfessionalTrade, PROFESSIONAL_TRADES, TRADES, type CredentialKind, type Trade } from './trades'

export type ProviderCardData = {
  id: string; name: string; legalName: string
  badge: { ok: boolean; label: string }
  /** omitted where reviews do not apply (professional services are never dispatched) */
  rating?: string
  chips: { key: string; label: string; ok: boolean }[]
  cities: string[]
  detail: string | null
  email: string | null; phone: string | null
  photoKey: string | null
  languages: string[] | null
  professional: boolean
}

const tradeLabel = (k: string, zh: boolean) => { const d = TRADES.find((x) => x.key === k); return d ? (zh ? d.zh : d.en) : k }

/** A repair provider's card, as /providers shows it. */
export function repairCardData({ p, trades, avg, reviews: n }: DirectoryRow, zh: boolean): ProviderCardData {
  return {
    id: p.id, name: providerDisplayName(p), legalName: p.legal_name,
    badge: { ok: true, label: `${zh ? '资质已核' : 'Verified'}${p.verified_at ? ` · ${p.verified_at.slice(0, 10)}` : ''}` },
    rating: avg != null ? `★ ${avg} (${n})` : (zh ? '还没有评价' : 'No reviews yet'),
    chips: trades.map((c) => ({ key: c.t, label: tradeLabel(c.t, zh), ok: c.ok })),
    cities: p.service_cities ?? [],
    detail: priceLine(p, zh),
    email: p.contact_email ?? null, phone: p.contact_phone ?? null,
    photoKey: p.photo_key ?? null, languages: p.languages ?? null,
    professional: false,
  }
}

/** The professional providers to list: by licence category in the tab's order, each provider once. */
export function professionalList<P extends Pick<DirectoryProvider, 'id' | 'trades'>>(providers: readonly P[], trade: Trade | null): { p: P; t: Trade }[] {
  const out: { p: P; t: Trade }[] = []
  const seen = new Set<string>()
  for (const t of PROFESSIONAL_TRADES) {
    if (trade && t !== trade) continue
    for (const p of providers) {
      if (!(p.trades ?? []).includes(t) || seen.has(p.id)) continue
      seen.add(p.id); out.push({ p, t })
    }
  }
  return out
}

/** A professional provider's card under licence category `t`, as /providers/professional shows it. */
export function professionalCardData(p: DirectoryProvider, t: Trade, creds: readonly DirectoryCredential[], zh: boolean, today = new Date(), graceDays = 0): ProviderCardData {
  const def = TRADES.find((x) => x.key === t)!
  const pc = creds.filter((c) => c.provider_id === p.id)
  const cov = coverageFor(t, pc, today, graceDays)
  const licences = pc.filter((c) => c.verified_at && def.required.includes(c.kind as CredentialKind))
    .map((c) => `${zh ? CREDENTIAL_LABEL[c.kind as CredentialKind]?.zh : CREDENTIAL_LABEL[c.kind as CredentialKind]?.en}${c.expires_at ? ` · ${zh ? '到期' : 'expires'} ${c.expires_at}` : ''}`).join(' · ')
  return {
    id: p.id, name: providerDisplayName(p), legalName: p.legal_name,
    badge: { ok: cov.ok, label: cov.ok ? (zh ? '牌照已核' : 'Licence verified') : (zh ? '牌照待核或已过期' : 'Licence pending or expired') },
    chips: (p.trades ?? []).filter(isProfessionalTrade).map((k) => ({ key: k, label: tradeLabel(k, zh), ok: coverageFor(k, pc, today, graceDays).ok })),
    cities: p.service_cities ?? [],
    detail: licences || null,
    email: p.contact_email ?? null, phone: p.contact_phone ?? null,
    photoKey: p.photo_key ?? null, languages: p.languages ?? null,
    professional: true,
  }
}
