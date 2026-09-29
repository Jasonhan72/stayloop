/**
 * v5.4 Passport Stamps — single source of truth.
 *
 * Presentation-layer rename of the trust system: the DB field `trust_tier`
 * (1-4) stays untouched; UI maps tier N → "first N stamps stamped".
 * Copy is verbatim from design/v54-passport-stamps.html.
 */

export type StampKey = 'identity' | 'income' | 'bank' | 'court'

export interface StampDef {
  key: StampKey
  /** Which trust_tier stamps this seal (tier N = stamps 1..N). */
  tier: 1 | 2 | 3 | 4
  icon: string
  zh: string
  en: string
  /** 验了什么 */
  what_zh: string
  what_en: string
  /** 房东看到什么 — what the landlord sees once this step is verified (2026-09-28: was 「解锁」, but a stamp
   *  gates no listing and no queue; the 42% figure had no source) */
  gain_zh: string
  gain_en: string
  /** 预计耗时（用于「下一枚」提示） */
  est_zh?: string
  est_en?: string
}

/** Green check color for stamped/verified badges (blueprint --check). */
export const STAMP_CHECK_GREEN = '#6AB344'

export const STAMPS: StampDef[] = [
  {
    key: 'identity',
    tier: 1,
    icon: '🪪',
    zh: '身份章',
    en: 'Identity stamp',
    what_zh: '法定姓名 · 证件 · 联系方式',
    what_en: 'Legal name · ID · contact',
    gain_zh: '经 Veriff 核实的姓名与证件（只留证件末四位）',
    gain_en: 'Name and ID checked by Veriff (only the last four digits kept)',
    est_zh: '约 90 秒',
    est_en: '~90 seconds',
  },
  {
    key: 'income',
    tier: 2,
    icon: '💼',
    zh: '收入章',
    en: 'Income stamp',
    what_zh: '月收入 · 雇主 · 工作年限',
    what_en: 'Monthly income · employer · tenure',
    gain_zh: '收入与雇主来自文件互证，不是自述',
    gain_en: 'Income and employer from cross-checked documents, not self-reported',
  },
  {
    key: 'bank',
    tier: 3,
    icon: '🏦',
    zh: '银行章',
    en: 'Bank stamp',
    what_zh: '现金流稳定性 · 退款记录',
    what_en: 'Cash-flow stability · NSF history',
    gain_zh: '入账与退票记录的摘要，不含原始流水',
    gain_en: 'A summary of deposits and NSFs, never the raw statements',
    est_zh: '约 5 分钟',
    est_en: '~5 minutes',
  },
  {
    key: 'court',
    tier: 4,
    icon: '⚖️',
    zh: '信用 + 法庭章',
    en: 'Credit + court stamp',
    what_zh: '信用分 · LTB 记录',
    what_en: 'Credit score · LTB records',
    gain_zh: '信用分档与 LTB 判令目录检索结果',
    gain_en: 'Credit band and the LTB order catalogue result',
  },
]

/** Look up a stamp by key. */
export function stampByKey(key: StampKey): StampDef {
  return STAMPS.find((s) => s.key === key) ?? STAMPS[0]
}

/** Stamp for the Nth tier (1-4) — e.g. a "tier 3 threshold" maps to the bank stamp. */
export function stampForTier(tier: number): StampDef {
  const t = Math.min(Math.max(Math.round(tier), 1), 4)
  return STAMPS[t - 1]
}

/** Stamped stamp keys for a given trust_tier: tier N = first N stamps. */
export function stampsForTier(tier: number): StampKey[] {
  const t = Math.min(Math.max(Math.round(tier), 0), 4)
  return STAMPS.slice(0, t).map((s) => s.key)
}

/** Progress label: tier 2 → '已盖 2/4 枚章' / '2/4 stamps'. */
export function stampLabel(tier: number, lang: 'zh' | 'en' = 'zh'): string {
  const t = Math.min(Math.max(Math.round(tier), 0), 4)
  return lang === 'zh' ? `已盖 ${t}/4 枚章` : `${t}/4 stamps`
}

/** The next stamp to earn after the current tier, or null if all four are stamped. */
export function nextStamp(tier: number): StampDef | null {
  const t = Math.min(Math.max(Math.round(tier), 0), 4)
  return t >= 4 ? null : STAMPS[t]
}
