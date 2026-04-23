// /api/deep-check — Arm's-length employment verification
//
// Runs company registry lookups (OpenCorporates) and cross-references
// employer officers/directors with the applicant name. Returns arm's-length
// risk assessment with flags.
//
// PRO users: included by default (can be auto-triggered after screening)
// Free users: manual trigger via "Deep Check" button (1 per screening)
//
// POST body: { screening_id: string }
// Reads employer info + applicant name from the screening record.

export const runtime = 'edge'

import { createClient } from '@supabase/supabase-js'
import { runDeepCheck } from '@/lib/forensics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { screening_id } = body

    if (!screening_id) {
      return Response.json({ error: 'screening_id is required' }, { status: 400 })
    }

    // Fetch screening record. NOTE: only select columns that actually exist
    // in the current screenings schema. Do not add `ai_result` — it was in
    // an early draft of this route but never existed in the DB, which caused
    // every deep-check call to fail with "column does not exist" → 404.
    const { data: screening, error: fetchErr } = await supabase
      .from('screenings')
      .select('id, tenant_name, ai_extracted_name, ai_dimension_notes, forensics_detail, tier, deep_check_result')
      .eq('id', screening_id)
      .maybeSingle()

    if (fetchErr) {
      console.error('[deep-check] Supabase fetch error:', fetchErr)
      return Response.json({
        error: `Screening lookup failed: ${fetchErr.message || fetchErr.code || 'unknown'}`,
      }, { status: 500 })
    }
    if (!screening) {
      return Response.json({ error: 'Screening not found' }, { status: 404 })
    }

    // Extract employer names from multiple sources
    const employerNames: string[] = []

    // 1. From forensics cross_doc entities
    const forensics = screening.forensics_detail as any
    if (forensics?.cross_doc?.entities?.employers) {
      for (const e of forensics.cross_doc.entities.employers) {
        if (e.value) employerNames.push(e.value)
      }
    }

    // 2. From ai_dimension_notes._v3 snapshot (paystub extraction, employment letter detection).
    //    v3 scoring stashes detected_employer_name / paystub extraction into this blob.
    const v3 = (screening.ai_dimension_notes as any)?._v3 || {}
    if (typeof v3.detected_employer_name === 'string' && v3.detected_employer_name.length > 0) {
      employerNames.push(v3.detected_employer_name)
    }
    if (Array.isArray(v3.detected_employers)) {
      for (const name of v3.detected_employers) {
        if (typeof name === 'string' && name.length > 0) employerNames.push(name)
      }
    }

    // 3. From per-file paystub extractions
    if (forensics?.per_file) {
      for (const pf of forensics.per_file) {
        if (pf.paystub_math?.extraction?.employer_name) {
          employerNames.push(pf.paystub_math.extraction.employer_name)
        }
      }
    }

    if (employerNames.length === 0) {
      return Response.json({
        error: 'No employer information found in screening data. Upload an employment letter or pay stub first.',
        error_zh: '筛查数据中未找到雇主信息。请先上传雇佣信或工资单。',
      }, { status: 400 })
    }

    // Get applicant name
    const applicantName = screening.ai_extracted_name || screening.tenant_name || ''
    if (!applicantName) {
      return Response.json({
        error: 'No applicant name found',
        error_zh: '未找到申请人姓名',
      }, { status: 400 })
    }

    // Run deep check
    const results = await runDeepCheck({
      employer_names: employerNames,
      applicant_name: applicantName,
    })

    // Determine overall arm's-length status
    const hasHighRisk = results.some(r => r.arm_length_risk === 'high')
    const hasMediumRisk = results.some(r => r.arm_length_risk === 'medium')
    const allFlags = results.flatMap(r => r.flags)
    const overallRisk = hasHighRisk ? 'high' : hasMediumRisk ? 'medium' : 'clean'

    // Build summary
    const deepCheckResult = {
      checks: results,
      overall_risk: overallRisk,
      total_flags: allFlags.length,
      checked_at: new Date().toISOString(),
    }

    // Persist to screening record
    // Also update forensics_detail.arm_length for prompt injection on re-score
    const updatedForensics = forensics ? { ...forensics, arm_length: results } : { arm_length: results }
    await supabase
      .from('screenings')
      .update({
        deep_check_result: deepCheckResult,
        forensics_detail: updatedForensics,
      })
      .eq('id', screening_id)

    return Response.json({
      success: true,
      ...deepCheckResult,
    })
  } catch (e: any) {
    console.error('[deep-check] Error:', e)
    return Response.json({
      error: `Deep check failed: ${e.message || 'unknown error'}`,
    }, { status: 500 })
  }
}
