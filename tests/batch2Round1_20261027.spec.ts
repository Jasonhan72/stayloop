// 报告对照方案 · 第二批 ⑥⑦ (2026-10-27): professional-service trades (directory and
// referral only, never dispatched) and move-in / move-out condition photos
// (hashed on the device, server-timed, append-only, side by side, listed in the
// evidence pack). Rules this file keeps:
//   • a professional trade has no ticket category and needs its statutory licence
//   • every credential kind in code is in the database CHECK and has a label
//   • condition_photos: members SELECT + INSERT as themselves, nothing else
//   • the referral links say Stayloop gives no legal advice / sells no insurance
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CREDENTIAL_LABEL, GRACE_ELIGIBLE_KINDS, isProfessionalTrade, PROFESSIONAL_TRADES, TRADES, tradeForCategory, type CredentialKind } from '@/lib/marketplace/trades'
import { conditionPhotoPath, MAX_CONDITION_PHOTOS_PER_ITEM, pairByItem, photoItemsFor, roomFor, type ConditionPhotoRow } from '@/lib/household/conditionPhotos'
import { renderEvidencePack, type EvidencePackData } from '@/lib/export/evidencePack'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('professional trades', () => {
  it('four directory-only trades: no ticket category, a licence each, never the dispatcher’s fallback', () => {
    expect([...PROFESSIONAL_TRADES]).toEqual(['photographer_floorplan', 'insurance_broker', 'paralegal', 'lawyer'])
    for (const t of PROFESSIONAL_TRADES) {
      const def = TRADES.find((x) => x.key === t)!
      expect(def.ticketCategories, t).toEqual([])
      expect(def.required.length, t).toBeGreaterThan(0)
    }
    expect(TRADES.find((x) => x.key === 'paralegal')!.required).toEqual(['lso_paralegal'])
    expect(TRADES.find((x) => x.key === 'lawyer')!.required).toEqual(['lso_lawyer'])
    expect(TRADES.find((x) => x.key === 'insurance_broker')!.required).toEqual(['ribo_licence'])
    for (const c of ['plumbing', 'other', 'repair', 'paralegal', 'legal', '']) expect(isProfessionalTrade(tradeForCategory(c)), c).toBe(false)
    expect(isProfessionalTrade('paralegal')).toBe(true)
    expect(isProfessionalTrade('mls')).toBe(false)
  })
  it('every credential kind has a label and is in the database CHECK; licences never get grace', () => {
    const sql = read('supabase/migrations/20261027_professional_services_condition_photos.sql')
    const kinds = new Set<CredentialKind>()
    for (const t of TRADES) for (const k of t.required) kinds.add(k)
    for (const k of kinds) {
      expect(CREDENTIAL_LABEL[k], k).toBeTruthy()
      expect(sql, k).toContain(`'${k}'`)
    }
    for (const k of ['lso_paralegal', 'lso_lawyer', 'ribo_licence'] as const) expect(GRACE_ELIGIBLE_KINDS).not.toContain(k)
    expect(CREDENTIAL_LABEL.lso_paralegal.url).toMatch(/^https:\/\/lso\.ca\//)
    expect(CREDENTIAL_LABEL.ribo_licence.url).toMatch(/^https:\/\/www\.ribo\.com\//)
  })
  it('the landlord page splits them out, the directory needs a sign-in, both say no commission / no legal advice', () => {
    const l = code('app/landlord/providers/page.tsx')
    expect(l).toContain('data-testid="professional-note"')
    expect(l).toContain('!r.p.trades.every(isProfessionalTrade)')
    expect(l).toContain('href="/providers/professional"')
    for (const bad of ['window.confirm', 'alert(']) expect(l).not.toContain(bad)
    const d = code('app/providers/professional/page.tsx')
    expect(d).toContain("overlaps('trades', [...PROFESSIONAL_TRADES])")
    expect(d).toContain('data-testid="professional-signin"')
    expect(d).toContain('不收佣金、不给法律意见、不卖保险')
    expect(d).not.toMatch(/llmChat|service_role|SUPABASE_SERVICE_ROLE_KEY/)
  })
  it('the two trigger points link the right trade', () => {
    expect(code('components/household/MoveInChecklist.tsx')).toContain('href="/providers/professional?trade=insurance_broker"')
    expect(code('components/landlord/NoticeToolbox.tsx')).toContain('href="/providers/professional?trade=paralegal"')
    expect(code('components/agent/ApprovalActionCard.tsx')).toContain('href="/providers/professional?trade=paralegal"')
    expect(code('components/landlord/NoticeToolbox.tsx')).toContain('不给法律意见')
    // review 2026-10-27: a professional trade never appears in the dispatch preference card
    expect(code('components/marketplace/DispatchPolicyCard.tsx')).toContain('!isProfessionalTrade(t.key) && providers.some')
  })
})

describe('condition photos', () => {
  it('path lives under the household folder (bucket policy key) and is sanitised', () => {
    expect(conditionPhotoPath('hh-1', 'move_in', 'photos_kitchen', 'abc', 'JPG')).toBe('hh-1/condition/move_in/photos_kitchen/abc.jpg')
    expect(conditionPhotoPath('hh-1', 'move_out', '../x y', 'id', 'p.n/g')).toBe('hh-1/condition/move_out/xy/id.png')
  })
  it('pairs rows by checklist photo item in upload order; room per item + phase is capped', () => {
    const items = photoItemsFor('ON')
    expect(items.length).toBeGreaterThanOrEqual(4)
    const row = (over: Partial<ConditionPhotoRow>): ConditionPhotoRow => ({ id: 'r', household_id: 'h', phase: 'move_in', item_key: items[0].key, path: 'p', sha256: 'a'.repeat(64), bytes: 10, content_type: null, note: null, taken_by: 'u', created_at: '2026-10-01T00:00:00Z', ...over })
    const rows = [row({ id: 'b', created_at: '2026-10-02T00:00:00Z' }), row({ id: 'a' }), row({ id: 'c', phase: 'move_out' }), row({ id: 'd', item_key: items[1].key })]
    const pairs = pairByItem(rows, items)
    expect(pairs[0].move_in.map((r) => r.id)).toEqual(['a', 'b'])
    expect(pairs[0].move_out.map((r) => r.id)).toEqual(['c'])
    expect(pairs[1].move_in.map((r) => r.id)).toEqual(['d'])
    expect(roomFor(rows, 'move_in', items[0].key)).toBe(MAX_CONDITION_PHOTOS_PER_ITEM - 2)
    expect(roomFor(Array.from({ length: 9 }, (_, i) => row({ id: String(i) })), 'move_in', items[0].key)).toBe(0)
  })
  it('migration: members read and insert as themselves, no update / delete, hash and phase checked', () => {
    const sql = read('supabase/migrations/20261027_professional_services_condition_photos.sql')
    expect(sql).toContain("phase in ('move_in','move_out')")
    expect(sql).toContain("sha256 ~ '^[0-9a-f]{64}$'")
    expect(sql).toContain('public.is_household_member(household_id) and taken_by = auth.uid()')
    expect(sql).toContain('revoke all on public.condition_photos from public, anon, authenticated, service_role')
    expect(sql).toContain('grant select, insert on public.condition_photos to authenticated')
    expect(sql).not.toMatch(/for (update|delete)/)
    expect(sql).not.toMatch(/grant (update|delete|all) on public\.condition_photos to authenticated/)
  })
  it('the component hashes on the device, uploads to the household folder, never deletes, and grades nothing', () => {
    const c = code('components/household/ConditionPhotos.tsx')
    expect(c).toContain('sha256HexOf(blob)')
    expect(c).toContain("storage.from('tenancy-files').upload(path, blob")
    expect(c).toContain("from('condition_photos').insert(")
    expect(c).not.toMatch(/\.delete\(|\.update\(|\.remove\(/)
    expect(c).not.toMatch(/llmChat|damage score|损坏评分/)
    expect(c).toContain('data-testid="condition-phase"')
    // review 2026-10-27: signed thumbnails are re-signed while the page stays open
    expect(c).toContain('const SIGNED_URL_SECONDS = 3600')
    expect(c).toContain('setInterval(() => void load(), RESIGN_MS)')
    for (const p of ['app/h/[id]/page.tsx', 'app/tenant/move-in/page.tsx']) expect(code(p), p).toContain('<ConditionPhotos householdId=')
  })
  it('the evidence pack lists each photo’s hash and server time in its own section', () => {
    const base: EvidencePackData = {
      matter: { id: 'm1', address: '1 Main St', unit: null, created_at: '2026-10-01T00:00:00Z' },
      parties: { landlord: 'L (房东)', tenant: 'T (租客)' },
      application: null, screening: null, lease: null,
      household: { id: 'h1', verified: true, status: 'active', rent: [] },
      work_orders: [], threads: [], audit: [], delegations: [],
      condition_photos: [{ phase: 'move_in', item_key: 'photos_kitchen', created_at: '2026-10-02T15:00:00Z', by: 'T (租客)', sha256: 'f'.repeat(64), bytes: 123456, note: null }],
    }
    const html = renderEvidencePack(base, { lang: 'zh', generatedAt: '2026-10-03T00:00:00Z', generatedBy: 'L', fingerprint: 'abc', siteUrl: 'https://www.stayloop.ai' })
    expect(html).toContain('5 · 入住 / 退租状态照片')
    expect(html).toContain('f'.repeat(64))
    expect(html).toContain('photos_kitchen')
    expect(html).toContain('6 · 附件清单')
    expect(html).toContain('9 · 内容指纹')
    expect(renderEvidencePack({ ...base, condition_photos: [] }, { lang: 'en', generatedAt: '2026-10-03T00:00:00Z', generatedBy: 'L', fingerprint: 'abc', siteUrl: 'https://s' })).toContain('No condition photos recorded.')
    expect(code('app/api/matters/export/route.ts')).toContain("from('condition_photos')")
  })
})
