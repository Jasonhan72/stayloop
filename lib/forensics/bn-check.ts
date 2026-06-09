// -----------------------------------------------------------------------------
// CRA Business Number (BN) cross-verification
//
// Canadian employers print their BN on T4 slips, employment letters, and
// sometimes pay stubs. Format: 9 digits + 2-letter program + 4 digits
// (e.g. `123456789 RT0001`). The 9-digit portion uniquely identifies the
// legal entity registered with CRA.
//
// We check: does the employer name claimed in the letter match the legal
// name registered against that BN in the federal corp registry?
//   - Exact match → trustworthy evidence
//   - BN found but different company → CRITICAL fraud signal (typical forgery pattern)
//   - BN not found → low-severity signal (might be provincial, might be real)
//
// This is called from /api/deep-check/route.ts after the federal registry
// has been imported. lookup_corp_by_bn RPC is defined in the
// ca_corp_registry_v1 migration.
// -----------------------------------------------------------------------------

import type { ForensicFlag } from './types'
import { canonicalizeEmployerName } from './arm-length'

/**
 * Standard BN format: `123456789RT0001` or `123456789 RT0001` or
 * `123456789-RT-0001`. Also some docs abbreviate to the 9-digit core alone.
 * We accept any of these.
 */
const BN_RE = /\b(\d{9})[\s\-]?(?:([A-Z]{2})[\s\-]?(\d{4}))?\b/g

export interface ExtractedBN {
  /** The 9-digit CRA business number */
  core: string
  /** Program identifier (RT = GST/HST, RP = payroll, RC = corporate, etc.) */
  program: string | null
  /** Reference number (0001, 0002, ...) */
  reference: string | null
  /** Raw match as found in text */
  raw: string
}

/**
 * Extract candidate BNs from arbitrary document text. Tolerates variation in
 * spacing. Context-aware filtering: we drop 9-digit numbers that look like
 * SINs or phone numbers (no nearby "BN" / "Business Number" keyword).
 */
export function extractBNs(text: string): ExtractedBN[] {
  if (!text) return []
  const out: ExtractedBN[] = []
  const seen = new Set<string>()

  // Pass 1: digits with explicit RT/RP/RC program — very high confidence BN
  let m
  while ((m = BN_RE.exec(text))) {
    const [raw, core, program, reference] = m
    if (!program) continue  // Only keep hits with full BN format in pass 1
    if (seen.has(core)) continue
    seen.add(core)
    out.push({ core, program, reference: reference || null, raw })
  }

  // Pass 2: 9-digit numbers near "BN" / "Business Number" / "CRA" keywords
  const keywordRe = /\b(BN|business\s*number|CRA|registration(?:\s*number)?|tax\s*id|HST\s*number|GST\s*number)[^\n]{0,40}(\d{9})\b/gi
  let km
  while ((km = keywordRe.exec(text))) {
    const core = km[2]
    if (seen.has(core)) continue
    seen.add(core)
    out.push({ core, program: null, reference: null, raw: km[0] })
  }

  return out
}

export interface BNLookupResult {
  bn: string
  found: boolean
  registered_name: string | null
  registered_jurisdiction: string | null
  registered_status: string | null
  name_matches_claimed: boolean | null
}

/**
 * Cross-check extracted BN against the claimed employer name.
 * Uses the `lookup_corp_by_bn` RPC on the ca_corp_registry table.
 *
 * @param supabase    Supabase client with service_role access to the registry
 * @param bn          9-digit CRA BN (the `core` from extractBNs)
 * @param claimed     The employer name claimed on the employment letter
 */
export async function verifyBN(
  supabase: any,  // SupabaseClient from @supabase/supabase-js — imported by caller
  bn: string,
  claimed: string | null,
): Promise<BNLookupResult> {
  let registered_name: string | null = null
  let registered_jurisdiction: string | null = null
  let registered_status: string | null = null

  try {
    const { data, error } = await supabase.rpc('lookup_corp_by_bn', { bn })
    if (!error && Array.isArray(data) && data.length > 0) {
      // Prefer active corps; fall back to most-recent
      const active = data.find((r: any) => r.is_active === true) || data[0]
      registered_name = active.display_name || null
      registered_jurisdiction = active.jurisdiction || null
      registered_status = active.status || null
    }
  } catch {
    // Caller gets found=false
  }

  const name_matches_claimed = claimed && registered_name
    ? nameMatches(canonicalizeEmployerName(claimed), canonicalizeEmployerName(registered_name))
    : null

  return {
    bn,
    found: !!registered_name,
    registered_name,
    registered_jurisdiction,
    registered_status,
    name_matches_claimed,
  }
}

/**
 * Loose name match — considers a claim matched if the canonicalized names
 * share their longest significant token (>= 4 chars, not in stop-list).
 * Conservative on the "match" side: false negatives (failing to confirm) are
 * preferred over false positives (incorrectly clearing a forged letter).
 */
function nameMatches(claimed: string, registered: string): boolean {
  if (!claimed || !registered) return false
  if (claimed === registered) return true
  const STOP = new Set(['the', 'and', 'of', 'inc', 'ltd', 'corp', 'corporation',
    'company', 'co', 'canadian', 'canada', 'international', 'group',
    'services', 'limited', 'incorporated', 'holdings', 'holding', 'solutions'])
  const cw = claimed.split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w))
  const rw = new Set(registered.split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w)))
  if (cw.length === 0 || rw.size === 0) return false
  // At least one non-trivial word in common
  return cw.some(w => rw.has(w))
}

/**
 * Generate ForensicFlag objects from BN verification results. The caller
 * appends these to the deep-check flag list.
 */
export function bnCheckFlags(
  results: BNLookupResult[],
  claimedEmployer: string | null,
): ForensicFlag[] {
  const flags: ForensicFlag[] = []

  for (const r of results) {
    if (!r.found) {
      // BN not in federal registry. Can mean provincial-only, financial
      // institution (OSFI), or simply invalid. Not necessarily forgery.
      flags.push({
        code: 'bn_not_in_federal_registry',
        severity: 'low',
        evidence_en: `Business Number ${r.bn} not found in the Canadian federal corporate registry. Employer may be provincially registered or a regulated financial institution.`,
        evidence_zh: `商业编号 ${r.bn} 未在加拿大联邦公司注册数据库中找到。雇主可能是省级注册或受金融监管机构。`,
      })
      continue
    }

    if (r.name_matches_claimed === true) {
      // BN verified — positive signal. We don't raise a flag for this;
      // the UI surfaces the confirmation via the deep-check result directly.
      continue
    }

    if (r.name_matches_claimed === false && claimedEmployer) {
      // BN exists but points to a DIFFERENT company — typical forgery pattern
      // (fraudster copies a BN from a real company but claims to work at a
      // different one).
      flags.push({
        code: 'bn_employer_mismatch',
        severity: 'critical',
        evidence_en: `Business Number ${r.bn} on the employment documents is registered to "${r.registered_name}" (${r.registered_jurisdiction || 'CA'}), not the claimed employer "${claimedEmployer}". This is a strong indicator that the BN was copied from a real company to lend legitimacy to a fabricated employment letter.`,
        evidence_zh: `雇佣文件上的商业编号 ${r.bn} 在加拿大联邦公司注册中对应的是 "${r.registered_name}"（${r.registered_jurisdiction || 'CA'}），而非声称的雇主 "${claimedEmployer}"。这是**伪造雇佣信的典型特征** — 从真实公司复制了 BN 来冒充合法性。`,
      })
    }
  }

  return flags
}
