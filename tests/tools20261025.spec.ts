// 租房小工具 /tools + /rules 更新记录 (2026-10-25 · report review batch 1,
// design/ai-rebuild-report-review-2026-10-25.md). Pins: the "may I ask this?"
// table never marks a protected ground askable, the change log only cites rules
// that exist, every rule resolves to an official text, and the public page is
// deterministic (shared computeN* code, no model, no pre-selected form).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ONTARIO_RULES, RULES_CHANGELOG, officialLinkFor, ruleById } from '@/lib/ontario/rules'
import { ASK_GROUPS, ASK_STATUS_LABEL, SCREENING_QUESTIONS, askItemsFor } from '@/lib/ontario/screeningQuestions'

const read = (p: string) => readFileSync(p, 'utf8')

describe('「这个能问吗」table', () => {
  it('keys are unique and every item has a group, a citation and both languages', () => {
    const keys = SCREENING_QUESTIONS.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const i of SCREENING_QUESTIONS) {
      expect(ASK_GROUPS.some((g) => g.key === i.group)).toBe(true)
      expect(i.cite.length).toBeGreaterThan(5)
      expect(i.q.zh && i.q.en && i.why.zh && i.why.en).toBeTruthy()
      if (i.rule) expect(ruleById(i.rule), i.rule).toBeTruthy()
    }
    expect(SCREENING_QUESTIONS.length).toBeGreaterThanOrEqual(15)
  })
  it('protected grounds are never askable; the O. Reg. 290/98 items are allowed with the OHRC limits', () => {
    const status = (k: string) => SCREENING_QUESTIONS.find((i) => i.key === k)?.status
    for (const k of ['source_of_income', 'family', 'citizenship', 'religion_race_language', 'disability', 'orientation_gender']) expect(status(k), k).toBe('no')
    expect(status('fees')).toBe('no')
    for (const k of ['income', 'credit_check', 'guarantor', 'ltb_history', 'pets', 'occupants', 'age']) expect(status(k), k).toBe('ok_limited')
    for (const k of ['rental_history', 'smoking', 'dates_parking']) expect(status(k), k).toBe('ok')
    for (const k of ['sin', 'photos_social']) expect(status(k), k).toBe('avoid')
  })
  it('the income item says no ratio cut-off and the credit item says a thin file is not negative', () => {
    const income = SCREENING_QUESTIONS.find((i) => i.key === 'income')!
    expect(income.why.zh).toContain('一刀切')
    expect(income.why.en.toLowerCase()).toContain('ratio')
    expect(income.rule).toBe('OHRC-no-income-cutoff')
    const credit = SCREENING_QUESTIONS.find((i) => i.key === 'credit_check')!
    expect(credit.why.zh).toContain('同意')
    expect(credit.why.zh).toContain('不等于信用差')
  })
  it('every group has items and the four status labels are bilingual', () => {
    for (const g of ASK_GROUPS) expect(askItemsFor(g.key).length).toBeGreaterThan(0)
    for (const s of Object.values(ASK_STATUS_LABEL)) expect(s.zh && s.en).toBeTruthy()
  })
  it('plain copy: no 背调 / 法律协助 / 助手', () => {
    const all = JSON.stringify(SCREENING_QUESTIONS)
    for (const bad of ['背调', '背景调查', '法律协助', '助手', '管家']) expect(all).not.toContain(bad)
  })
})

describe('/rules change log + official sources', () => {
  it('entries are newest first and only cite rules that exist', () => {
    const dates = RULES_CHANGELOG.map((c) => c.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    for (const c of RULES_CHANGELOG) {
      expect(c.rules.length).toBeGreaterThan(0)
      for (const id of c.rules) expect(ruleById(id), `${c.date} → ${id}`).toBeTruthy()
      expect(c.source.url).toMatch(/^https:\/\//)
      expect(c.title.zh && c.title.en).toBeTruthy()
      expect(c.date).toMatch(/^\d{4}-\d{2}(-\d{2})?$/)
    }
  })
  it('the Bill 60 dates match the rules they list', () => {
    const sep = RULES_CHANGELOG.find((c) => c.date === '2026-09-21')!
    for (const id of sep.rules) expect(ruleById(id)!.since).toBe('2026-09-21')
    const jul = RULES_CHANGELOG.find((c) => c.date === '2026-07-01')!
    for (const id of jul.rules) expect(ruleById(id)!.since).toBe('2026-07-01')
  })
  it('every rule resolves to an official text', () => {
    for (const r of ONTARIO_RULES) {
      const l = officialLinkFor(r)
      expect(l.url, r.id).toMatch(/^https:\/\/(www\.ontario\.ca|www\.ohrc\.on\.ca|tribunalsontario\.ca|www\.toronto\.ca)\//)
      expect(l.url, r.id).not.toBe('https://www.ontario.ca/laws')
    }
  })
  it('the rules page prints the change log, the in-force date and the official link, and links to /tools', () => {
    const src = read('app/rules/page.tsx')
    expect(src).toContain('RULES_CHANGELOG')
    expect(src).toContain('officialLinkFor(r)')
    expect(src).toContain('r.since')
    expect(src).toContain('href="/tools"')
    expect(src).toContain('id="changelog"')
  })
})

describe('/tools page', () => {
  const src = read('app/tools/page.tsx')
  it('reuses the landlord toolbox arithmetic and the v1 benchmark route — one source of truth, no model', () => {
    expect(src).toContain("from '@/lib/ontario/noticeForms'")
    for (const fn of ['computeN1(', 'computeN4(', 'computeN12(']) expect(src).toContain(fn)
    expect(src).toContain('/api/v1/rent-benchmark')
    expect(src).toContain("from '@/lib/ontario/screeningQuestions'")
    expect(src).not.toMatch(/llmChat|supabase|localStorage|signInWithOtp/)
  })
  it('no form is pre-selected and nothing is filed for the landlord', () => {
    expect(src).toContain('useState<ToolForm | null>(null)')
    expect(src).toContain('不代填、不代选、不代送')
  })
  it('three anchored sections and the not-legal-advice line', () => {
    for (const id of ['id="notices"', 'id="rent"', 'id="ask"']) expect(src).toContain(id)
    expect(src).toContain('这不是法律意见')
    for (const bad of ['法律协助', '背调', '助手', 'window.confirm', 'alert(']) expect(src).not.toContain(bad)
  })
  it('is registered as a public route everywhere the others are', () => {
    expect(read('app/sitemap.ts')).toContain("'/tools'")
    expect(read('app/sitemap.ts')).toContain("'/rules'")
    expect(read('scripts/mobile-audit.mjs')).toContain("'/tools'")
    expect(read('scripts/route-audit.mjs')).toContain("'/tools'")
    expect(read('components/Footer.tsx')).toContain("href: '/tools'")
    expect(read('lib/i18n.tsx')).toContain("'foot.tools'")
  })
})
