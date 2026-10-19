// POST /api/v1/listings/compliance — listing-terms compliance, deterministic
// (Trust API plan §3.3; tier 1 since stage 5 · 2026-10-16). Free and anonymous:
// no PII goes in, only listing terms; findings cite rule ids and link to their
// source. `province` picks lib/ontario/rules.ts (default ON) or the verified
// facts of one of the other 12 provinces / territories (lib/provinces/rules.ts).
// Backward compatible with the pre-stage-5 shape: `passed`, `findings[].rule`,
// `.url`, `checked`, `boundary` are all still there; `rule_id` / `source_url` /
// `as_of` / `province` were added. Rate limits live in lib/api/v1Limits.ts.
import { createClient } from '@supabase/supabase-js'
import { handleV1, methodNotAllowed, optionsResponse, readJsonObject } from '@/lib/api/v1Http'
import { coreListingCompliance } from '@/lib/api/v1Core'


export async function OPTIONS() { return optionsResponse() }
export const GET = methodNotAllowed

export async function POST(req: Request) {
  return handleV1(req, 'listings_compliance', async () => {
    const body = await readJsonObject(req)
    const out = coreListingCompliance(body)
    // Aggregate-only telemetry for the ROI metric; no listing text is stored.
    if (out.findings.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
        await admin.from('compliance_events').insert(out.findings.map((f) => ({ source: 'compliance_api', rule_id: f.rule, severity: f.severity, metadata: {} })))
      } catch { /* telemetry only */ }
    }
    return out
  })
}
