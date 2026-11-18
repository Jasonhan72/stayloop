// 2026-11-17 · product report §4.5: a tenant with a real managed tenancy opened /tenant/lease and saw it
// under a page titled 「Unit 1207 · King West 租约」 with a banner saying the page was a product demo —
// real records and a sample lease on one screen, always. It was the only route built that way
// (SAMPLE_NOTE). It is gated now like every other workspace page: real records and tools by default,
// the sample lease only after 「查看产品演示」, under the sample banner.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')
const shell = read('components/WorkspaceShell.tsx')
const page = read('app/tenant/lease/page.tsx')

describe('/tenant/lease is gated: real by default, sample on request', () => {
  it('no route carries an always-on sample note any more', () => {
    expect(shell).toContain('const SAMPLE_NOTE: Record<string, GateNote> = {}')
    const gate = shell.slice(shell.indexOf('const DEMO_GATE'), shell.indexOf('const SAMPLE_NOTE'))
    const i = gate.indexOf("'/tenant/lease': {")
    expect(i).toBeGreaterThan(0)
    const entry = gate.slice(i, gate.indexOf("'/tenant/payments': {"))
    expect(entry).toContain('还没有在管租约')
    expect(entry).toContain("href: '/leases/import'")
    // the demo, when opened, says in so many words that this lease is not the reader's
    expect(entry).toContain('都是示范数据，不是你的租约')
  })
  it('the real blocks are the live slot; the sample lease is the gated body', () => {
    expect(page).toContain('liveSlot={<LeaseLive zh={zh} />}')
    const live = page.slice(page.indexOf('function LeaseLive'), page.indexOf('export default function TenantLeasePage'))
    for (const block of ['<InsuranceReferralCard />', '<HouseholdList />', '<N1CheckCard />', '<MoveOutTools />', "title={zh ? '租约' : 'Lease'}"]) expect(live, block).toContain(block)
    expect(live).not.toMatch(/Unit 1207|King West/)
    // nothing real is left inside the gated body
    const body = page.slice(page.indexOf('liveSlot={<LeaseLive zh={zh} />}'), page.indexOf('function SigningAside'))
    for (const block of ['<HouseholdList', '<N1CheckCard', '<MoveOutTools', '<InsuranceReferralCard']) expect(body, block).not.toContain(block)
    expect(body).toContain("title={zh ? 'Unit 1207 · King West 租约' : 'Unit 1207 · King West Lease'}")
  })
  it('the sample aside (签署进度) and the sample body show only in demo mode', () => {
    expect(shell).toContain('const asideHidden = hideAside || (gate != null && !showDemo)')
    expect(shell).toMatch(/if \(showDemo\) \{\s*return \(\s*<>\s*<SampleBanner/)
  })
  it('the tenancy list reports its rows, so the empty state never says 「还没有在管租约」 under a real one', () => {
    expect(read('components/HouseholdList.tsx')).toContain("useReportLiveRows('households', rows ? rows.length : null)")
    expect(shell).toContain('const copy = hasLive && live > 0')
  })
  it('under real rows the pointer to the demo is a footnote: honest wording, no tall empty box', () => {
    expect(shell).toContain('以上是你的真实记录。想看这一页填满示范数据的样子，可以打开产品演示。')
    expect(shell).not.toContain('这一页的其余部分仍是产品演示')
    expect(shell).toContain("${compact ? 'py-6' : 'py-16'}")
    expect(shell).toContain('const compact = hasLive && live > 0')
  })
})
