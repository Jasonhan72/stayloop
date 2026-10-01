// Sweep 2026-10-01 · integration pass B2. The fix pass made the executor, the
// marketplace and the card sweeps refuse more honestly — each refusal carries a
// reason code. These guards make sure every code reaches people as words:
// the approval card, the stalled row, the decision notice, the showing modal,
// the delegation and lease-signing pages, the audit log and the lease list.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

let mockLang: 'zh' | 'en' = 'zh'
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: mockLang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } }, getSupabaseBrowser: () => ({}) }))
vi.mock('@/components/agent/WorkOrderInline', () => ({ default: () => null }))

import ApprovalActionCard, { StalledActionRow } from '../components/agent/ApprovalActionCard'
import { showingErrorText, showingUndeliveredText } from '../components/ShowingRequestModal'
import { cardSitePath, executionReasonText } from '../lib/agent/chatCopy'
import { auditActionLabel } from '../lib/agent/ideas'
import { activityIcon, buildActivity } from '../lib/agent/activityLog'
import { noticeReasonText } from '../app/landlord/applicants/noticeState'
import type { PendingAction } from '../lib/agent/types'

const read = (p: string) => readFileSync(p, 'utf8')
const textOf = (n: TestRenderer.ReactTestInstance): string => n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('')
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const isFallback = (code: string) => {
  const zh = executionReasonText(code, true)
  const en = executionReasonText(code, false)
  return zh.startsWith('执行没有完成') || en.startsWith('it did not complete')
}

describe('1 · every execution reason the server emits has words', () => {
  it('the codes named in the fix pass are all mapped', () => {
    for (const c of [
      'lease_not_sendable', 'stale_approval', 'already_notified', 'invite_id missing', 'lease has no end date',
      'this ticket already has an open work order', 'work_order_moved_on', 'application_withdrawn', 'already_executed',
      'no_candidate_choose_on_ticket', 'work_order_already_answered', 'ticket_closed', 'quote_changed', 'invite_closed',
      'lease_ended', 'lease_superseded', 'tenant_leaving', 'past_n1_deadline', 'decision_changed', 'arrears_changed',
      'past_due_date', 'period_paid', 'listing_inactive', 'no_candidate', 'quote_expired', 'superseded',
      'ticket_status_changed', 'dispatched', 'decided_on_work_order', 'work_order_closed', 'expired', 'undo_failed',
      'no_renewal_option_chosen', 'state changed, retry', 'invite not found or not yours', 'lease_no_terms', 'not_from_quoted',
    ]) expect(isFallback(c), c).toBe(false)
  })

  it('scanning the executor, the marketplace, sendLease and the 20261001 migrations finds no unmapped code', () => {
    const codes = new Set<string>()
    const grab = (src: string, re: RegExp) => { for (const m of src.matchAll(re)) for (const g of m.slice(1)) if (g) codes.add(g) }
    for (const f of ['app/api/agent/execute/route.ts', 'lib/marketplace/server.ts', 'lib/lease/sendLease.ts']) {
      const src = read(f)
      grab(src, /\breason: '([^'\n]+)'/g)
      grab(src, /\berror: '([^'\n]+)'/g)
    }
    grab(read('app/api/agent/execute/route.ts'), /spentWorkOrderReason\([^)]*'(work_order_[a-z_]+)'\)/g)
    for (const f of readdirSync('supabase/migrations').filter((n) => n.startsWith('20261001_') && n.endsWith('.sql'))) {
      const src = read(`supabase/migrations/${f}`)
      grab(src, /'reason', '([a-z_]+)'/g)
      grab(src, /then '([a-z_]+)' else '([a-z_]+)' end, 'ticket_status'/g)
    }
    // Request-shape errors only a broken client sends, and the provider-side payload text: not card reasons.
    const notCardReasons = new Set(['invalid JSON body', 'action_id required'])
    const unmapped = [...codes].filter((c) => /^[\x20-\x7e]+$/.test(c) && !notCardReasons.has(c) && isFallback(c))
    expect(codes.size).toBeGreaterThan(40)
    expect(unmapped).toEqual([])
  })

  it('the generic fallback still shows an unknown code, never a guess', () => {
    expect(executionReasonText('weird_code_x', true)).toContain('weird_code_x')
    expect(executionReasonText('weird_code_x', false)).toContain('weird_code_x')
    expect(executionReasonText('superseded', true)).not.toMatch(/派单建议取代了这张卡片$/) // generic: dispatch cards and payment plans both use it
  })
})

describe('2a · past the N1 deadline only option B is blocked', () => {
  const LEASE_CARD: PendingAction = {
    id: '11111111-2222-3333-4444-555555555555', user_id: 'u', role: 'landlord', action_type: 'send_renewal_letter',
    title: '续约函：Unit 3', summary: '两个方案', recipient_label: 'Mia', data_scope: [], excluded_data: [], risk_level: 'low',
    status: 'pending', requires_approval: true, metadata: { lease_id: 'L', current_rent: 2800, guideline_rent: 2858.8, guideline_pct: 2.1 },
  } as unknown as PendingAction
  afterEach(() => { vi.unstubAllGlobals(); mockLang = 'zh' })

  it('a B preview refused with blocks_option:B keeps A approvable, shows the N1 line, and a later A preview does not unlock B', async () => {
    const calls: { option?: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { option?: string }
      calls.push(body)
      if (body.option === 'B') return new Response(JSON.stringify({ preview: null, reason: 'past_n1_deadline', n1_deadline: '2026-09-02', blocks_option: 'B' }), { status: 409 })
      return new Response(JSON.stringify({ preview: { subject: 'Lease renewal offer', body: 'Hi', to: 'Mia' } }), { status: 200 })
    }))
    const onDecide = vi.fn()
    let r!: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(React.createElement(ApprovalActionCard, { action: LEASE_CARD, onDecide })) })
    const previewB = r.root.findAll((n) => n.type === 'button' && textOf(n).includes('预览正文（+2.1%）'))[0]
    await act(async () => { previewB.props.onClick() })
    await flush()
    const approveA = () => r.root.find((n) => n.type === 'button' && n.props['data-option'] === 'A')
    const approveB = () => r.root.find((n) => n.type === 'button' && n.props['data-option'] === 'B')
    expect(approveA().props.disabled).toBe(false)
    expect(approveB().props.disabled).toBe(true)
    const block = r.root.find((n) => n.props['data-testid'] === 'card-option-blocked')
    expect(textOf(block)).toContain('2026-09-02')
    expect(textOf(block)).toContain('方案 A（不涨续约）仍可以批准')
    expect(r.root.findAll((n) => n.props['data-testid'] === 'card-preview-error')).toHaveLength(0)
    // The B preview button is gone; A can still be previewed.
    expect(r.root.findAll((n) => n.type === 'button' && textOf(n).includes('预览正文（+2.1%）'))).toHaveLength(0)
    const previewA = r.root.find((n) => n.type === 'button' && textOf(n).includes('预览正文（不涨）'))
    await act(async () => { previewA.props.onClick() })
    await flush()
    expect(calls.map((c) => c.option)).toEqual(['B', 'A'])
    expect(approveB().props.disabled).toBe(true)
    expect(approveA().props.disabled).toBe(false)
    await act(async () => { approveA().props.onClick() })
    expect(onDecide).toHaveBeenCalledWith(LEASE_CARD.id, 'approved', 'A')
  })

  it('any other blocking preview error still blocks the whole card', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ preview: null, reason: 'lease has no tenant email on file' }), { status: 422 })))
    let r!: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(React.createElement(ApprovalActionCard, { action: LEASE_CARD, onDecide: () => undefined })) })
    const previewA = r.root.find((n) => n.type === 'button' && textOf(n).includes('预览正文（不涨）'))
    await act(async () => { previewA.props.onClick() })
    await flush()
    expect(r.root.find((n) => n.props['data-option'] === 'A' && n.type === 'button').props.disabled).toBe(true)
    expect(r.root.find((n) => n.props['data-option'] === 'B' && n.type === 'button').props.disabled).toBe(true)
    expect(r.root.findAll((n) => n.props['data-testid'] === 'card-option-blocked')).toHaveLength(0)
  })

  it('a stalled letter refused for past_n1_deadline offers only option A — never re-runs B', async () => {
    const stalled = { ...LEASE_CARD, status: 'approved', approved_option: 'B', execution_result: { ok: false, reason: 'past_n1_deadline' } } as unknown as PendingAction
    const onDecide = vi.fn()
    let r!: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(React.createElement(StalledActionRow, { action: stalled, onDecide })) })
    const runs = r.root.findAll((n) => n.type === 'button' && n.props['data-run-now'] !== undefined)
    expect(runs.map((b) => b.props['data-run-now'])).toEqual(['A'])
    expect(textOf(r.root.find((n) => n.props['data-stalled-card'] !== undefined))).toContain('N1')
    await act(async () => { runs[0].props.onClick() })
    expect(onDecide).toHaveBeenCalledWith(stalled.id, 'approved', 'A')
  })
})

describe('2b · re-list prompts link to the listing — same-origin paths only', () => {
  it('cardSitePath accepts site paths and rejects anything that leaves the site', () => {
    expect(cardSitePath('/dashboard/listings/abc/edit?relist=1')).toBe('/dashboard/listings/abc/edit?relist=1')
    expect(cardSitePath('/dashboard')).toBe('/dashboard')
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', 'dashboard', '/\t/evil.example', '/x y', '', null, 42]) {
      expect(cardSitePath(bad), String(bad)).toBeNull()
    }
  })

  const relist = (href: unknown): PendingAction => ({
    id: '21111111-2222-3333-4444-555555555555', user_id: 'u', role: 'landlord', action_type: 'relist_prompt', title: '重新挂牌', summary: '租约快到期',
    recipient_label: null, data_scope: [], excluded_data: [], risk_level: 'low', status: 'pending', requires_approval: true, metadata: { href },
  } as unknown as PendingAction)
  it('renders 「打开这套房源」 for a listing path, 「去房源管理」 for the bare dashboard, nothing for a foreign href', async () => {
    const linkOf = async (href: unknown) => {
      let r!: TestRenderer.ReactTestRenderer
      await act(async () => { r = TestRenderer.create(React.createElement(ApprovalActionCard, { action: relist(href), onDecide: () => undefined })) })
      return r.root.findAll((n) => n.type === 'a' && n.props['data-testid'] === 'card-relist-link')
    }
    const a = await linkOf('/dashboard/listings/L1/edit?relist=1')
    expect(a).toHaveLength(1)
    expect(a[0].props.href).toBe('/dashboard/listings/L1/edit?relist=1')
    expect(textOf(a[0])).toContain('打开这套房源')
    const d = await linkOf('/dashboard')
    expect(textOf(d[0])).toContain('去房源管理')
    expect(await linkOf('//evil.example/x')).toHaveLength(0)
    expect(await linkOf('https://evil.example')).toHaveLength(0)
  })
})

describe('3 · the showing modal never shows a raw route code', () => {
  it('listing_inactive and the other route errors read as sentences', () => {
    expect(showingErrorText('listing_inactive', 409, true)).toBe('这套房源已下架，请求没有发出。')
    expect(showingErrorText('listing_inactive', 409, false)).toBe('This listing is off the market — your request was not sent.')
    for (const c of ['own_listing', 'rate_limited', 'sign_in_required', 'message required', 'listing_id required', 'tenant profile unavailable', 'invalid JSON body', 'duplicate key value violates unique constraint']) {
      const zh = showingErrorText(c, 400, true)
      expect(zh, c).not.toContain(c)
      expect(showingErrorText(c, 400, false), c).not.toContain(c)
    }
    // Every error code the route returns is handled by name (or falls to the generic sentence).
    const route = read('app/api/showing-intent/route.ts')
    const modal = read('components/ShowingRequestModal.tsx')
    for (const m of route.matchAll(/error: '([^']+)'/g)) if (m[1] !== 'invalid JSON body') expect(modal, m[1]).toContain(`case '${m[1]}'`)
    expect(modal).toContain("if (j.error === 'listing_inactive') setOffMarket(true)")
  })
  it('a recorded-but-undelivered request says which case it was', () => {
    expect(showingUndeliveredText('no_landlord_account', true)).toContain('Realtor.ca')
    expect(showingUndeliveredText('action_insert_failed', true)).toContain('没能提醒房东')
    expect(showingUndeliveredText('action_insert_failed', true)).not.toContain('Realtor.ca')
    expect(showingUndeliveredText('listing_not_found', false)).toContain('could not be found')
  })
})

describe('4 · new audit events have labels', () => {
  it('the fix pass events read as sentences, in both languages', () => {
    for (const a of ['work_order_dispatch_no_candidate', 'delegation_link_resent', 'application_decision_drafted', 'approval_abandoned', 'household_lease_attached_from_esign', 'household_import_corrected']) {
      expect(auditActionLabel(a, 'zh'), a).not.toBe(a.replace(/_/g, ' '))
      expect(auditActionLabel(a, 'en'), a).not.toBe(a.replace(/_/g, ' '))
    }
    expect(auditActionLabel('approval_abandoned', 'zh')).toContain('什么也没有发出')
  })
  it('a "nothing happened" event is not drawn or counted as done', () => {
    expect(activityIcon('work_order_dispatch_no_candidate')).toBe('⚠')
    expect(activityIcon('approval_abandoned')).toBe('↩')
    const items = buildActivity(
      [{ id: 't1', role: 'landlord', title: 'x', summary: null, turn_count: 1, last_message_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' } as never],
      [
        { id: 'e1', action: 'work_order_dispatch_no_candidate', actor_type: 'system', created_at: '2026-10-01T10:01:00Z', metadata: { thread_id: 't1' } },
        { id: 'e2', action: 'approval_abandoned', actor_type: 'user', created_at: '2026-10-01T10:02:00Z', metadata: { thread_id: 't1' } },
      ],
    )
    const t = items.find((i) => i.kind === 'thread') as { executed: number; undone: number }
    expect(t.executed).toBe(0)
    expect(t.undone).toBe(1)
  })
})

describe('5 · a client with no email points at the client table', () => {
  it('the disabled message button comes with a link to /agent/clients#client-book', () => {
    const s = read('components/agent/ClientTasks.tsx')
    expect(s).toContain("disabledReason={zh ? '先补邮箱才能发消息' : 'Add an email to message'}")
    expect(s).toContain('href="/agent/clients#client-book" data-testid="client-task-add-email"')
    expect(read('components/agent/ClientBook.tsx')).toContain('id="client-book"')
  })
})

describe('6 · the delegation confirm page words every refusal', () => {
  it('client_email_changed and the other codes are mapped; the raw code is never shown', () => {
    const page = read('app/delegate/[token]/page.tsx')
    const route = read('app/api/delegations/confirm/route.ts')
    for (const m of route.matchAll(/error: '([^']+)'/g)) if (m[1] !== 'invalid JSON body') expect(page, m[1]).toContain(`'${m[1]}'`)
    expect(page).toContain("c.startsWith('status_')") // error: `status_${status}`
    expect(page).toContain('setErr(confirmErrorText(j.error, res.status, zh, j.principal_email_masked))')
    expect(page).not.toContain('j.error || `HTTP ${res.status}`')
    expect(page).toContain('请让经纪按新邮箱重新发起委托')
  })
})

describe('7 · the tenant signing page words the sign route’s refusals', () => {
  it('lease_no_terms / lease_not_signable / ended are mapped; a stale page reloads and the error stays visible', () => {
    const page = read('app/lease/sign/[token]/page.tsx')
    const route = read('app/api/lease/sign/route.ts')
    expect(page).toContain("import { leaseActionErrorText, leaseErrorNeedsReload } from '@/lib/lease/leaseState'")
    for (const c of ['lease_no_terms', 'lease_not_signable', 'lease has ended', 'lease not found']) {
      expect(route, c).toContain(`'${c}'`)
      expect(page, c).toContain(`'${c}'`)
    }
    expect(page).toContain('setSignErr(signErrorText(j.error, zh))')
    expect(page).not.toContain('setSignErr(j.error ||')
    expect(page).toContain('if (leaseErrorNeedsReload(j.error)) await load()')
    expect(page).toContain('{!canSign && signErr && (')
    // The tenant is never told to draft a lease (that is the landlord's action).
    const fn = page.slice(page.indexOf('function signErrorText'), page.indexOf('type ViewLease'))
    expect(fn).not.toContain('起草')
  })
})

describe('8 · the decision notice words every reason its card can get', () => {
  it('application_withdrawn and the other executor reasons read as sentences; the fallback format is unchanged', () => {
    for (const r of ['application_withdrawn', 'application_id missing', 'decision missing', 'send failed', 'state changed, retry', 'no_session', 'action is rejected, not approved']) {
      expect(noticeReasonText(r, true), r).not.toContain(`（${r}）`)
      expect(noticeReasonText(r, false), r).not.toContain(`(${r})`)
    }
    expect(noticeReasonText('application_withdrawn', true)).toContain('撤回')
    expect(noticeReasonText('weird', false)).toBe('The notice was not sent (weird).')
  })
})

describe('9 · 「已在工作台准备方案」 only when a renewal card is pending', () => {
  it('the lease list reads the landlord’s own pending send_renewal_letter cards and says so only for those leases', () => {
    const s = read('app/landlord/leases/page.tsx')
    expect(s).toContain(".from('agent_pending_actions').select('metadata').eq('user_id', landlord.authId).eq('action_type', 'send_renewal_letter').eq('status', 'pending')")
    expect(s).toContain('cardLeases.has(row.id)')
    // The claim sits in the renewalCard branch only; an open window without a card says only that.
    const claim = s.indexOf('已在工作台准备方案`')
    expect(s.slice(claim - 120, claim)).toContain(': renewalCard')
    expect(s).toContain("? { zh: '续约窗口已开', en: 'Renewal window open' }")
    // The rail notice that says options are ready shows only when a lease has a card.
    expect(s).toContain('liveMode && rows.some((l) => l.renewalCard) ? (')
    expect(s).not.toContain("active.some((l) => l.nextRenewal.zh !== '—')")
  })
})
