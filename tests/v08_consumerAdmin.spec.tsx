// V0.8 · 消费者索取档案与争议更正 — G21 guard (2026-10-17):
//  · /admin/consumer-requests: one queue (requests + disputes), due_at countdown (overdue red, ≤8 h amber),
//    every action an inline two-step confirm, resolve_dispute call shape and the "已通知 N 位收件人" result.
//  · /screening/app: the s.11(3) attestation checkbox gates NEW screenings only and stamps the new row
//    with notice_confirmed_how='landlord_attested'; the existing insert / delegation_id lines are untouched.
//  · /settings mounts LandlordPhoneCard for the landlord hat; /admin shows the queue block.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const calls = vi.hoisted(() => ({ posts: [] as unknown[] }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header', { 'data-testid': 'site-header' }) }))
vi.mock('@/lib/useAdmin', () => ({ useAdmin: () => ({ loading: false, role: 'admin' }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }, getSupabaseBrowser: () => ({ auth: {} }) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: 'zh', t: (k: string) => k, setLang: () => {}, currency: 'CAD', setCurrency: () => {} }) }))

import AdminConsumerRequestsPage from '../app/admin/consumer-requests/page'

const H = 3_600_000
const data = () => ({
  requests: [
    {
      id: 'r1', email: 'applicant@example.com', name: 'Mia Chen', delivery: 'electronic', status: 'needs_review',
      matched_screening_ids: [], candidate_screening_ids: ['s1', 's2'], due_at: new Date(Date.now() - 3 * H).toISOString(), created_at: '2026-10-15T10:00:00Z',
      screenings: [{ id: 's1', created_at: '2026-10-01T00:00:00Z', landlord_name: 'Sarah Wang', property: 'Unit 1207 · 100 King St W' }, { id: 's2', created_at: '2026-09-20T00:00:00Z', landlord_name: 'Other', property: '1 Elsewhere Rd' }],
    },
    {
      id: 'r2', email: 'mail-person@example.com', name: 'Leo Q', delivery: 'mail', mail_address: '1 Main St', status: 'matched',
      matched_screening_ids: ['s3'], candidate_screening_ids: ['s3'], due_at: new Date(Date.now() + 4 * H).toISOString(), created_at: '2026-10-16T10:00:00Z',
      matched: [{ id: 's3', created_at: '2026-08-01T00:00:00Z', landlord_name: 'Kevin Tran', property: '2 Side St' }],
    },
  ],
  disputes: [
    { id: 'd1', request_id: 'r2', screening_id: 's3', email: 'mail-person@example.com', item_kind: 'public_record', item_ref: 'ltb:1', item_label: 'LTB 判令 · 同名命中', statement: '那不是我，我从没住过那个地址。', status: 'open', created_at: '2026-10-16T11:00:00Z' },
  ],
})

function mockFetch() {
  calls.posts = []
  const g = globalThis as { fetch?: unknown }
  g.fetch = vi.fn(async (_url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') { calls.posts.push(JSON.parse(init.body || '{}')); return { ok: true, json: async () => ({ ok: true, notified: 2 }) } }
    return { ok: true, json: async () => data() }
  })
}
const text = (n: TestRenderer.ReactTestInstance | string): string => typeof n === 'string' ? n : n.children.map(text).join('')
const byId = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findByProps({ 'data-testid': id })
const allById = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findAllByProps({ 'data-testid': id })
const click = async (n: TestRenderer.ReactTestInstance) => { await act(async () => { n.props.onClick() }) }

describe('/admin/consumer-requests queue', () => {
  let r!: TestRenderer.ReactTestRenderer
  beforeEach(async () => {
    mockFetch()
    await act(async () => { r = TestRenderer.create(<AdminConsumerRequestsPage />) })
  })

  it('loads with the admin JWT, shows the statutory facts line, masks emails and counts open items', () => {
    const f = (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch
    expect(f.mock.calls[0][0]).toBe('/api/admin/consumer')
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    expect(text(byId(r, 'consumer-facts'))).toContain('s.12：电子方式即时、邮寄 / 电话 2 个工作日')
    expect(text(byId(r, 'consumer-facts'))).toContain('s.13：争议须在合理时间内核实并通知 60 天内收件人')
    const emails = allById(r, 'request-email').map(text)
    expect(emails[0]).toContain('ap***@example.com')
    expect(emails[0]).not.toContain('applicant@')
    expect(text(byId(r, 'queue-counts'))).toBe('待办 3')
    expect(allById(r, 'consumer-request')).toHaveLength(2)
    expect(allById(r, 'consumer-dispute')).toHaveLength(1)
  })

  it('countdown: overdue is red, within 8 hours is amber; candidate screenings show date · landlord · property', () => {
    const dues = allById(r, 'request-due')
    expect(dues[0].props['data-tone']).toBe('overdue')
    expect(text(dues[0])).toMatch(/已逾期 \d+ 小时/)
    expect(dues[0].props.style.color).toBe('#B91C1C')
    expect(dues[1].props['data-tone']).toBe('soon')
    expect(text(dues[1])).toMatch(/还剩 \d+ 小时/)
    expect(dues[1].props.style.color).toBe('#B45309')
    const row = allById(r, 'consumer-request')[0]
    expect(text(row)).toContain('2026-10-01 · Sarah Wang · Unit 1207 · 100 King St W')
    expect(text(row)).toContain('交付方式: 电子')
  })

  it('confirm match is a two-step inline confirm over the ticked candidates (no window.confirm)', async () => {
    const row = allById(r, 'consumer-request')[0]
    const btn = () => row.findByProps({ 'data-testid': 'confirm-match' })
    expect(btn().props.disabled).toBe(true)
    const picks = row.findAllByProps({ 'data-testid': 'candidate-pick' })
    await act(async () => { picks[0].props.onChange({ target: { checked: true } }) })
    expect(btn().props.disabled).toBe(false)
    await click(btn())
    expect(calls.posts).toHaveLength(0)
    const confirm = byId(r, 'confirm-match-confirm')
    expect(text(confirm)).toContain('把这 1 条筛查记为本人的档案？')
    await click(confirm.findAll((n) => n.type === 'button' && text(n) === '取消')[0])
    expect(allById(r, 'confirm-match-confirm')).toHaveLength(0)
    await click(btn())
    await click(byId(r, 'confirm-match-confirm').findAll((n) => n.type === 'button' && text(n) === '确认匹配')[0])
    expect(calls.posts).toEqual([{ action: 'confirm_match', request_id: 'r1', screening_ids: ['s1'] }])
  })

  it('close needs a reason, then a second click; mail delivery has an 已寄出 two-step confirm', async () => {
    const row = allById(r, 'consumer-request')[0]
    expect(row.findByProps({ 'data-testid': 'close-request' }).props.disabled).toBe(true)
    await act(async () => { row.findByProps({ 'aria-label': '备注' }).props.onChange({ target: { value: '邮箱链上没有筛查' } }) })
    await click(row.findByProps({ 'data-testid': 'close-request' }))
    expect(text(byId(r, 'close-confirm'))).toContain('关闭这条请求？')
    await click(byId(r, 'close-confirm').findAll((n) => n.type === 'button' && text(n) === '确认关闭')[0])
    expect(calls.posts).toEqual([{ action: 'close', request_id: 'r1', note: '邮箱链上没有筛查' }])

    const mail = allById(r, 'consumer-request')[1]
    const deliver = mail.findByProps({ 'data-testid': 'mark-delivered' })
    expect(text(deliver)).toBe('已寄出')
    await click(deliver)
    expect(text(byId(r, 'mark-delivered-confirm'))).toContain('确认披露包已寄出？')
    await click(byId(r, 'mark-delivered-confirm').findAll((n) => n.type === 'button' && text(n) === '确认')[0])
    expect(calls.posts[1]).toEqual({ action: 'mark_delivered', request_id: 'r2', note: '' })
  })

  it('dispute: four resolutions + mandatory note → two-step confirm → resolve_dispute call → 已通知 N 位收件人', async () => {
    const d = byId(r, 'consumer-dispute')
    expect(text(byId(r, 'dispute-statement'))).toContain('那不是我')
    expect(text(d)).toContain('LTB 判令 · 同名命中')
    for (const k of ['corrected', 'supplemented', 'deleted', 'maintained']) expect(d.findAllByProps({ 'data-testid': `resolution-${k}` })).toHaveLength(1)
    const submit = () => d.findByProps({ 'data-testid': 'resolve-dispute' })
    expect(submit().props.disabled).toBe(true)
    await click(d.findByProps({ 'data-testid': 'resolution-corrected' }))
    expect(submit().props.disabled).toBe(true)
    await act(async () => { d.findByType('textarea').props.onChange({ target: { value: '核对法院门户：当事人地址与申请人不符，已删除该命中。' } }) })
    expect(submit().props.disabled).toBe(false)
    await click(submit())
    expect(calls.posts).toHaveLength(0)
    const confirm = byId(r, 'resolve-confirm')
    expect(text(confirm)).toContain('按「更正」处理这条争议？')
    await click(confirm.findAll((n) => n.type === 'button' && text(n) === '确认：更正')[0])
    expect(calls.posts).toEqual([{ action: 'resolve_dispute', dispute_id: 'd1', resolution: 'corrected', note: '核对法院门户：当事人地址与申请人不符，已删除该命中。' }])
    expect(text(byId(r, 'resolve-flash'))).toBe('已处理 · 已通知 2 位收件人')
  })

  it('the queue page itself has no native confirm / alert', () => {
    const s = readFileSync('app/admin/consumer-requests/page.tsx', 'utf8')
    expect(s).not.toMatch(/window\.confirm\(|window\.alert\(|(^|[^A-Za-z0-9_.$])(confirm|alert)\(/m)
    expect(s).toContain("fetch('/api/admin/consumer'")
    expect(s).toContain('max-w-[1320px] px-6 py-8 sm:px-8 lg:px-12')
  })
})

describe('/screening/app · s.11(3) attestation (additive only)', () => {
  const s = readFileSync('app/screening/app/page.tsx', 'utf8')
  it('has the checkbox with the statutory wording, gating only NEW screenings', () => {
    expect(s).toContain('申请人已收到书面通知，知道会被筛查（Form 410 / 申请页同意 / 收件链接授权）· 《消费者报告法》s.11(3)')
    expect(s).toContain('data-testid="notice-confirm"')
    expect(s).toContain('const [noticeConfirmed, setNoticeConfirmed] = useState(false)')
    expect(s).toContain('const noticeGateOpen = noticeFromDeepLink || noticeConfirmed')
    // both start buttons (form + phone action bar) are disabled until ticked
    expect(s.match(/const isDisabled = files\.length === 0 \|\| classifying \|\| preparing \|\| !noticeGateOpen/g)).toHaveLength(2)
    // runAnalysis backstop applies to new rows only (`existing` = from-application / rerun)
    expect(s).toContain('if (!existing && !noticeGateOpen) {')
    // rows opened via ?screening= do not show the checkbox
    expect(s).toContain('{!noticeFromDeepLink && (')
  })
  it('stamps the new row after creation and leaves the existing insert untouched', () => {
    expect(s).toContain("notice_confirmed_how: 'landlord_attested'")
    const stamp = s.indexOf("update({ notice_confirmed_at: new Date().toISOString(), notice_confirmed_how: 'landlord_attested' }).eq('id', row.id)")
    const insert = s.indexOf(".insert({\n          landlord_id: landlord.authId,")
    expect(insert).toBeGreaterThan(0)
    expect(stamp).toBeGreaterThan(insert)
    expect(s).toContain("delegation_id: shellRole === 'agent' && delegation && delegation !== 'none' && delegation.live ? delegationId : null,")
    expect(s).toContain('screeningId = row.id\n      setProgress(2)\n      // s.11(3) attestation')
  })
  it('adds no native confirm: the only window.confirm is the pre-existing deleteScreening one (DO NOT TOUCH module)', () => {
    const hits = s.match(/window\.confirm\(/g) ?? []
    expect(hits).toHaveLength(1)
    const fnStart = s.indexOf('async function deleteScreening(')
    expect(s.indexOf('window.confirm(')).toBeGreaterThan(fnStart)
    expect(s.indexOf('window.confirm(') - fnStart).toBeLessThan(200)
    // none of the added blocks use it
    for (const marker of ['s.11(3) attestation (V0.8)', 'data-testid="notice-confirm"', 'if (!existing && !noticeGateOpen) {']) {
      const i = s.indexOf(marker)
      expect(s.slice(i, i + 1500)).not.toContain('window.confirm')
    }
  })
})

describe('landlord phone + admin console wiring', () => {
  it('/settings mounts LandlordPhoneCard for the landlord hat only', () => {
    const p = readFileSync('app/settings/page.tsx', 'utf8')
    expect(p).toContain("import LandlordPhoneCard from '@/components/settings/LandlordPhoneCard'")
    expect(p).toContain("{shellRole === 'landlord' && auth.user && <LandlordPhoneCard userId={auth.user.id} zh={zh} />}")
  })
  it('LandlordPhoneCard writes landlords.phone by auth_id after a dual-ID lookup and says what the phone is for', () => {
    const c = readFileSync('components/settings/LandlordPhoneCard.tsx', 'utf8')
    expect(c).toContain(".or(`id.eq.${userId},auth_id.eq.${userId}`)")
    expect(c).toContain("update({ phone: v || null }).eq('auth_id', userId)")
    expect(c).toContain('《消费者报告法》披露会把查阅过申请人档案的人的姓名与电话列给申请人；留空则只列姓名与邮箱')
    expect(c).toContain('data-testid="landlord-phone-card"')
  })
  it('/admin console has the queue block with the pending count from GET /api/admin/consumer', () => {
    const a = readFileSync('app/admin/page.tsx', 'utf8')
    expect(a).toContain("href: '/admin/consumer-requests'")
    expect(a).toContain("fetch('/api/admin/consumer'")
    expect(a).toContain('消费者档案请求')
    expect(a).toContain('待办')
  })
})
