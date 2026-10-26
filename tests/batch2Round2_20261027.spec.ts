// 报告对照方案 · 第二批 ⑧⑨⑩ (2026-10-27): the T776 export (recorded rent and
// completed work orders only, every other line empty and said so), the evidence
// pack ordered by the kind of matter (same content, same numbering for the
// default) with the paralegal hand-off line, and the public scoring method.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { summarizeT776, t776Csv, T776_LINES, workOrderAmount } from '@/lib/landlord/t776'
import { isPackKind, PACK_KINDS, PACK_ORDER, renderEvidencePack, type EvidencePackData } from '@/lib/export/evidencePack'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('T776 figures', () => {
  const leases = [
    { id: 'L1', unit_label: 'Unit 1', household: { address: '100 Test Ave', unit: '1' } },
    { id: 'L2', unit_label: '19 OpenNext Ave #9', household: null },
  ]
  const rents = [
    { lease_id: 'L1', amount: 2450, status: 'paid', paid_at: '2026-03-01T12:00:00Z' },
    { lease_id: 'L1', amount: '2450', status: 'late', paid_at: '2026-04-09T12:00:00Z' },
    { lease_id: 'L1', amount: 2450, status: 'due', paid_at: null },
    { lease_id: 'L1', amount: 2450, status: 'paid', paid_at: '2025-12-31T23:00:00Z' },
    { lease_id: 'L2', amount: 2100, status: 'paid', paid_at: '2026-01-01T05:00:00Z' },
    { lease_id: 'L9', amount: 999, status: 'paid', paid_at: '2026-05-01T00:00:00Z' },
  ]
  const workOrders = [
    { household_id: 'H1', status: 'closed', invoice_amount: 180, approved_amount: 200, quote_amount: 150, completed_at: '2026-02-02T00:00:00Z' },
    { household_id: 'H1', status: 'accepted', invoice_amount: null, approved_amount: null, quote_amount: '95', completed_at: '2026-06-02T00:00:00Z' },
    { household_id: 'H1', status: 'completed', invoice_amount: 500, approved_amount: null, quote_amount: null, completed_at: '2025-06-02T00:00:00Z' },
    { household_id: 'H-unknown', status: 'closed', invoice_amount: 40, approved_amount: null, quote_amount: null, completed_at: '2026-06-02T00:00:00Z' },
  ]
  it('the year is the Toronto year: 21:00 on Dec 31 (02:00Z next day) stays in it (review 2026-10-27)', () => {
    const s = summarizeT776({ year: 2026, leases, rents: [
      { lease_id: 'L1', amount: 100, status: 'paid', paid_at: '2027-01-01T02:00:00Z' },   // Dec 31 21:00 Toronto → 2026
      { lease_id: 'L1', amount: 200, status: 'paid', paid_at: '2026-01-01T02:00:00Z' },   // Dec 31 2025 21:00 Toronto → 2025
      { lease_id: 'L1', amount: 400, status: 'paid', paid_at: '2026-01-01T06:00:00Z' },   // Jan 1 01:00 Toronto → 2026
    ], workOrders: [], householdOfLease: { L1: 'H1' } })
    expect(s.totals.gross_rents).toBe(500)
    expect(code('app/api/finance/t776/route.ts')).toContain('fromToronto(year, 1, 1, 0)')
  })
  it('line 8141 counts rent RECORDED as received in the year, per property; deposits and open periods never', () => {
    const s = summarizeT776({ year: 2026, leases, rents, workOrders, householdOfLease: { L1: 'H1' } })
    const p1 = s.properties.find((p) => p.label === '100 Test Ave #1')!
    expect(p1.gross_rents).toBe(4900)
    expect(p1.rent_count).toBe(2)
    const p2 = s.properties.find((p) => p.label === '19 OpenNext Ave #9')!
    expect(p2.gross_rents).toBe(2100)
    expect(s.totals.gross_rents).toBe(7000)
  })
  it('line 8960 takes invoice, else approved, else quote, only for work orders completed in the year', () => {
    expect(workOrderAmount({ invoice_amount: 180, approved_amount: 200, quote_amount: 150 })).toBe(180)
    expect(workOrderAmount({ invoice_amount: null, approved_amount: 200, quote_amount: 150 })).toBe(200)
    expect(workOrderAmount({ invoice_amount: null, approved_amount: null, quote_amount: '95' })).toBe(95)
    const s = summarizeT776({ year: 2026, leases, rents, workOrders, householdOfLease: { L1: 'H1' } })
    expect(s.properties.find((p) => p.label === '100 Test Ave #1')!.repairs).toBe(275)
    expect(s.totals.repair_count).toBe(2)
    expect(s.unplaced_repairs).toBe(40)
  })
  it('every other T776 line is listed empty — nothing estimated — and the CSV carries the same table', () => {
    expect(T776_LINES.filter((l) => !l.source).length).toBe(12)
    expect(T776_LINES.map((l) => l.line)).toContain('9180')
    const csv = t776Csv(summarizeT776({ year: 2026, leases, rents, workOrders, householdOfLease: { L1: 'H1' } }), 'zh')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('100 Test Ave #1,8141,租金总收入,4900.00,2,Stayloop 记录的租金')
    expect(csv).toContain('100 Test Ave #1,9180,地税,,,这里没有记录')
    expect(csv).toContain('合计,8960,维修与保养,275.00,2')
    const route = code('app/api/finance/t776/route.ts')
    expect(route).toContain('callerOf(req)')
    expect(route).toContain("in('status', ['paid', 'late'])")
    expect(route).toContain('这里没有记录')
    expect(route).toContain('不是税务建议')
    expect(route).not.toMatch(/llmChat/)
    const fin = code('app/landlord/finance/page.tsx')
    expect(fin).toContain('<T776Export zh={zh} />')
    expect(fin).not.toContain('预览我的 2025 报税包')
  })
})

describe('evidence pack order by matter kind', () => {
  const base: EvidencePackData = {
    matter: { id: 'm1', address: '1 Main St', unit: null, created_at: '2026-10-01T00:00:00Z' },
    parties: { landlord: 'L (房东)', tenant: 'T (租客)' },
    application: null, screening: null, lease: null, household: null,
    work_orders: [], threads: [], audit: [], delegations: [], condition_photos: [],
  }
  const meta = (kind?: 'general' | 'arrears' | 'maintenance' | 'move_out') => ({ lang: 'zh' as const, generatedAt: '2026-10-03T00:00:00Z', generatedBy: 'L', fingerprint: 'abc', siteUrl: 'https://www.stayloop.ai', kind })
  const titles = (html: string) => Array.from(html.matchAll(/<h2>(\d) · ([^<]+?)(?: <span| ?<\/h2>)/g)).map((m) => `${m[1]} ${m[2].trim()}`)
  it('the default order and numbering are unchanged; every kind is a permutation of the same eight sections', () => {
    expect(isPackKind('arrears')).toBe(true)
    expect(isPackKind('x')).toBe(false)
    for (const k of PACK_KINDS) expect([...PACK_ORDER[k]].sort()).toEqual([...PACK_ORDER.general].sort())
    const t = titles(renderEvidencePack(base, meta()))
    expect(t.slice(0, 4)).toEqual(['1 事务链', '2 正式通知副本', '3 维修工单', '4 对话记录'])
    expect(t[8]).toBe('9 内容指纹')
    expect(titles(renderEvidencePack(base, meta('general')))).toEqual(t)
  })
  it('arrears reads notices before work orders; maintenance reads work orders first; move-out reads the photos first', () => {
    expect(titles(renderEvidencePack(base, meta('arrears'))).slice(0, 3)).toEqual(['1 事务链', '2 正式通知副本', '3 对话记录'])
    expect(titles(renderEvidencePack(base, meta('maintenance')))[1]).toBe('2 维修工单')
    expect(titles(renderEvidencePack(base, meta('move_out')))[1]).toBe('2 入住 / 退租状态照片')
    const html = renderEvidencePack(base, meta('arrears'))
    expect(html).toContain('整理顺序')
    expect(html).toContain('欠租事务')
    expect(html).toContain('9 · 内容指纹')
  })
  it('every pack carries the paralegal hand-off line and says Stayloop gives no legal advice', () => {
    const html = renderEvidencePack(base, meta())
    expect(html).toContain('https://www.stayloop.ai/providers/professional?trade=paralegal')
    expect(html).toContain('不给法律意见、不代填表、不代理出庭')
    const route = code('app/api/matters/export/route.ts')
    expect(route).toContain("isPackKind(body.kind) ? body.kind : 'general'")
    expect(code('components/matters/MattersPanel.tsx')).toContain('data-testid="pack-kind"')
  })
})

describe('public scoring method', () => {
  it('lives on /consumer-rights, says what is scored and what never is, and is linked from the screening page and the tools page', () => {
    const c = code('app/consumer-rights/page.tsx')
    expect(c).toContain('id="method"')
    for (const must of ['付款能力', '信用状况', '租务与司法历史', '核验程度', '不计分', '不设信用分截止线', '按「未知」记', '受保护特征不进评分', '同名', '已出判令', '决定由房东或经纪本人做']) expect(c, must).toContain(must)
    for (const bad of ['背调', '法律协助', '助手']) expect(c).not.toContain(bad)
    expect(code('app/screening/LandingBody.tsx')).toContain('href="/consumer-rights#method"')
    expect(code('app/tools/page.tsx')).toContain('href="/consumer-rights#method"')
  })
  it('touches nothing in the screening module itself', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const changed = execSync('git diff --name-only HEAD -- app/screening app/api/screen-score app/api/deep-check lib/generateReport.ts lib/forensics', { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    expect(changed).toEqual(['app/screening/LandingBody.tsx'].filter((f) => changed.includes(f)))
  })
})
