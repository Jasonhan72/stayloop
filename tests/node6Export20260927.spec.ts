// 节点 6 · 可收口 (2026-09-27): the evidence pack of a rental matter and the
// settlement receipt of a work order are rendered from the platform record,
// printable, fingerprinted and audited; no score ever appears; retracted
// messages stay in the record marked as retracted; formal notices are copies.
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { canonicalJson, esc, renderEvidencePack, renderReceipt, type EvidencePackData, type ReceiptData } from '@/lib/export/evidencePack'

const read = (p: string) => readFileSync(p, 'utf8')
const META = { lang: 'zh' as const, generatedAt: '2026-09-27T05:00:00Z', generatedBy: 'landlord-test@stayloop.ai (landlord)', fingerprint: 'f'.repeat(64), siteUrl: 'https://www.stayloop.ai' }
const DATA: EvidencePackData = {
  matter: { id: '0b93ea2f-0000-4000-8000-000000000000', address: '100 Test Ave', unit: '1', created_at: '2026-09-01T00:00:00Z' },
  parties: { landlord: 'landlord-test@stayloop.ai', tenant: 'tenant-test@stayloop.ai' },
  application: { id: 'a1', applicant: 'Test <b>Tenant</b>', status: 'approved', created_at: '2026-09-02T00:00:00Z', decision_notified_at: '2026-09-03T00:00:00Z', decision_reason: null },
  screening: { id: 's1', status: 'scored', created_at: '2026-09-02T12:00:00Z' },
  lease: { id: 'l1', status: 'signed_both', start_date: '2026-10-01', end_date: '2027-09-30', monthly_rent: 2450, sent_at: '2026-09-04T00:00:00Z', signed_at: '2026-09-05T00:00:00Z' },
  household: { id: 'h1', verified: true, status: 'active', rent: [{ due_date: '2026-10-01', status: 'paid', paid_at: '2026-10-01T14:00:00Z', amount: 2450 }] },
  work_orders: [{ id: 'w1', status: 'paid', trade: 'plumbing', scope: '厨房水槽漏水', contractor: '[TEST] Maple Plumbing', emergency: false, quote_amount: 150, quote_version: 1, approved_amount: 150, invoice_amount: 180, created_at: '2026-09-10T00:00:00Z', quoted_at: '2026-09-10T01:00:00Z', approved_at: '2026-09-10T02:00:00Z', arrived_at: '2026-09-11T14:00:00Z', completed_at: '2026-09-11T16:00:00Z', accepted_at: '2026-09-11T18:00:00Z', paid_at: '2026-09-12T00:00:00Z', decline_code: null, cancel_reason: null, events: [{ created_at: '2026-09-10T00:00:00Z', actor_kind: 'landlord', event: 'offered', payload: { trade: 'plumbing' } }, { created_at: '2026-09-10T01:00:00Z', actor_kind: 'provider', event: 'accept', payload: { amount: 150, version: 1 } }] }],
  threads: [{ id: 't1', kind: 'work_order', title: '厨房水槽漏水', created_at: '2026-09-10T00:00:00Z', messages: [
    { id: 1, created_at: '2026-09-10T00:00:01Z', sender_kind: 'system', acting_role: null, sender_label: null, kind: 'system', body: '已派单', retracted_at: null, attachments: [] },
    { id: 2, created_at: '2026-09-10T00:05:00Z', sender_kind: 'landlord', acting_role: 'landlord', sender_label: null, kind: 'message', body: '周一上午可以来 <script>alert(1)</script>', retracted_at: '2026-09-10T00:06:00Z', attachments: [{ name: 'leak.png', size: 747, sha256: 'a'.repeat(64), path: 'h1/threads/t1/x.png' }] },
    { id: 4, created_at: '2026-09-10T02:00:00Z', sender_kind: 'landlord', acting_role: 'landlord', sender_label: '房东 · 进入通知', kind: 'formal_copy', body: '进入通知 · 100 Test Ave #1 …', retracted_at: null, attachments: [] },
  ] }],
  audit: [{ created_at: '2026-09-10T02:00:00Z', action: 'executed_approve_quote', actor: 'landlord-test@stayloop.ai', acting_role: 'landlord', delegation_id: null }],
  delegations: [{ id: 'd1', principal: 'landlord-test@stayloop.ai', delegate: '[TEST] Agent Person · RECO #9990001', scope: ['listing'], allowed_actions: ['screen'], status: 'revoked', confirmed_at: '2026-09-27T04:50:00Z', revoked_at: '2026-09-27T04:58:00Z', expires_at: '2027-03-26T00:00:00Z', basis_version: 'TRESA-2024-representation-v1' }],
}

describe('evidence pack renderer', () => {
  const html = renderEvidencePack(DATA, META)
  it('has the eight sections, the fingerprint, server times in UTC beside Toronto, and the formal-copy disclaimer', () => {
    for (const s of ['1 · 事务链', '2 · 正式通知副本', '3 · 维修工单', '4 · 对话记录', '5 · 附件清单', '6 · 委托', '7 · 审计记录', '8 · 内容指纹']) expect(html).toContain(s)
    expect(html).toContain('f'.repeat(64))
    expect(html).toContain('2026-09-10T00:05:00.000Z')
    expect(html).toContain('不构成《住宅租赁法》意义上的法定送达')
    expect(html).toContain('a'.repeat(64)) // attachment hash
    expect(html).toContain('TRESA-2024-representation-v1')
  })
  it('keeps a retracted message in the record, marked; escapes every user string; never prints a score', () => {
    expect(html).toContain('已撤回于')
    expect(html).toContain('周一上午可以来 &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('Test &lt;b&gt;Tenant&lt;/b&gt;')
    expect(html).not.toMatch(/ai_score|\/100\b|v3_tier/)
    expect(html).toContain('结果与分数不在这份记录里') // wording: 导出聊天记录 (user 2026-09-30)
  })
  it('renders in English too and the JSON canonicalisation is key-sorted and stable', () => {
    const en = renderEvidencePack(DATA, { ...META, lang: 'en' })
    expect(en).toContain('Formal-notice copies'); expect(en).toContain('retracted at')
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: null }] })).toBe('{"a":[{"c":null,"d":2}],"b":1}')
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })
})

describe('receipt renderer', () => {
  const base: ReceiptData = { work_order: { ...DATA.work_orders[0], household: '100 Test Ave, #1, Toronto', landlord: 'landlord-test@stayloop.ai', provider_business_number: '123456789', payment_mode: 'offline' }, cpa: { ok: false, overBy: 20 } }
  it('is a settlement receipt when paid, an acceptance record otherwise; shows the CPA 10% check and that no money moved through Stayloop', () => {
    const paid = renderReceipt(base, META)
    expect(paid).toContain('线下结算回执'); expect(paid).toContain('超出批准报价 20%'); expect(paid).toContain('Stayloop 不经手资金'); expect(paid).toContain('BN 123456789'); expect(paid).toContain('f'.repeat(64))
    const acc = renderReceipt({ ...base, work_order: { ...base.work_order, paid_at: null }, cpa: { ok: true } }, META)
    expect(acc).toContain('验收回执'); expect(acc).toContain('尚未标记付款'); expect(acc).toContain('在批准报价的 10% 之内')
  })
})

describe('routes and surfaces', () => {
  it('the export route checks matter_party with the caller’s JWT, renders without scores and audits with the matter and hat', () => {
    const r = read('app/api/matters/export/route.ts')
    expect(r).toContain("sb.rpc('matter_party', { p_matter: mid })")
    expect(r).toContain("action: 'matter_export_generated'")
    expect(r).toContain('rental_matter_id: mid')
    expect(r).toContain("'X-Content-Fingerprint': fingerprint")
    expect(r).not.toMatch(/ai_score|v3_tier/)
    expect(r).toContain("select('id, status, created_at').in('id', ids('screening'))") // screening: state only
  })
  it('the receipt route proves party by an RLS read of the row, only for accepted / paid / closed, and audits with the work order + matter', () => {
    const r = read('app/api/work-orders/[id]/receipt/route.ts')
    expect(r).toContain("sb.from('work_orders').select(WORK_ORDER_COLUMNS).eq('id', id).maybeSingle()")
    expect(r).toContain("['accepted', 'paid', 'closed'].includes(String(w.status))")
    expect(r).toContain("action: 'work_order_receipt_generated'")
    expect(r).toContain("rental_matter_id: matterId")
  })
  it('buttons: evidence pack on every matter card, receipt on settled work orders for landlord / provider; the tab opens before the fetch', () => {
    expect(read('components/matters/MattersPanel.tsx')).toContain('data-testid="export-chat-history"')
    const c = read('components/marketplace/WorkOrderCard.tsx')
    expect(c).toContain('data-testid="work-order-receipt"')
    expect(c).toContain("['accepted', 'paid', 'closed'].includes(wo.status) && viewer !== 'tenant' && viewer !== 'system'")
    const o = read('lib/export/openHtml.ts')
    expect(o.indexOf("window.open('about:blank', '_blank')")).toBeLessThan(o.indexOf('await fetch('))
    expect(existsSync('lib/export/evidencePack.ts')).toBe(true)
    expect(read('lib/agent/ideas.ts')).toContain('matter_export_generated:')
  })
})
