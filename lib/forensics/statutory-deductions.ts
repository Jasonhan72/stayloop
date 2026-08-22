// -----------------------------------------------------------------------------
// P1b — Statutory Deduction Recomputation (CPP / CPP2 / EI)
//
// The strongest deterministic authenticity check available on a Canadian pay
// stub. CRA publishes exact annual parameters (YMPE, YAMPE, MIE, rates); a
// genuine payroll system (ADP, Ceridian, Workday) computes contributions to
// the cent against them. This cuts both ways:
//
//   AGAINST forgery — a YTD contribution EXCEEDING the legal annual maximum
//   is mathematically impossible on a real stub (payroll systems stop
//   withholding at the cap). A forger who inflates income without knowing
//   the caps overshoots them.
//
//   FOR authenticity — YTD CPP/CPP2/EI landing EXACTLY on the legal maximum
//   (to the cent), with income actually high enough to reach the cap, means
//   the document was produced by software that models the full statutory
//   rules — a professional payroll system, not a template editor.
//
// Rate checks use generous tolerances because taxable benefits enter the CPP
// base (but not EI insurable earnings) and we only see cash gross — we flag
// only large deviations and only at low severity.
// -----------------------------------------------------------------------------

import type { ForensicFlag, PaystubExtraction } from './types'

/** CRA-published parameters per tax year.
 *  ympe  = Year's Maximum Pensionable Earnings (CPP base ceiling)
 *  yampe = Year's Additional Maximum Pensionable Earnings (CPP2 ceiling)
 *  mie   = Maximum Insurable Earnings (EI ceiling)
 */
const CRA_PARAMS: Record<number, {
  ympe: number; yampe: number; basicExemption: number
  cppRate: number; cpp2Rate: number; mie: number; eiRate: number
}> = {
  2024: { ympe: 68_500, yampe: 73_200, basicExemption: 3_500, cppRate: 0.0595, cpp2Rate: 0.04, mie: 63_200, eiRate: 0.0166 },
  2025: { ympe: 71_300, yampe: 81_200, basicExemption: 3_500, cppRate: 0.0595, cpp2Rate: 0.04, mie: 65_700, eiRate: 0.0164 },
  2026: { ympe: 74_600, yampe: 85_000, basicExemption: 3_500, cppRate: 0.0595, cpp2Rate: 0.04, mie: 68_900, eiRate: 0.0163 },
}

const PERIODS_PER_YEAR: Record<string, number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
}

const fmt = (n: number) => n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function checkStatutoryDeductions(
  ext: PaystubExtraction,
  file: string
): ForensicFlag[] {
  const flags: ForensicFlag[] = []
  if (!ext.pay_date) return flags
  // Parse the year from the ISO string directly — new Date('YYYY-MM-DD') is
  // UTC-parsed but .getFullYear() is LOCAL, so a Jan 1 pay date would pick
  // the previous year's CRA params in any non-UTC runtime.
  const year = Number(ext.pay_date.slice(0, 4))
  const p = CRA_PARAMS[year]
  if (!p) return flags  // year outside our table — skip silently

  const maxCpp = Math.round((p.ympe - p.basicExemption) * p.cppRate * 100) / 100
  const maxCpp2 = Math.round((p.yampe - p.ympe) * p.cpp2Rate * 100) / 100
  const maxEi = Math.round(p.mie * p.eiRate * 100) / 100
  // The extraction prompt folds QPP into cpp_ytd ("CPP / QPP"), and Quebec's
  // QPP employee rate (6.40%) is higher than CPP's 5.95% — a genuine Quebec
  // stub legitimately exceeds the CPP max by ~$300/yr. The impossibility
  // ceiling for Check A must therefore be the HIGHER (QPP) figure, or every
  // real QC-employer stub hard-gates as forged. Check B (exactly-at-max
  // corroboration) keeps using the CPP figure — landing exactly on either
  // cap is handled there as a positive, not a gate.
  const QPP_RATE = 0.064
  const maxCppOrQpp = Math.round((p.ympe - p.basicExemption) * QPP_RATE * 100) / 100

  // ---------------------------------------------------------------------------
  // Check A: YTD contributions must not exceed the legal annual maximum.
  // Payroll systems stop withholding at the cap — exceeding it is impossible.
  // $2 tolerance absorbs rounding across pay periods.
  // ---------------------------------------------------------------------------
  const excesses: string[] = []
  if (ext.cpp_ytd !== null && ext.cpp_ytd > maxCppOrQpp + 2) {
    excesses.push(`CPP/QPP $${fmt(ext.cpp_ytd)} > legal max $${fmt(maxCppOrQpp)} (QPP ceiling)`)
  }
  if (ext.cpp2_ytd !== null && ext.cpp2_ytd > maxCpp2 + 2) {
    excesses.push(`CPP2 $${fmt(ext.cpp2_ytd)} > legal max $${fmt(maxCpp2)}`)
  }
  if (ext.ei_ytd !== null && ext.ei_ytd > maxEi + 2) {
    excesses.push(`EI $${fmt(ext.ei_ytd)} > legal max $${fmt(maxEi)}`)
  }
  if (excesses.length > 0) {
    flags.push({
      code: 'paystub_deduction_exceeds_legal_max',
      severity: 'high',
      file,
      evidence_en: `YTD statutory deductions exceed the ${year} CRA legal annual maximum: ${excesses.join('; ')}. Real payroll systems stop withholding at the cap — this is mathematically impossible on a genuine stub.`,
      evidence_zh: `YTD 法定扣缴超过 ${year} 年 CRA 法定年度上限：${excesses.join('；')}。真实工资系统达到上限即停止扣缴——真件上不可能出现这个数字。`,
    })
  }

  // ---------------------------------------------------------------------------
  // Check B: YTD contributions landing EXACTLY on the legal maximum (±$0.05),
  // with income actually high enough to have reached the cap, is a strong
  // authenticity positive — only software modeling the full statutory rules
  // produces this.
  // ---------------------------------------------------------------------------
  const atMax: string[] = []
  // Each program has its OWN earnings ceiling: hitting the CPP cap requires
  // pensionable earnings ≥ YMPE, the CPP2 cap requires ≥ YAMPE, and the EI
  // cap requires insurable earnings ≥ MIE. The income floor the stub must
  // clear is the HIGHEST ceiling among the programs claiming to be maxed —
  // otherwise a forged CPP-at-max with low income would validate against
  // the (lower) EI ceiling.
  let capFloor = 0
  if (ext.cpp_ytd !== null && Math.abs(ext.cpp_ytd - maxCpp) <= 0.05) {
    atMax.push(`CPP = $${fmt(maxCpp)}`)
    capFloor = Math.max(capFloor, p.ympe)
  }
  if (ext.cpp2_ytd !== null && Math.abs(ext.cpp2_ytd - maxCpp2) <= 0.05) {
    atMax.push(`CPP2 = $${fmt(maxCpp2)}`)
    capFloor = Math.max(capFloor, p.yampe)
  }
  if (ext.ei_ytd !== null && Math.abs(ext.ei_ytd - maxEi) <= 0.05) {
    atMax.push(`EI = $${fmt(maxEi)}`)
    capFloor = Math.max(capFloor, p.mie)
  }

  if (atMax.length > 0 && ext.ytd_gross !== null) {
    if (ext.ytd_gross >= capFloor * 0.95) {
      flags.push({
        code: 'paystub_deductions_at_legal_max',
        severity: 'info',
        file,
        evidence_en: `YTD statutory deductions hit the ${year} CRA legal annual maximum to the cent (${atMax.join(', ')}), and YTD gross $${fmt(ext.ytd_gross)} is high enough to reach the cap. Only professional payroll software modeling full statutory rules (YMPE $${p.ympe.toLocaleString()}, YAMPE $${p.yampe.toLocaleString()}, MIE $${p.mie.toLocaleString()}) produces this — strong authenticity evidence.`,
        evidence_zh: `YTD 法定扣缴精确到分命中 ${year} 年 CRA 法定年度上限（${atMax.join('、')}），且 YTD 毛收入 $${fmt(ext.ytd_gross)} 足以触顶。只有完整建模法定规则（YMPE $${p.ympe.toLocaleString()} / YAMPE $${p.yampe.toLocaleString()} / MIE $${p.mie.toLocaleString()}）的专业工资系统才会产出这个精度——强真实性证据。`,
      })
    } else {
      flags.push({
        code: 'paystub_deduction_cap_income_mismatch',
        severity: 'medium',
        file,
        evidence_en: `YTD deductions are at the ${year} annual maximum (${atMax.join(', ')}) but YTD gross $${fmt(ext.ytd_gross)} is too low to have reached the contribution ceiling (needs ≥ ~$${capFloor.toLocaleString()}). The deduction lines contradict the printed income.`,
        evidence_zh: `YTD 扣缴已达 ${year} 年度上限（${atMax.join('、')}），但 YTD 毛收入 $${fmt(ext.ytd_gross)} 不足以触顶（需 ≥ 约 $${capFloor.toLocaleString()}）。扣缴栏与收入栏自相矛盾。`,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Check C: per-period rate recomputation (only when clearly below the cap).
  //   expected CPP ≈ (period_gross − basicExemption/ppy) × 5.95%
  //   expected EI  ≈ period_gross × EI rate
  // Taxable benefits enter the CPP base but aren't in cash gross, so actuals
  // can run slightly HIGH — the verified band is asymmetric and the failure
  // band is wide (>25%) at low severity.
  // ---------------------------------------------------------------------------
  const ppy = ext.pay_frequency ? PERIODS_PER_YEAR[ext.pay_frequency] : null
  const verified: string[] = []
  const deviations: string[] = []
  const deviationSigns: number[] = []

  if (ppy && ext.period_gross && ext.cpp_period !== null && ext.cpp_period > 0
      && (ext.cpp_ytd === null || ext.cpp_ytd < maxCpp - 5)) {
    const expectedCpp = (ext.period_gross - p.basicExemption / ppy) * p.cppRate
    const dev = (ext.cpp_period - expectedCpp) / expectedCpp
    if (dev >= -0.025 && dev <= 0.05) {
      verified.push(`CPP $${fmt(ext.cpp_period)} ≈ (gross − $${fmt(p.basicExemption / ppy)} exemption) × ${(p.cppRate * 100).toFixed(2)}%`)
    } else if (Math.abs(dev) > 0.25) {
      deviations.push(`CPP $${fmt(ext.cpp_period)} vs expected $${fmt(expectedCpp)} (${(dev * 100).toFixed(0)}% off)`)
      deviationSigns.push(Math.sign(dev))
    }
  }
  if (ext.period_gross && ext.ei_period !== null && ext.ei_period > 0
      && (ext.ei_ytd === null || ext.ei_ytd < maxEi - 5)) {
    const expectedEi = ext.period_gross * p.eiRate
    const dev = (ext.ei_period - expectedEi) / expectedEi
    if (Math.abs(dev) <= 0.025) {
      verified.push(`EI $${fmt(ext.ei_period)} ≈ gross × ${(p.eiRate * 100).toFixed(2)}%`)
    } else if (Math.abs(dev) > 0.25) {
      deviations.push(`EI $${fmt(ext.ei_period)} vs expected $${fmt(expectedEi)} (${(dev * 100).toFixed(0)}% off)`)
      deviationSigns.push(Math.sign(dev))
    }
  }

  if (verified.length > 0 && deviations.length === 0) {
    flags.push({
      code: 'paystub_period_deductions_verified',
      severity: 'info',
      file,
      evidence_en: `This period's statutory deductions recompute correctly against ${year} CRA rates: ${verified.join('; ')}. Consistent with genuine payroll output.`,
      evidence_zh: `本期法定扣缴按 ${year} 年 CRA 费率复算吻合：${verified.join('；')}。与真实工资系统输出一致。`,
    })
  }
  // BOTH statutory lines off by >25% in the SAME direction is no longer
  // extraction noise or a benefits adjustment — it is a stub whose numbers
  // were written against a different year's (or no) rate table. Case 24:
  // CPP −26% and EI −37% on all three stubs, consistently.
  if (deviations.length >= 2 && deviationSigns.every(s => s === deviationSigns[0])) {
    flags.push({
      code: 'paystub_statutory_rates_systematically_off',
      severity: 'medium',
      file,
      evidence_en: `Both CPP and EI this period deviate from ${year} CRA rates in the same direction (${deviations.join('; ')}). One line off can be a benefits adjustment or extraction noise; both off together, the same way, means the deductions were not produced by payroll software using the current rate table.`,
      evidence_zh: `本期 CPP 与 EI 两项法定扣缴同时、同方向偏离 ${year} 年 CRA 费率（${deviations.join('；')}）。单项偏差可能是福利调整或提取误差；两项一起、同向偏差，说明扣缴数字不是由使用当年费率表的工资软件算出来的。`,
    })
  } else if (deviations.length > 0) {
    flags.push({
      code: 'paystub_deduction_rate_mismatch',
      severity: 'low',
      file,
      evidence_en: `This period's statutory deductions deviate from ${year} CRA rates: ${deviations.join('; ')}. Could be Quebec (QPP), benefits adjustments, or extraction noise — verify against the original.`,
      evidence_zh: `本期法定扣缴与 ${year} 年 CRA 费率偏差较大：${deviations.join('；')}。可能是魁省 QPP、福利调整或提取误差——建议对照原件核实。`,
    })
  }

  return flags
}
