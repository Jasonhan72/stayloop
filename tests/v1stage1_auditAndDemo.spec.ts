// V1.0 阶段 1 · 甲 #6（审计分开「打开页面」与「做了事」）+ 乙 #12（删掉与事实相反的示范段、首页租客示例不再找房）
// 讨论稿 design/v1-scope-and-roadmap-2026-10.md 3.1；研究稿 tenant-tools A2-11 / 缺口 11、12，landlord-retention C1-6 / 缺口 6。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isAuditRow, isBookkeepingEvent, isOutcomeEvent, isPageOpenEvent, NOT_AN_OUTCOME, PAGE_OPEN_ACTIONS } from '../lib/audit/eventKinds'
import { HERO_EXAMPLES } from '../components/home/HeroComposer'

const read = (p: string) => readFileSync(p, 'utf8')

describe('甲 #6 · lib/audit/eventKinds classifies audit rows in one place', () => {
  it('page opens: every *_session_started, listing views and searches', () => {
    for (const a of ['tenant_agent_session_started', 'landlord_agent_session_started', 'agent_agent_session_started', 'listing_viewed', 'listings_searched']) {
      expect(isPageOpenEvent(a), a).toBe(true)
      expect(isOutcomeEvent(a), a).toBe(false)
    }
    expect(PAGE_OPEN_ACTIONS).toEqual(['listing_viewed', 'listings_searched'])
  })
  it('things that were done are not page opens', () => {
    for (const a of ['send_decision_executed', 'executed_send_decision', 'executed_maintenance_request', 'pending_action_approved', 'hat_activated', 'application_file_viewed', 'thread_attachment_viewed', 'terms_accepted', 'delegation_confirmed', 'work_order_auto_dispatched']) {
      expect(isPageOpenEvent(a), a).toBe(false)
    }
    expect(isPageOpenEvent('send_decision_executed')).toBe(false)
    expect(isPageOpenEvent(null)).toBe(false)
    expect(isPageOpenEvent('')).toBe(false)
  })
  it('outcomes keep the panel’s existing rules (executed_* and system dispatches; acknowledgements excluded)', () => {
    expect(isOutcomeEvent('executed_send_decision')).toBe(true)
    expect(isOutcomeEvent('work_order_auto_dispatched')).toBe(true)
    for (const a of NOT_AN_OUTCOME) expect(isOutcomeEvent(a), a).toBe(false)
    expect(isOutcomeEvent('work_order_dispatch_no_candidate')).toBe(false)
    expect(isOutcomeEvent('pending_action_approved')).toBe(false)
  })
  it('chat turns and reflection are bookkeeping, never listed; page opens only when asked for', () => {
    for (const a of ['tenant_agent_turn', 'landlord_agent_turn', 'turn', 'reflection']) {
      expect(isBookkeepingEvent(a), a).toBe(true)
      expect(isAuditRow(a, true), a).toBe(false)
    }
    expect(isAuditRow('tenant_agent_session_started')).toBe(false)
    expect(isAuditRow('tenant_agent_session_started', true)).toBe(true)
    expect(isAuditRow('executed_send_lease')).toBe(true)
    expect(isAuditRow('hat_activated')).toBe(true)
  })
  it('the audit page hides browsing by default behind a 「显示浏览记录」 toggle, excluding it in SQL', () => {
    const a = read('components/audit/LiveAuditLog.tsx')
    expect(a).toContain("from '@/lib/audit/eventKinds'")
    expect(a).toContain('const [showViews, setShowViews] = useState(false)')
    expect(a).toContain("q.not('action', 'like', `%${PAGE_OPEN_SUFFIX}`).not('action', 'in', `(${PAGE_OPEN_ACTIONS.join(',')})`)")
    expect(a).toContain('data-testid="audit-show-views"')
    expect(a).toContain('显示浏览记录')
    expect(a).not.toMatch(/const NOT_AUDIT =/)
  })
  it('the panel’s 「最近替你办完」 reads the outcome lists from eventKinds (one source)', () => {
    const h = read('lib/agent/useActivityLog.ts')
    expect(h).toContain("import { isOutcomeAction, NOT_AN_OUTCOME, OUTCOME_EVENTS, outcomeHat } from '@/lib/audit/eventKinds'")
    expect(h).not.toMatch(/import \{[^}]*NOT_AN_OUTCOME[^}]*\} from '\.\/activityLog'/)
  })
  it('the admin lifecycle stats count pending-action rows, not audit rows (nothing to exclude there)', () => {
    const src = read('components/admin/LifecycleStats.tsx')
    expect(src).toContain('admin_lifecycle_stats')
    expect(src).not.toContain('agent_audit_events')
  })
})

describe('乙 #12 · no sample contradicts 「不经手资金」 (RTA s.105–106)', () => {
  it('/tenant/move-in has no Stripe escrow; it has a deposit-receipt facts card instead', () => {
    const src = read('app/tenant/move-in/page.tsx')
    for (const w of ['Stripe', 'escrow', '托管', '立即支付', 'ESCROW']) expect(src, w).not.toContain(w)
    expect(src).toContain('data-testid="deposit-receipt-card"')
    expect(src).toContain('RTA s.105–106')
    expect(src).toContain('RTA s.109')
    expect(src).toContain("import { guidelineFor } from '@/lib/ontario/rules'") // interest rate = that year's guideline, from the single source
    expect(src).toContain("from '@/lib/provinces/lease'") // the live checklist still keys the province off the household
  })
  it('/tenant/payments has no pay-now button, no deposit escrow stat and no debit rail; the real entries are the tenancy thread and /h/<id>?tab=rent', () => {
    const src = read('app/tenant/payments/page.tsx')
    for (const w of ['Stripe', 'escrow', '托管', '立即支付', 'Pay now', '自动扣款', 'auto-debit', 'Flinks', 'RBC ****']) expect(src, w).not.toContain(w)
    expect(src).toContain("import MessageButton from '@/components/messages/MessageButton'")
    expect(src).toContain("useFacts('tenant')")
    expect(src).toContain('href={`/h/${h.id}?tab=rent`}')
    expect(src).toContain("target={{ kind: 'tenancy', ref: h.id,")
    expect(src).toContain('href="/leases/import"')
    expect(src).toContain('liveSlot={<MyRent />}')
  })
  it('the two tenant search examples on the home page became rule questions the preview can answer without listings', () => {
    const tenant = HERO_EXAMPLES.filter((x) => x.role === 'tenant')
    expect(tenant.length).toBeGreaterThanOrEqual(5)
    // No example anywhere asks the AI Agent to find a home (the preview has no listing data).
    for (const x of HERO_EXAMPLES) {
      expect(x.ask.zh, x.ask.zh).not.toMatch(/找.{0,4}房|找房/)
      expect(x.ask.en, x.ask.en).not.toMatch(/find me/i)
    }
    // Tenant examples carry no neighbourhood, budget or bedroom count — those are search prompts in disguise.
    for (const x of tenant) {
      expect(x.ask.zh, x.ask.zh).not.toMatch(/房源|预算|King West|Liberty Village|一房|两房/)
      expect(x.ask.en, x.ask.en).not.toMatch(/bedrooms? in|up to \$|under \$|King West|Liberty Village/i)
    }
    expect(HERO_EXAMPLES[0].role).toBe('tenant')
    expect(HERO_EXAMPLES[0].ask.zh).toContain('押金')
    expect(HERO_EXAMPLES[9].role).toBe('tenant')
    expect(HERO_EXAMPLES[9].ask.zh).toContain('退租通知')
  })
})
