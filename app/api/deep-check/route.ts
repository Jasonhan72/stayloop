// /api/deep-check — Arm's-length employment verification (stateless v2)
//
// Runs company registry lookups (OpenCorporates) and cross-references
// employer officers/directors with the applicant name. Returns arm's-length
// risk assessment with flags.
//
// Phase 1 redesign (2026-04-23):
//   - STATELESS: no DB reads, no DB writes. Caller supplies the full payload.
//   - Caller (frontend) is responsible for persisting deep_check_result back
//     to screenings via its own RLS'd supabase client.
//   - Legacy compat: if `screening_id` is provided without `employer_names`,
//     we fall back to the old DB-fetch behavior so stale clients still work.
//
// PRO users: button calls this directly. Free users: redirected to Stripe.
// Server-side PRO gate is enforced — the client-side button disable is not
// trusted. Callers without a valid session or without pro/enterprise plan
// get 403.
//
// POST body (preferred, stateless):
//   {
//     employer_names: string[],            // required (≥1)
//     applicant_name: string,              // required
//     applicant_address?: string,
//     applicant_phone?: string,
//     applicant_email?: string,
//     signatory_name?: string,
//     signatory_phone?: string
//   }
//
// POST body (legacy fallback):
//   { screening_id: string }

export const runtime = 'edge'

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { runDeepCheck } from '@/lib/forensics'
import { canonicalizeEmployerName, searchOpenCorporates, RegistryAuthError } from '@/lib/forensics/arm-length'
import type { CompanyRegistryInfo } from '@/lib/forensics/arm-length'
import { extractBNs, verifyBN, bnCheckFlags } from '@/lib/forensics/bn-check'
import type { BNLookupResult } from '@/lib/forensics/bn-check'

function makeServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Phase 5 — Canadian registry lookup chain.
 *
 * 1. Primary: Supabase `ca_corp_registry` table (seeded from Corporations
 *    Canada open data — OGL-Canada, commercial use OK, ~1.5M federal corps).
 *    Queried via the `search_corp_registry` RPC using pg_trgm similarity.
 *
 * 2. Optional fallback: OpenCorporates — ONLY when OPENCORPORATES_API_TOKEN
 *    is set. Still goes through the old 7-day `employer_lookup_cache` to
 *    preserve quota. If no token, we skip this tier entirely — no errors
 *    thrown, just return null.
 *
 * 3. Null means "not found in any configured source". The caller in
 *    arm-length.ts decides how to phrase that (registry_not_configured vs
 *    not_found_in_federal_registry).
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface CorpRegistryRow {
  corp_number: string | null
  jurisdiction: string | null
  display_name: string | null
  status: string | null
  is_active: boolean | null
  entity_type: string | null
  incorporation_date: string | null
  dissolution_date: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
  business_number: string | null
  source: string | null
  similarity: number | null
}

function rowToCompanyInfo(r: CorpRegistryRow): CompanyRegistryInfo {
  const addr = [r.address_line1, r.address_line2, r.city, r.province, r.postal_code]
    .filter(Boolean)
    .join(', ')
  return {
    name: r.display_name || '',
    company_number: r.corp_number || null,
    jurisdiction: r.jurisdiction || null,
    incorporation_date: r.incorporation_date || null,
    status: r.status || (r.is_active ? 'Active' : (r.is_active === false ? 'Inactive' : null)),
    registered_address: addr || null,
    company_type: r.entity_type || null,
    // Federal open data does NOT include director names. We pass empty —
    // the applicant_is_officer check degrades gracefully.
    officers: [],
    registry_url: r.corp_number
      ? `https://ised-isde.canada.ca/cc/lgcy/cc/corporation/${r.corp_number}`
      : null,
    source: r.source || 'corporations_canada_federal',
  }
}

async function searchCanadianRegistry(
  supabase: SupabaseClient,
  name: string,
): Promise<CompanyRegistryInfo | null> {
  const canonical = canonicalizeEmployerName(name)
  if (!canonical || canonical.length < 2) return null

  try {
    // min_sim was 0.55 in the initial impl, which produced false positives
    // like "Canadian Tire Corporation" → "Canadian Admiral Corporation".
    // 0.7 combined with the RPC's significant-token-overlap requirement
    // gives precise matches for companies that are actually in the federal
    // CBCA dataset, and a clean null for everything else.
    const { data, error } = await supabase.rpc('search_corp_registry', {
      q: canonical,
      min_sim: 0.7,
    })
    if (error) {
      console.warn('[deep-check] ca_corp_registry RPC error:', error.message)
      return null
    }
    const rows = (data as CorpRegistryRow[] | null) || []
    if (rows.length === 0) return null
    // RPC already sorts by active-first, similarity-desc, incorporation-date-desc
    return rowToCompanyInfo(rows[0])
  } catch (e) {
    console.warn('[deep-check] ca_corp_registry call threw:', e)
    return null
  }
}

function makeCachedCompanyLookup(supabase: SupabaseClient) {
  return async (name: string): Promise<CompanyRegistryInfo | null> => {
    // Tier 1: local CA federal registry (seeded from Corporations Canada)
    const caHit = await searchCanadianRegistry(supabase, name)
    if (caHit) return caHit

    // Tier 2: optional OpenCorporates fallback via 7-day cache. Only active
    // when OPENCORPORATES_API_TOKEN is configured. searchOpenCorporates
    // itself returns null without network calls when the token is missing.
    const canonical = canonicalizeEmployerName(name)
    if (!canonical) return null

    // Read legacy cache
    try {
      const { data, error } = await supabase
        .from('employer_lookup_cache')
        .select('result, fetched_at')
        .eq('normalized_name', canonical)
        .maybeSingle()
      if (!error && data) {
        const age = Date.now() - new Date(data.fetched_at).getTime()
        if (age < CACHE_TTL_MS) {
          return (data.result as CompanyRegistryInfo | null) ?? null
        }
      }
    } catch (e) {
      console.warn('[deep-check] cache read failed:', e)
    }

    // RegistryAuthError propagates if token is set but rejected
    const result = await searchOpenCorporates(name)

    // Cache legitimate outcomes (only when we actually queried, which means
    // token was set). Fire-and-forget.
    if (process.env.OPENCORPORATES_API_TOKEN) {
      try {
        void supabase
          .from('employer_lookup_cache')
          .upsert({
            normalized_name: canonical,
            display_name: name.trim().slice(0, 200),
            result: result as any,
            fetched_at: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (error) console.warn('[deep-check] cache write failed:', error.message)
          })
      } catch (e) {
        console.warn('[deep-check] cache write threw:', e)
      }
    }

    return result
  }
}

interface DeepCheckPayload {
  employer_names: string[]
  applicant_name: string
  applicant_address?: string
  applicant_phone?: string
  applicant_email?: string
  signatory_name?: string
  signatory_phone?: string
  /** true if cross_doc flagged HR phone == applicant phone (self-verification) */
  hr_phone_collision?: boolean
  /**
   * Text content from employment letter / paystub / T4 where a Business
   * Number might appear. The route scans this for BN patterns and
   * cross-checks against the federal registry.
   */
  employer_doc_text?: string
  /** Explicitly-extracted BN(s), if the caller already parsed them out. */
  business_numbers?: string[]
}

function bad(message: string, message_zh?: string, status = 400) {
  return Response.json({ error: message, error_zh: message_zh }, { status })
}

/**
 * Legacy fallback: reconstruct a DeepCheckPayload from a persisted screening.
 * Only used when the client sent {screening_id} without structured fields.
 */
async function payloadFromScreening(screening_id: string): Promise<DeepCheckPayload | Response> {
  const supabase = makeServiceClient()
  const { data: screening, error } = await supabase
    .from('screenings')
    .select('id, tenant_name, ai_extracted_name, ai_dimension_notes, forensics_detail')
    .eq('id', screening_id)
    .maybeSingle()

  if (error) {
    console.error('[deep-check] legacy fallback fetch error:', error)
    return bad(
      `Screening lookup failed: ${error.message || error.code || 'unknown'}`,
      `查询 screening 失败: ${error.message || error.code || '未知错误'}`,
      500,
    )
  }
  if (!screening) return bad('Screening not found', '找不到 screening 记录', 404)

  const forensics = (screening.forensics_detail as any) || null
  const v3 = ((screening.ai_dimension_notes as any)?._v3) || {}
  const cross = forensics?.cross_doc?.entities || {}

  const employerNames: string[] = []
  if (Array.isArray(cross.employers)) {
    for (const e of cross.employers) if (e?.value) employerNames.push(e.value)
  }
  if (typeof v3.detected_employer_name === 'string' && v3.detected_employer_name) {
    employerNames.push(v3.detected_employer_name)
  }
  if (forensics?.per_file) {
    for (const pf of forensics.per_file) {
      const name = pf?.paystub_math?.extraction?.employer_name
      if (name) employerNames.push(name)
    }
  }

  const firstOr = (arr: any): string | undefined => {
    if (!Array.isArray(arr) || !arr.length) return undefined
    const v = arr[0]?.value
    return typeof v === 'string' ? v : undefined
  }

  // Aggregate text from employment-related docs for BN scanning
  const employerDocText: string[] = []
  if (forensics?.per_file) {
    for (const pf of forensics.per_file) {
      const kind = pf?.file_kind
      if (kind !== 'employment_letter' && kind !== 'pay_stub' && kind !== 't4') continue
      const txt = pf?.ocr?.text || pf?.text_density?.text_sample
      if (typeof txt === 'string' && txt.length > 0) employerDocText.push(txt)
    }
  }

  return {
    employer_names: employerNames,
    applicant_name: screening.ai_extracted_name || screening.tenant_name || '',
    applicant_address: firstOr(cross.addresses),
    applicant_phone: firstOr(cross.phones),
    applicant_email: firstOr(cross.emails),
    hr_phone_collision: forensics?.cross_doc?.hr_phone_collision === true,
    employer_doc_text: employerDocText.join('\n\n---\n\n'),
  }
}

function dedupeStrings(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const s = raw.trim()
    if (s.length < 2) continue
    const key = s.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= 5) break  // cap fan-out — Phase 3 will add proper canonicalization
  }
  return out
}

/**
 * Server-side PRO plan enforcement. Reads the caller's Authorization token,
 * looks up their landlord record via RLS'd client, and rejects unless the
 * plan is 'pro' or 'enterprise'. The client-side button disable is not
 * trusted — anyone could hit this route directly with a valid session.
 *
 * Returns null when the caller is authorized; otherwise a Response to return.
 */
async function enforceProGate(req: Request): Promise<Response | null> {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) {
    return bad('Authentication required', '需要登录', 401)
  }

  // Use the anon key + forwarded auth header — RLS will only return the
  // caller's own landlord row.
  const rlsClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )

  // Verify the token actually resolves to a user (catches forged / expired tokens)
  const { data: userData, error: userErr } = await rlsClient.auth.getUser()
  if (userErr || !userData?.user) {
    return bad('Invalid or expired session', '会话已过期，请重新登录', 401)
  }

  // Look up THIS caller's landlord row. We filter by auth_id explicitly
  // (rather than relying on the RLS owner policy alone) because the
  // landlords table also has a permissive "Public can read landlords"
  // SELECT policy — without an explicit filter, .maybeSingle() would see
  // every landlord row and throw a multi-row error, which previously
  // surfaced to the user as "订阅验证失败" even for Pro subscribers.
  const { data: landlord, error: landlordErr } = await rlsClient
    .from('landlords')
    .select('plan')
    .eq('auth_id', userData.user.id)
    .maybeSingle()

  if (landlordErr) {
    console.error('[deep-check] landlord lookup error:', landlordErr)
    return bad('Failed to verify subscription', '订阅验证失败', 500)
  }

  const plan = (landlord?.plan as string | undefined) || 'free'
  if (plan !== 'pro' && plan !== 'enterprise') {
    return bad(
      'Deep check requires a Pro subscription',
      '深度检查为 Pro 功能，请先升级',
      403,
    )
  }

  return null  // authorized
}

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
    // Enforce PRO plan server-side before any expensive lookups
    const gate = await enforceProGate(req)
    if (gate) return gate

    const body = (await req.json().catch(() => ({}))) as Partial<DeepCheckPayload> & { screening_id?: string }

    // Resolve payload: prefer structured body; fall back to screening_id lookup.
    let payload: DeepCheckPayload
    if (Array.isArray(body.employer_names) && body.employer_names.length > 0 && body.applicant_name) {
      payload = {
        employer_names: body.employer_names,
        applicant_name: body.applicant_name,
        applicant_address: body.applicant_address,
        applicant_phone: body.applicant_phone,
        applicant_email: body.applicant_email,
        signatory_name: body.signatory_name,
        signatory_phone: body.signatory_phone,
        hr_phone_collision: body.hr_phone_collision,
        employer_doc_text: body.employer_doc_text,
        business_numbers: Array.isArray(body.business_numbers) ? body.business_numbers : undefined,
      }
    } else if (body.screening_id) {
      const resolved = await payloadFromScreening(body.screening_id)
      if (resolved instanceof Response) return resolved
      payload = resolved
    } else {
      return bad(
        'Missing payload. Provide either {employer_names, applicant_name} or {screening_id}.',
        '缺少参数。请提供 {employer_names, applicant_name} 或 {screening_id}。',
      )
    }

    // Validate
    const employers = dedupeStrings(payload.employer_names)
    if (employers.length === 0) {
      return bad(
        'No employer information provided. Upload an employment letter or pay stub first.',
        '未提供雇主信息。请先上传雇佣信或工资单。',
      )
    }
    if (!payload.applicant_name || !payload.applicant_name.trim()) {
      return bad('No applicant name provided', '未提供申请人姓名')
    }

    // Run deep check (with caching wrapper around company registry lookups)
    const cacheClient = makeServiceClient()
    const results = await runDeepCheck({
      employer_names: employers,
      applicant_name: payload.applicant_name.trim(),
      applicant_address: payload.applicant_address,
      applicant_phone: payload.applicant_phone,
      applicant_email: payload.applicant_email,
      signatory_name: payload.signatory_name,
      signatory_phone: payload.signatory_phone,
      hr_phone_collision: payload.hr_phone_collision,
      companyLookup: makeCachedCompanyLookup(cacheClient),
    })

    // BN cross-verification against the federal registry. Uses the same
    // service-role client used for caching; never needs external APIs.
    const bnFlags: any[] = []
    const bnResults: BNLookupResult[] = []
    try {
      // Determine which BNs to check: explicit list from caller, or scan text
      const scannedBNs = payload.business_numbers && payload.business_numbers.length
        ? payload.business_numbers.map(n => ({ core: n, program: null, reference: null, raw: n }))
        : extractBNs(payload.employer_doc_text || '')

      // Dedupe + cap to 3 BNs
      const seen = new Set<string>()
      const uniqueBNs = scannedBNs.filter(b => {
        if (seen.has(b.core)) return false
        seen.add(b.core); return true
      }).slice(0, 3)

      // Verify each against the canonical employer (first of employer_names)
      const claimedEmployer = employers[0] || null
      for (const bn of uniqueBNs) {
        const r = await verifyBN(cacheClient, bn.core, claimedEmployer)
        bnResults.push(r)
      }
      bnFlags.push(...bnCheckFlags(bnResults, claimedEmployer))
    } catch (e) {
      console.warn('[deep-check] BN check error:', e)
    }

    // Aggregate risk — BN mismatch is critical and bumps overall risk to high
    const hasBNMismatch = bnFlags.some(f => f.code === 'bn_employer_mismatch')
    const hasHighRisk = results.some(r => r.arm_length_risk === 'high') || hasBNMismatch
    const hasMediumRisk = results.some(r => r.arm_length_risk === 'medium')
    const allFlags = [...results.flatMap(r => r.flags), ...bnFlags]
    const overallRisk = hasHighRisk ? 'high' : hasMediumRisk ? 'medium' : 'clean'

    return Response.json({
      success: true,
      checks: results,
      bn_checks: bnResults,
      bn_flags: bnFlags,
      overall_risk: overallRisk,
      total_flags: allFlags.length,
      checked_at: new Date().toISOString(),
      elapsed_ms: Date.now() - t0,
    })
  } catch (e: any) {
    console.error('[deep-check] Error:', e)
    // Registry auth errors = operator has a TOKEN set but it's invalid.
    // No-token-at-all is handled upstream by searchOpenCorporates returning
    // null quietly (degraded mode). We only 503 when the token is broken.
    if (e instanceof RegistryAuthError || e?.name === 'RegistryAuthError') {
      return Response.json({
        error: `Company registry unavailable: ${e.message}`,
        error_zh: `公司注册查询 API token 被拒绝。请检查 Cloudflare 环境变量 OPENCORPORATES_API_TOKEN 是否正确。`,
        error_code: 'registry_auth_failed',
      }, { status: 503 })
    }
    return Response.json({
      error: `Deep check failed: ${e?.message || 'unknown error'}`,
      error_zh: `深度检查失败: ${e?.message || '未知错误'}`,
    }, { status: 500 })
  }
}
