// 2026-11-17 · the five small problems from the product report (design/product-report-2026-11-17.md §4):
//   3. cards and the agent screening banners showed 中文 and English side by side
//   4. the tenant's rent list called a payment that was made, a few days late, 「逾期」 (the landlord saw 「已付 · 迟付」)
//   6. the agent rail listed 日历 and 佣金 — two one-line empty pages, one of them promising commission settlement
//   8. a verified agent was told to go and get verified
//   9. the landlord lease page said rent-increase notices are sent with one click (they are not sent by Stayloop at all)
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { pickCardLang } from '@/lib/ui/cardLang'
import { buildOverdueProposal } from '@/lib/household/rentReminders'
import { RENT_STATE_LABEL, isRentOutstanding } from '@/lib/matters/states'
import { RAIL_BY_ROLE } from '@/components/workspace/rail'
import { buildRecommendations, recommendationsForAgent } from '@/lib/agent/orchestrator'

// The rail module pulls in the browser Supabase client through its unread-count hook.
vi.mock('@/lib/supabase', () => ({ supabase: {}, getSupabaseBrowser: () => ({}) }))
vi.mock('@/lib/messages/unread', () => ({ useUnreadMessages: () => 0 }))

const read = (p: string) => readFileSync(p, 'utf8')

describe('3 · stored 「中文 / English」 text shows one language on screen', () => {
  it('picks the half for the UI language', () => {
    const t = '租金逾期 8 天 · Unit 1 · 100 Test Ave · 2026-11-01 / Rent 8 days overdue · Unit 1 · 100 Test Ave · 2026-11-01'
    expect(pickCardLang(t, 'zh')).toBe('租金逾期 8 天 · Unit 1 · 100 Test Ave · 2026-11-01')
    expect(pickCardLang(t, 'en')).toBe('Rent 8 days overdue · Unit 1 · 100 Test Ave · 2026-11-01')
    expect(pickCardLang('租金提醒：张三 · 2026-12-01 应付 / Rent reminder', 'en')).toBe('Rent reminder')
  })
  it('a slash inside either half does not split in the wrong place', () => {
    const t = '去看每份的 N1 / N2 期限 / Check the N1 / N2 deadline on each lease'
    expect(pickCardLang(t, 'zh')).toBe('去看每份的 N1 / N2 期限')
    expect(pickCardLang(t, 'en')).toBe('Check the N1 / N2 deadline on each lease')
  })
  it('anything that is not a clean pair comes back unchanged', () => {
    for (const s of ['供暖 / 空调', 'Heating / cooling', '厨房水槽漏水', 'No Hot Water', '租金 / 2026', '']) {
      expect(pickCardLang(s, 'zh')).toBe(s)
      expect(pickCardLang(s, 'en')).toBe(s)
    }
    expect(pickCardLang(null, 'zh')).toBe('')
    // English half that carries Chinese (a name): no clean boundary, so nothing is cut
    const mixed = '租金逾期 3 天 · 王府公寓 / Rent 3 days overdue · 王府公寓'
    expect(pickCardLang(mixed, 'en')).toBe(mixed)
  })
  it('the overdue-rent card splits cleanly, with or without a unit label', () => {
    const meta = { household_id: 'h', due_date: '2026-11-01', amount: 2450, days_late: 8, missed_count: 1, arrears_total: 2450, province: 'ON', late_count_6m: 0, persistent: false, n4_earliest_hand: '2026-11-16', n4_earliest_mail: '2026-11-21' }
    for (const unit_label of ['Unit 1 · 100 Test Ave', null]) {
      const p = buildOverdueProposal('u', { ...meta, unit_label } as unknown as Parameters<typeof buildOverdueProposal>[1])
      const zh = pickCardLang(p.title, 'zh'); const en = pickCardLang(p.title, 'en')
      expect(zh).toMatch(/^租金逾期 8 天 · /)
      expect(zh).not.toMatch(/Rent 8 days|your unit/)
      expect(en).toMatch(/^Rent 8 days overdue · /)
      expect(en).not.toMatch(/[一-鿿]/)
      const sz = pickCardLang(p.summary, 'zh'); const se = pickCardLang(p.summary, 'en')
      expect(sz).toContain('批准 = 知悉')
      expect(sz).not.toContain('Approving only records')
      expect(se).toContain('Approving only records')
      expect(se).not.toMatch(/[一-鿿]/)
    }
  })
  it('the card, the ideas line and the two "approved" rows all go through it', () => {
    const card = read('components/agent/ApprovalActionCard.tsx')
    expect(card).toContain("{mask(pickCardLang(action.title, zh ? 'zh' : 'en'))}</h3>")
    expect(card).toContain("{mask(pickCardLang(action.summary, zh ? 'zh' : 'en'))}</p>")
    expect(card).not.toMatch(/\{mask\(action\.(title|summary)\)\}/)
    expect(read('lib/agent/ideas.ts')).toContain("${pickCardLang(pending[0].title, 'zh')}")
    expect(read('components/mobile/RolePages.tsx')).toContain("{pickCardLang(title, zh ? 'zh' : 'en')}")
    expect(read('components/agent/AgentChat.tsx')).toContain("{pickCardLang(title, zh ? 'zh' : 'en')}")
  })
  it('the three agent banners on the screening page pick a language instead of printing both', () => {
    const s = read('app/screening/app/page.tsx')
    for (const id of ['screening-delegation"', 'screening-delegation-invalid"', 'screening-agent-direct"']) {
      const i = s.indexOf(`data-testid="${id}`)
      expect(i, id).toBeGreaterThan(0)
      const line = s.slice(i, s.indexOf('</div>', i))
      expect(line, id).toContain("lang === 'zh' ?")
      expect(line, id).not.toMatch(/[。托] \/ [A-Zr]/)
    }
  })
})

describe('4 · a payment recorded late is paid, on both sides', () => {
  it('the tenant label matches the landlord ledger and is no longer red', () => {
    expect(RENT_STATE_LABEL.late).toMatchObject({ zh: '已付 · 迟付', en: 'Paid late', tone: 'ok' })
    expect(read('components/landlord/RentLedger.tsx')).toContain("paid_late: { zh: '已付 · 迟付', en: 'Paid late', tone: 'ok' }")
    expect(isRentOutstanding({ status: 'late' })).toBe(false)
    const mine = read('components/tenant/MyRent.tsx')
    expect(mine).toContain("r.status === 'paid' || r.status === 'late' ? 'bg-emerald-50 text-emerald-700'")
    expect(mine).not.toContain("r.status === 'late' ? 'bg-red-50")
    // a period nobody recorded and past its date is still 逾期
    expect(mine).toContain("'逾期 · 还没有记录'")
  })
})

describe('6 · the agent rail lists only pages with something on them', () => {
  it('no 日历 / 佣金 in the rail or the related-pages card; the pages keep a truthful empty state', () => {
    const keys = RAIL_BY_ROLE.agent.map((x) => x.key)
    expect(keys).not.toContain('cal')
    expect(keys).not.toContain('earn')
    expect(keys).toEqual(['msgs', 'find', 'clients', 'tasks', 'checklist', 'profile', 'audit'])
    const related = read('components/agent/RelatedPagesCard.tsx')
    expect(related).not.toMatch(/\/agent\/(calendar|earnings)/)
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toContain('佣金记录还没有上线。Stayloop 不收佣金，也不替任何人结算佣金。')
    expect(shell).toContain('日历还没有上线，这一页目前只有产品演示。')
    expect(shell).not.toMatch(/会在这里对账|帮你安排第一场/)
  })
})

describe('8 · the verification idea follows the registration', () => {
  it('verified → 认证与公开主页; not verified → RECO 注册核验; unknown → neither', () => {
    const all = buildRecommendations('agent', {} as Parameters<typeof buildRecommendations>[1])
    const ids = (v: boolean | null) => recommendationsForAgent(all, v).map((r) => r.id)
    expect(ids(true)).toEqual(['tasks', 'clients', 'profile'])
    expect(ids(false)).toEqual(['tasks', 'clients', 'verify'])
    expect(ids(null)).toEqual(['tasks', 'clients'])
    const pages = read('components/mobile/RolePages.tsx')
    expect(pages).toContain('recommendationsForAgent(data.recommendations, !live ? false : hats.loading ? null : isRegistrationLive(hats.agent))')
    expect(pages).not.toContain('RecommendationDeck items={data.recommendations}')
  })
})

describe('9 · the lease page says what it does', () => {
  it('no one-click sending of a rent-increase notice', () => {
    const p = read('app/landlord/leases/page.tsx')
    expect(p).toContain('续约提醒与涨租日期核对')
    expect(p).not.toMatch(/一键发送|one-click renewal/)
  })
})
