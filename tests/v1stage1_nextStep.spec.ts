// V1.0 · 阶段 1 · 甲 #1 「下一步」 + 甲 #2 「同一批文件重跑」
// (design/v1-scope-and-roadmap-2026-10.md 3.1; research C1-3 / C1-4 / C1-5).
//
// 1. nextStepsFor: four tiers × with / without an application → the links
//    (href + kind) that already exist in the product; error rows → re-run.
// 2. Wording: only "next step", never a recommendation; no score / ratio / %.
// 3. The done and report pages mount NextStepCard; the screening app renders
//    the re-run entry only inside the history row's `status === 'error'` branch.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { nextStepsFor, rerunHref } from '../lib/screening/nextStep'

const read = (p: string) => readFileSync(p, 'utf8')
const APP = '0b93ea2f-1111-4222-8333-944444444444'
const SID = 'd1a7f9c0-2222-4333-8444-955555555555'
const TIERS = ['approve', 'conditional', 'decline', 'none'] as const
const LANGS = ['zh', 'en'] as const

describe('nextStepsFor — with an application (closed loop)', () => {
  it('approve → lease draft prefilled from the application + decision notice on the applicant page', () => {
    for (const lang of LANGS) {
      const s = nextStepsFor({ tier: 'approve', status: 'scored', applicationId: APP, screeningId: SID, lang })
      expect(s.map((x) => x.kind)).toEqual(['lease', 'decision'])
      expect(s[0].href).toBe(`/landlord/leases/new?application_id=${APP}`)
      expect(s[1].href).toBe(`/landlord/applicants/${APP}`)
    }
  })
  it('approve with an existing lease keeps the same link but says "open"', () => {
    const s = nextStepsFor({ tier: 'approve', status: 'scored', applicationId: APP, screeningId: SID, hasLease: true, lang: 'zh' })
    expect(s[0].href).toBe(`/landlord/leases/new?application_id=${APP}`)
    expect(s[0].title).toMatch(/打开/)
  })
  it('conditional → follow up on the applicant page', () => {
    const s = nextStepsFor({ tier: 'conditional', status: 'scored', applicationId: APP, screeningId: SID, lang: 'en' })
    expect(s.map((x) => [x.kind, x.href])).toEqual([['follow_up', `/landlord/applicants/${APP}`]])
  })
  it('decline → decline notice (reason required) on the applicant page', () => {
    const s = nextStepsFor({ tier: 'decline', status: 'scored', applicationId: APP, screeningId: SID, lang: 'zh' })
    expect(s.map((x) => [x.kind, x.href])).toEqual([['decision', `/landlord/applicants/${APP}`]])
    expect(s[0].title).toMatch(/理由/)
  })
  it('no tier → back to the application', () => {
    const s = nextStepsFor({ tier: null, status: 'scored', applicationId: APP, screeningId: SID, lang: 'en' })
    expect(s.map((x) => [x.kind, x.href])).toEqual([['queue', `/landlord/applicants/${APP}`]])
  })
  it('a malformed application id is treated as no application', () => {
    const s = nextStepsFor({ tier: 'approve', status: 'scored', applicationId: 'not-a-uuid', screeningId: SID, lang: 'en' })
    expect(s.map((x) => x.href)).toEqual(['/landlord/leases/new', '/leases/import'])
  })
})

describe('nextStepsFor — manual upload (no application)', () => {
  it('approve → blank lease draft + record an existing lease', () => {
    for (const lang of LANGS) {
      const s = nextStepsFor({ tier: 'approve', status: 'scored', screeningId: SID, lang })
      expect(s.map((x) => [x.kind, x.href])).toEqual([['lease', '/landlord/leases/new'], ['import', '/leases/import']])
    }
  })
  it('conditional / decline / none → screen another or back to the queue', () => {
    for (const tier of ['conditional', 'decline', 'none', null]) {
      const s = nextStepsFor({ tier, status: 'done', screeningId: SID, lang: 'zh' })
      expect(s.map((x) => [x.kind, x.href])).toEqual([['screen_again', '/screening/app'], ['queue', '/landlord/applicants']])
    }
  })
})

describe('nextStepsFor — status', () => {
  it('error rows get a single re-run step on the existing ?screening=&run=1 path', () => {
    const s = nextStepsFor({ tier: null, status: 'error', applicationId: APP, screeningId: SID, lang: 'en' })
    expect(s.map((x) => [x.kind, x.href])).toEqual([['rerun', rerunHref(SID)]])
    expect(rerunHref(SID)).toBe(`/screening/app?screening=${SID}&run=1`)
  })
  it('rows still uploading / scoring get nothing', () => {
    for (const status of ['uploading', 'scoring']) {
      expect(nextStepsFor({ tier: 'approve', status, applicationId: APP, screeningId: SID, lang: 'zh' })).toEqual([])
    }
  })
  it('always 1–3 steps for finished rows', () => {
    for (const tier of TIERS) for (const appId of [APP, null]) for (const lang of LANGS) {
      const n = nextStepsFor({ tier, status: 'scored', applicationId: appId, screeningId: SID, lang }).length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(3)
    }
  })
})

describe('OHRC wording — a next step, not a recommendation', () => {
  const BANNED = [/建议录取/, /建议拒绝/, /建议通过/, /分数/, /评分/, /%/, /recommend/i, /score/i, /ratio/i, /比值/, /倍/]
  it('no step text names a score, ratio, percentage or recommendation', () => {
    for (const tier of [...TIERS, null]) for (const appId of [APP, null]) for (const lang of LANGS) {
      for (const s of nextStepsFor({ tier, status: 'scored', applicationId: appId, screeningId: SID, lang })) {
        const text = `${s.title} ${s.desc}`
        for (const re of BANNED) expect(text, `${lang} ${tier} ${appId ? 'app' : 'manual'}: ${text}`).not.toMatch(re)
      }
      // the re-run step may say "re-score" (it names the process, not a number)
      for (const s of nextStepsFor({ tier, status: 'error', applicationId: appId, screeningId: SID, lang })) {
        expect(`${s.title} ${s.desc}`).not.toMatch(/分数|%|\d+ ?\/ ?100|recommend|建议/i)
      }
    }
  })
  it('the card itself says the decision is the landlord’s and names no score', () => {
    const card = read('components/screening/NextStepCard.tsx')
    expect(card).toMatch(/data-testid="screening-next-step"/)
    expect(card).toMatch(/决定由房东本人做出/)
    expect(card).toMatch(/the decision is the landlord/)
    // the card may say "not a recommendation"; it must not carry a score, ratio or percentage
    for (const re of [/建议录取/, /建议拒绝/, /建议通过/, /分数/, /评分/, /%/, /score/i, /ratio/i, /比值/]) expect(card).not.toMatch(re)
  })
})

describe('wiring', () => {
  it('done page mounts NextStepCard right after the conclusion card, with the application + lease facts', () => {
    const page = read('app/screening/[id]/done/page.tsx')
    expect(page).toMatch(/import NextStepCard from '@\/components\/screening\/NextStepCard'/)
    expect(page).toMatch(/nextStepsFor\(\{ tier, status: screening\.status, applicationId, screeningId: id, hasLease/)
    expect(page).toMatch(/from\('lease_documents'\)[\s\S]*\.eq\('application_id', applicationId\)/)
    const card = page.indexOf('<NextStepCard')
    const dims = page.indexOf('{/* Dimension Scores */}')
    expect(card).toBeGreaterThan(0)
    expect(card).toBeLessThan(dims)
  })
  it('report page renders NextStepCard exactly once, at the end before the footer', () => {
    const page = read('app/screening/[id]/report/page.tsx')
    expect(page).toMatch(/import NextStepCard from '@\/components\/screening\/NextStepCard'/)
    expect(page.split('<NextStepCard').length - 1).toBe(1)
    const card = page.indexOf('<NextStepCard')
    const footer = page.lastIndexOf('<Footer />')
    expect(card).toBeGreaterThan(0)
    expect(card).toBeLessThan(footer)
  })
  it('screening app: the re-run entry lives inside the history row error branch, re-scores without uploading, shows the stamped reason', () => {
    const page = read('app/screening/app/page.tsx')
    const i = page.indexOf('data-testid="screening-rerun"')
    expect(i).toBeGreaterThan(0)
    const before = page.slice(Math.max(0, i - 600), i)
    expect(before).toMatch(/s\.status === 'error' &&/)
    const block = page.slice(i - 300, i + 2600)
    expect(block).toMatch(/重跑/)
    expect(block).toMatch(/runAnalysis\(\{ id: s\.id, fileCount: nFiles \}\)/)
    expect(block).toMatch(/不会再传一次/)
    expect(block).toMatch(/errorReasonText\(s\.error/)
    // the history query now carries what the button needs
    expect(page).toMatch(/ai_summary_zh, status, created_at, error, files'/)
  })
})
