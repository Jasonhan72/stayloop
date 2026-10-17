// Who is asking for which file? (V0.8 consumer file access, G19.)
//
// The applicant proves nothing but control of the email they applied with
// (one-time link), then types the name (and optionally the date of birth) the
// file should carry. Matching is deliberately narrow:
//   • candidate screenings come ONLY from the three email chains below — never
//     from a name search over the screenings table (a name is not an identity);
//   • a candidate counts as matched only when the typed name covers the file's
//     name (first AND last token each hit one of the file's names; one typo in a
//     ≥5-letter token tolerated) and the date of birth, when both sides have one,
//     is identical;
//   • anything else is `needs_review`: a human looks before a single byte of the
//     file is shown.
import type { SupabaseClient } from '@supabase/supabase-js'

export type CandidateSource = 'application' | 'verification_request' | 'agent_intake'

export type CandidateScreening = {
  screening_id: string
  via: CandidateSource[]
  application_id: string | null
}

/** Escape `%` / `_` so an email can be used in an ILIKE equality (case-insensitive exact match). */
function ilikeExact(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

/** Screening ids reachable from `email` through the three application chains. Never by name. */
export async function findCandidateScreenings(admin: SupabaseClient, email: string): Promise<CandidateScreening[]> {
  const e = email.trim().toLowerCase()
  if (!e || !e.includes('@')) return []
  const out = new Map<string, CandidateScreening>()
  const add = (id: string | null | undefined, via: CandidateSource, appId: string | null = null) => {
    if (!id) return
    const cur = out.get(id)
    if (cur) { if (!cur.via.includes(via)) cur.via.push(via); if (appId && !cur.application_id) cur.application_id = appId; return }
    out.set(id, { screening_id: id, via: [via], application_id: appId })
  }

  const { data: apps } = await admin.from('applications').select('id').ilike('email', ilikeExact(e)).limit(200)
  const appIds = ((apps ?? []) as { id: string }[]).map((a) => a.id)
  if (appIds.length) {
    const { data: scr } = await admin.from('screenings').select('id, application_id').in('application_id', appIds).limit(500)
    for (const s of (scr ?? []) as { id: string; application_id: string | null }[]) add(s.id, 'application', s.application_id)
  }
  const { data: vrs } = await admin.from('verification_requests').select('screening_id').ilike('tenant_email', ilikeExact(e)).limit(200)
  for (const v of (vrs ?? []) as { screening_id: string | null }[]) add(v.screening_id, 'verification_request')
  const { data: subs } = await admin.from('agent_intake_submissions').select('screening_id').ilike('applicant_email', ilikeExact(e)).limit(200)
  for (const s of (subs ?? []) as { screening_id: string | null }[]) add(s.screening_id, 'agent_intake')
  return Array.from(out.values())
}

// ── name / dob comparison (pure) ──────────────────────────────────────────────

const CJK = /[㐀-鿿]/

/** NFKC → strip diacritics → lower; CJK runs stay whole, Latin splits on non-letters. */
export function nameTokens(name: string | null | undefined): string[] {
  const s = String(name ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const toks: string[] = []
  for (const part of s.split(/[^a-z㐀-鿿]+/)) {
    if (!part) continue
    // "陈美雅" is one token; "mia" is one token; a mixed run splits by script.
    const runs = part.match(/[㐀-鿿]+|[a-z]+/g) ?? []
    for (const r of runs) toks.push(r)
  }
  return toks
}

/** One edit (substitute / insert / delete) apart. */
export function editDistance1(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (la === lb) { i++; j++ } else if (la > lb) i++; else j++
  }
  return edits + (la - i) + (lb - j) <= 1
}

function tokenHit(t: string, cand: string[]): boolean {
  if (CJK.test(t)) return cand.some((c) => c === t || (c.length >= 2 && t.length >= 2 && (c.includes(t) || t.includes(c))))
  return cand.some((c) => c === t || (t.length >= 5 && c.length >= 5 && editDistance1(t, c)))
}

export type NameCandidates = {
  tenant_name?: string | null
  ai_extracted_name?: string | null
  first_name?: string | null
  last_name?: string | null
}

/** The typed name covers the file's name: first and last token each hit one of the file's names (same name). */
export function nameMatches(input: string | null | undefined, c: NameCandidates): boolean {
  const toks = nameTokens(input)
  if (!toks.length) return false
  const names = [c.tenant_name, c.ai_extracted_name, [c.first_name, c.last_name].filter(Boolean).join(' ')].map((n) => nameTokens(n)).filter((n) => n.length)
  if (!names.length) return false
  const first = toks[0], last = toks[toks.length - 1]
  if (toks.length === 1) {
    // A single CJK token is a whole name ("陈美雅"); a single Latin token is not enough.
    if (!CJK.test(first)) return false
    return names.some((n) => n.some((t) => t === first))
  }
  return names.some((n) => tokenHit(first, n) && tokenHit(last, n))
}

/** Both present → must be the same calendar day; either missing → not judged (true). */
export function dobMatches(input: string | null | undefined, onFile: string | null | undefined): boolean {
  const a = String(input ?? '').trim().slice(0, 10)
  const b = String(onFile ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return true
  return a === b
}

export type CandidateCheck = {
  screening_id: string
  name_ok: boolean
  /** null = no date of birth on file (not judged). */
  dob_ok: boolean | null
}

export type Classification = { status: 'matched' | 'needs_review'; matched: string[]; unmatched: string[] }

/** matched = at least one candidate whose name matched and whose DOB does not conflict; everything else is for a human. */
export function classify(checks: CandidateCheck[]): Classification {
  const matched = checks.filter((c) => c.name_ok && c.dob_ok !== false).map((c) => c.screening_id)
  const unmatched = checks.filter((c) => !matched.includes(c.screening_id)).map((c) => c.screening_id)
  return { status: matched.length ? 'matched' : 'needs_review', matched, unmatched }
}
