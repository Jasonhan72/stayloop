// Tool: compute_screening_score
// Apply the deterministic v3 scoring rules: 5 weighted dimensions, hard
// gates, red flags, forensics-derived overrides. The AI never decides the
// final score directly — it composes inputs and the tool computes.

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

interface ScoreInput {
  /** AI-extracted v3 dimension scores 0-100. */
  scores_v3: {
    ability_to_pay: number
    credit_health: number
    rental_history: number
    verification: number
    communication: number
  }
  /** AI-emitted hard gates (will be merged with deterministic ones). */
  hard_gates_triggered: string[]
  /** AI-emitted red flags. */
  red_flags: string[]
  /** Forensics report from run_pdf_forensics. */
  forensics_report?: any
  /** Court records summary. */
  court_records?: {
    canlii_party_hits: number
    portal_defendant_count: number
    portal_active_defendant_count: number
  }
  /** Income / rent for affordability checks. */
  monthly_income?: number
  monthly_rent?: number
}

interface ScoreOutput {
  overall: number
  base_score: number
  hard_gates: string[]
  gate_cap: number
  red_flags: string[]
  red_flag_penalty: number
  forensics_penalty: number
  scores_v3_adjusted: ScoreInput['scores_v3']
  notes: string[]
}

const HARD_GATE_CAPS: Record<string, number> = {
  income_severe: 65,
  affordability_severe: 55,
  ltb_eviction: 40,
  doc_tampering: 55,
  identity_mismatch: 50,
  employer_fraud: 45,
  self_issued_employment: 50,
  bn_employer_mismatch: 35,
  court_record_defendant: 35,
  court_record_defendant_multi: 25,
  court_record_active: 20,
  pdf_is_screenshot: 30,
  paystub_math_impossible: 35,
  cross_doc_collision: 40,
  producer_consumer_tool: 50,
}

const RED_FLAG_PENALTIES: Record<string, number> = {
  rush_move_in: 4,
  rent_ratio_high: 8,
  cross_doc_contradictions: 8,
  hr_phone_is_applicant: 10,
  no_linkedin_for_professional_role: 3,
  volunteered_sin: 2,
  self_issued_employment_letter: 15,
  id_format_invalid: 6,
}

const V3_WEIGHTS = {
  ability_to_pay: 0.40,
  credit_health: 0.25,
  rental_history: 0.20,
  verification: 0.10,
  communication: 0.05,
}

const tool: CapabilityTool<ScoreInput, ScoreOutput> = {
  name: 'compute_screening_score',
  version: '1.0.0',
  description:
    'Compute the final v3 screening score deterministically from AI dimension scores + hard gates + red flags + forensics + court records + income/rent. NEVER let the AI choose the final number. This tool enforces: weighted v3 dimensions (40/25/20/10/5), hard-gate caps (income_severe=65, affordability_severe=55 if rent>40% gross, court_record_defendant=35, etc.), red-flag penalties, forensics severity overrides. ' +
    '把 AI 维度分 + 硬门槛 + 红旗 + forensics + 法庭记录 + 收入/租金 综合算出 final score。AI 不直接决定分数。',
  inputSchema: {
    type: 'object',
    properties: {
      scores_v3: {
        type: 'object',
        properties: {
          ability_to_pay: { type: 'number', minimum: 0, maximum: 100 },
          credit_health: { type: 'number', minimum: 0, maximum: 100 },
          rental_history: { type: 'number', minimum: 0, maximum: 100 },
          verification: { type: 'number', minimum: 0, maximum: 100 },
          communication: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['ability_to_pay', 'credit_health', 'rental_history', 'verification', 'communication'],
      },
      hard_gates_triggered: { type: 'array', items: { type: 'string' } },
      red_flags: { type: 'array', items: { type: 'string' } },
      forensics_report: { type: 'object' },
      court_records: { type: 'object' },
      monthly_income: { type: 'number' },
      monthly_rent: { type: 'number' },
    },
    required: ['scores_v3', 'hard_gates_triggered', 'red_flags'],
  },
  needsApproval: false,
  handler: async (input) => {
    const s = { ...input.scores_v3 }
    const notes: string[] = []
    const hardGates = [...input.hard_gates_triggered]
    const redFlags = [...input.red_flags]

    // ─ Affordability backend enforcement
    if (input.monthly_income && input.monthly_rent && input.monthly_rent > 0) {
      const incomeRatio = input.monthly_income / input.monthly_rent
      if (incomeRatio > 0 && incomeRatio < 2.0 && !hardGates.includes('income_severe')) {
        hardGates.push('income_severe')
        notes.push('Backend: rent > 50% income → income_severe')
      }
      if (incomeRatio > 0 && incomeRatio < 2.5 && !hardGates.includes('affordability_severe')) {
        hardGates.push('affordability_severe')
        notes.push('Backend: rent > 40% income → affordability_severe')
      }
      if (incomeRatio >= 2.5 && incomeRatio < 2.857 && !redFlags.includes('rent_ratio_high')) {
        redFlags.push('rent_ratio_high')
      }
    }

    // ─ Court records → cap rental_history + maybe credit_health
    if (input.court_records) {
      const totalHits = input.court_records.canlii_party_hits + input.court_records.portal_defendant_count
      if (totalHits > 0) {
        const rhCap = totalHits >= 2 ? 10 : 25
        s.rental_history = Math.min(s.rental_history, rhCap)
        const chCap = totalHits >= 2 ? 20 : 40
        s.credit_health = Math.min(s.credit_health, chCap)
        if (totalHits >= 2 && !hardGates.includes('court_record_defendant_multi')) {
          hardGates.push('court_record_defendant_multi')
        } else if (totalHits >= 1 && !hardGates.includes('court_record_defendant')) {
          hardGates.push('court_record_defendant')
        }
        notes.push(`Backend: ${totalHits} court hit(s) → rental_history capped at ${rhCap}`)
      }
      if (input.court_records.portal_active_defendant_count > 0) {
        s.rental_history = Math.min(s.rental_history, 5)
        s.credit_health = Math.min(s.credit_health, 15)
        if (!hardGates.includes('court_record_active')) {
          hardGates.push('court_record_active')
        }
        notes.push('Backend: active defendant case → court_record_active')
      }
    }

    // ─ Forensics-derived gates + flags
    let forensicsPenalty = 0
    if (input.forensics_report?.hard_gates) {
      for (const g of input.forensics_report.hard_gates) {
        if (!hardGates.includes(g)) hardGates.push(g)
      }
    }
    if (input.forensics_report?.severity === 'fraud' || input.forensics_report?.severity === 'likely_fraud') {
      if (!hardGates.includes('doc_tampering')) hardGates.push('doc_tampering')
    }
    if (input.forensics_report?.all_flags) {
      for (const f of input.forensics_report.all_flags) {
        if (f.severity === 'critical') forensicsPenalty += 10
        else if (f.severity === 'high') forensicsPenalty += 5
        else if (f.severity === 'medium') forensicsPenalty += 2
      }
    }

    // ─ ID validation flags lift to red flags
    const idFailureCodes = new Set(['id_sin_invalid_checksum', 'id_dl_surname_mismatch', 'id_ohip_invalid_format'])
    if (input.forensics_report?.all_flags?.some((f: any) => idFailureCodes.has(f.code))) {
      if (!redFlags.includes('id_format_invalid')) redFlags.push('id_format_invalid')
    }

    // ─ Compute base + apply caps
    const baseScore = Math.round(
      s.ability_to_pay * V3_WEIGHTS.ability_to_pay +
        s.credit_health * V3_WEIGHTS.credit_health +
        s.rental_history * V3_WEIGHTS.rental_history +
        s.verification * V3_WEIGHTS.verification +
        s.communication * V3_WEIGHTS.communication,
    )
    const claudePenalty = redFlags.reduce((sum, f) => sum + (RED_FLAG_PENALTIES[f] || 0), 0)
    const totalPenalty = claudePenalty + forensicsPenalty
    const gateCap = hardGates.length > 0
      ? Math.min(...hardGates.map((g) => HARD_GATE_CAPS[g] ?? 100))
      : 100
    const overall = Math.round(Math.max(0, Math.min(100, Math.min(baseScore - totalPenalty, gateCap))))

    return {
      overall,
      base_score: baseScore,
      hard_gates: hardGates,
      gate_cap: gateCap,
      red_flags: redFlags,
      red_flag_penalty: claudePenalty,
      forensics_penalty: forensicsPenalty,
      scores_v3_adjusted: s,
      notes,
    }
  },
}

registerTool(tool)
export default tool
