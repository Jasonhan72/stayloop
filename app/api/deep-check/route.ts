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
// (Server-side plan check is out of scope for Phase 1 — client gates only,
// same as before. Server gate is a Phase 2+ follow-up.)
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

import { createClient } from '@supabase/supabase-js'
import { runDeepCheck } from '@/lib/forensics'

function makeServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface DeepCheckPayload {
  employer_names: string[]
  applicant_name: string
  applicant_address?: string
  applicant_phone?: string
  applicant_email?: string
  signatory_name?: string
  signatory_phone?: string
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

  return {
    employer_names: employerNames,
    applicant_name: screening.ai_extracted_name || screening.tenant_name || '',
    applicant_address: firstOr(cross.addresses),
    applicant_phone: firstOr(cross.phones),
    applicant_email: firstOr(cross.emails),
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

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
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

    // Run deep check
    const results = await runDeepCheck({
      employer_names: employers,
      applicant_name: payload.applicant_name.trim(),
      applicant_address: payload.applicant_address,
      signatory_name: payload.signatory_name,
    })

    // Aggregate risk
    const hasHighRisk = results.some(r => r.arm_length_risk === 'high')
    const hasMediumRisk = results.some(r => r.arm_length_risk === 'medium')
    const allFlags = results.flatMap(r => r.flags)
    const overallRisk = hasHighRisk ? 'high' : hasMediumRisk ? 'medium' : 'clean'

    return Response.json({
      success: true,
      checks: results,
      overall_risk: overallRisk,
      total_flags: allFlags.length,
      checked_at: new Date().toISOString(),
      elapsed_ms: Date.now() - t0,
    })
  } catch (e: any) {
    console.error('[deep-check] Error:', e)
    return Response.json({
      error: `Deep check failed: ${e?.message || 'unknown error'}`,
      error_zh: `深度检查失败: ${e?.message || '未知错误'}`,
    }, { status: 500 })
  }
}
