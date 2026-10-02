import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Site-wide test 2026-10-02 (deploy a1fab56), group G6 — copy and line-break
// defects on public pages. Each guard fails on the code that shipped in a1fab56.
const read = (p: string) => readFileSync(p, 'utf8')

describe('L7-anon D-02: /landlord copy matches the shipped screening facts', () => {
  const s = read('app/landlord/page.tsx')
  it('no 8-axis diligence, no ranking, no income multiple, no recommendation, no invented automation', () => {
    for (const bad of ['8 维', '8-axis', '8 axes', '排好序', '排序', 'ranked', ' rank ', '4.2×', '建议优先', 'recommend her first', '多平台同步', 'synced', '追材料', 'chased automatically', '收租', '全托管', '30 秒', '30 sec', '$2,900'])
      expect(s, bad).not.toContain(bad)
  })
  it('names the four scored areas and leaves the decision with the landlord', () => {
    expect(s).toContain('四项评分')
    expect(s).toContain('付款能力、信用、租务与司法历史、核验')
    expect(s).toContain('ability to pay, credit, tenancy & court history, verification')
    expect(s).toMatch(/不排名、不设收入倍数截止线\(OHRC\)/)
    expect(s).toContain("delta: { zh: '决定权始终在你'")
  })
})

describe('L7-anon D-09: /agent persona story carries no fabricated outcome metrics', () => {
  const s = read('app/agent/page.tsx')
  const scenario = s.slice(s.indexOf('  story: ['), s.indexOf('  chips: ['))
  it('story and scenario have no percentages, dollar figures, counts or rankings', () => {
    expect(scenario).not.toMatch(/\d+\s*%|\$\d|Top \d|\d+ 次|两倍|twice the clients/)
  })
  it('no route planning (it does not exist)', () => {
    expect(s).not.toMatch(/路线|route/i)
  })
})

describe('L7-anon D-10 + L6-public D6: /platform', () => {
  const s = read('app/platform/page.tsx')
  it('the tenant entry goes to the tenant role page, like landlord and agent', () => {
    expect(s).toContain('<Link href="/tenant" className="sl-btn-secondary">')
    expect(s).not.toContain('/?role=tenant')
  })
  it('stage list items break at phrase boundaries, not mid-word, and avoid orphans', () => {
    expect(s).toContain('<span className="min-w-0 break-keep [overflow-wrap:anywhere] [text-wrap:pretty]">')
  })
})

describe('L6-public D2: footer links never split', () => {
  const f = read('components/Footer.tsx')
  it('each link is nowrap and the phone grid sizes the first column to its longest link', () => {
    expect(f).toContain('className="whitespace-nowrap text-[13.5px] text-body-2 transition hover:text-brand"')
    expect(f).toMatch(/grid-cols-\[auto_1fr\] gap-x-6[^"]*sm:grid-cols-3/)
  })
})

describe('L6-public D4 + D6: trailing arrows and short CJK links stay whole', () => {
  it('/services card CTAs join the arrow with a non-breaking space', () => {
    const s = read('app/services/page.tsx')
    const ctas = s.match(/cta: \{ zh: '[^']*', en: '[^']*' \}/g) || []
    expect(ctas.length).toBe(3)
    for (const c of ctas) expect(c, c).not.toMatch(/ →'/)
    for (const c of ctas) expect(c, c).toMatch(/\\u00a0→'/)
  })
  it('/partners source link arrow is non-breaking and 联系页 does not split', () => {
    const s = read('app/partners/page.tsx')
    expect(s).toContain("{'\\u00a0'}↗")
    expect(s).not.toMatch(/\} ↗/)
    expect(s).toContain('<Link href="/contact" className="whitespace-nowrap underline">')
  })
})

describe('L6-public D7: /verify/<invalid token> has an h1', () => {
  it('the missing-link state renders its own heading', () => {
    const s = read('app/verify/[token]/page.tsx')
    const missing = s.slice(s.indexOf("{view === 'missing' && ("), s.indexOf("{view && view !== 'missing' && ("))
    expect(missing).toContain('<h1')
    expect(missing).toContain('{L.missingTitle}')
  })
})

describe('role pages label persona stories as examples (review 2026-10-02)', () => {
  it('the scenario eyebrow says 场景示例 / EXAMPLE SCENARIO, never 真实场景', () => {
    const s = readFileSync('components/RoleLanding.tsx', 'utf8')
    expect(s).toContain("{lang === 'zh' ? '场景示例' : 'EXAMPLE SCENARIO'}")
    expect(s).not.toMatch(/真实场景|REAL SCENARIO/)
  })
})

