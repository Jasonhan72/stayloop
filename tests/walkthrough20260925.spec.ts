// Landlord walk-through on production with the test account (2026-09-25,
// user: "用房东测试账号登录，从 realtor.ca 抓取二条新的房源来发布…再做更多的全站测试"):
// two Realtor.ca listings imported through the wizard → Logic draft card →
// published → verified. What broke on the way, pinned here.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { reconcileDraft, sameProperty } from '@/lib/agent/draftReconcile'
import { parkingStat } from '@/lib/listingDisplay'
import type { DraftListing } from '@/lib/agent/types'

const read = (p: string) => readFileSync(p, 'utf8')

describe('draft cards keep the facts the model extracted (fact drift)', () => {
  const first: DraftListing = { address: '1001 Bay Street', unit: '1618', monthly_rent: 2700, bedrooms: 1, bathrooms: 1, has_den: true, images: ['a', 'b', 'c'], amenities: ['Locker'] }
  it('a re-draft that changed the rent and dropped the den without the user saying so is reverted', () => {
    const second: DraftListing = { address: '1001 Bay St', unit: '1618', monthly_rent: 2800, bedrooms: 1, bathrooms: 1, sqft: 799, has_den: false, images: ['a'] }
    const out = reconcileDraft(first, second, '补充：面积 799 平方英尺；不带家具')
    expect(out.monthly_rent).toBe(2700)
    expect(out.has_den).toBe(true)
    expect(out.sqft).toBe(799) // new fact the user gave stays
    expect(out.images).toEqual(['a', 'b', 'c'])
    expect(out.amenities).toEqual(['Locker'])
  })
  it('a change the user asked for is accepted; a different property is a new draft', () => {
    const second: DraftListing = { address: '1001 Bay St', unit: '1618', monthly_rent: 2650, bedrooms: 1, bathrooms: 1, has_den: true, images: ['a', 'b', 'c'] }
    expect(reconcileDraft(first, second, '租金改成 2,650').monthly_rent).toBe(2650)
    const other: DraftListing = { address: '280 Dundas Street W', unit: '515', monthly_rent: 2250, bedrooms: 1, bathrooms: 1 }
    expect(reconcileDraft(first, other, '再导入一套').monthly_rent).toBe(2250)
    expect(sameProperty('1001 Bay Street', '1001 Bay St')).toBe(true)
    expect(sameProperty('1001 Bay Street', '1080 Bay Street')).toBe(false)
  })
  it('is wired into the live turn and the activity panel re-reads after the thread is saved', () => {
    const hook = read('lib/agent/useAgentSession.ts')
    expect(hook).toContain("draftListing = reconcileDraft(prevDraft, draftListing, message)")
    expect(hook).toContain("if (id) await saveThread(getSupabaseBrowser(), id, messagesRef.current)\n    // The activity panel")
    expect(hook).toContain('if (id) notifyActivityChanged()')
  })
})

describe('listing detail page tells the truth about what it has', () => {
  const page = read('app/listings/[slug]/page.tsx')
  it('parking reads the text, no fake media chips, no invented postal code, no "AI Agent" contact', () => {
    expect(parkingStat('不含车位（可选租 $100/月）', true)).toBe('可另租')
    expect(parkingStat('无', true)).toBe('不含')
    expect(parkingStat('1 underground spot included', true)).toBe('有')
    expect(parkingStat('', true)).toBe('未提供')
    expect(page).toContain('parkingStat(listing.parking, zh)')
    expect(page).not.toContain("'平面图'")
    expect(page).not.toContain('listing.photo_count || 24')
    expect(page).toContain("{listing.virtual_tour_url && (")
    expect(page).not.toContain("toUpperCase()} ···")
    expect(page).not.toContain("'AI Agent'")
  })
  it('trust_tier no longer defaults to 2 (every listing showed 需 收入章 · 房东设置)', () => {
    const sql = read('supabase/migrations/20260925_listings_trust_tier_default.sql')
    expect(sql).toContain('alter column trust_tier drop default')
    expect(sql).toContain('set trust_tier = null')
  })
})

describe('landlord workbench: real data where a design sample used to sit', () => {
  it('dashboard insight is computed from the landlord’s own listings; wizard import copy promises only what exists', () => {
    const dash = read('app/dashboard/page.tsx')
    expect(dash).not.toContain('89 Estelle')
    expect(dash).toContain('.filter((x) => x.days >= 7 && x.apps === 0)')
    const wiz = read('app/dashboard/listings/new/page.tsx')
    for (const gone of ['给定价建议', '拖 PDF', '自动改写 EN+中文双语文案']) expect(wiz).not.toContain(gone)
  })
  it('leases page: recent activity comes from the audit log, lease rows show a code not a uuid', () => {
    const leases = read('app/landlord/leases/page.tsx')
    // (Kevin Tran / Anna L. / L-205 stay in the design-sample LEASES that render under a 示范数据 banner when there are no real leases)
    for (const gone of ['const ACTIVITY', '已生成 L-205 续约草稿', 'L-198 转入 month-to-month']) expect(leases).not.toContain(gone)
    expect(leases).toContain("from('agent_audit_events')")
    expect(leases).toContain('{leaseCode(l.id)} · {l.start} → {l.end}')
  })
  it('published-listing editor has the same lease terms as the draft editor', () => {
    const edit = read('app/dashboard/listings/[id]/edit/page.tsx')
    for (const k of ['lease_term', 'pets_allowed', 'smoking_policy', 'furnished', 'utilities_included']) expect(edit).toContain(`${k}:`)
    expect(edit).toContain("{zh ? '租赁条件' : 'Lease terms'}")
  })
  it('the renewal card and the lifecycle rail use the same N1 clock', () => {
    const r = read('lib/agent/renewalStages.ts')
    expect(r).toContain('n1DeadlineFor(isoDate(new Date(end.getTime() + 86_400_000)))')
    expect(r).not.toContain('end.getTime() - NOTICE_DAYS * 86_400_000')
  })
})

describe('sign-in and chrome', () => {
  it('the remembered hat is per account (a landlord after an agent on the same browser saw 经纪 · Brief on /settings)', () => {
    const auth = read('lib/useAuth.ts')
    expect(auth).toContain('export const roleStorageKey = (uid?: string | null): string => (uid ? `${ROLE_KEY}:${uid}` : ROLE_KEY)')
    expect(auth).toContain('const role = readRole(s?.user?.id)')
    expect(auth).toContain("if (k === ROLE_KEY || k.startsWith(`${ROLE_KEY}:`)) window.localStorage.removeItem(k)")
    const cb = read('app/auth/callback/page.tsx')
    expect(cb).toContain('window.localStorage.getItem(roleStorageKey(signedIn.id))')
    expect(cb).not.toContain("getItem('sl-active-role')")
    // …and an account that never switched hats still gets the right identity: the role page it is on is remembered, /settings falls back to the best hat it holds
    expect(auth).toContain('if (window.localStorage.getItem(key) !== r) window.localStorage.setItem(key, r)')
    for (const f of ['app/settings/page.tsx', 'app/settings/models/page.tsx']) expect(read(f), f).toContain("(auth.role || bestHat(hats)) as WorkspaceRole")
    expect(read('components/Header.tsx')).toContain('const currentRole = auth.role || bestHat(hats)')
  })
  it('jump-to-latest is the dark circle the user pointed at, shown after 120px of scroll-back', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain("style={{ background: 'rgba(27,27,60,0.85)' }}")
    expect(chat).toContain('flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full text-white')
  })
})

describe('tenant walk-through (tenant test account on production, 2026-09-25)', () => {
  it('applicant_applications is read-only and carries a listing snapshot; the tracker names inactive listings', () => {
    const sql = read('supabase/migrations/20260925_applicant_applications_readonly_listing.sql')
    expect(sql).toContain('revoke insert, update, delete, truncate, references, trigger on public.applicant_applications from authenticated, anon, public')
    expect(sql).toContain('l.is_active as listing_active')
    const tracker = read('components/tenant/MyApplications.tsx')
    expect(tracker).toContain('listing_slug, listing_address, listing_unit, listing_active')
    expect(tracker).not.toContain('listing:listings(slug, address, unit)')
    expect(tracker).toContain("{zh ? '已下架' : 'Off market'}")
    const showings = read('components/tenant/MyShowings.tsx')
    expect(showings).toContain(".from('my_showing_intents')")
    expect(showings).not.toContain('listing:listings(slug, address, unit)')
    expect(read('supabase/migrations/20260925_my_showing_intents_view.sql')).toContain('revoke insert, update, delete, truncate, references, trigger on public.my_showing_intents from authenticated')
  })
  it('the sample lease’s legal commentary is right (no grace period, no pet deposit) and the apply cap matches the bucket', () => {
    const lease = read('app/tenant/lease/page.tsx')
    expect(lease).not.toContain('legally permitted grace period')
    expect(lease).not.toContain('$500 在合理范围')
    expect(lease).toContain('RTA s.134 不允许收取宠物押金')
    expect(lease).not.toContain('Stripe 托管')
    const apply = read('app/apply/[slug]/page.tsx')
    expect(apply).toContain('const MAX_BYTES = 25 * 1024 * 1024')
    expect(apply).not.toContain('10 MB')
    expect(apply).toContain('const prep = await prepareUploads([raw])')
  })
  it('/tenant/payments lists the tenant’s real rent records; the household member row does not print a uuid; no stale stamp-threshold copy', () => {
    expect(read('app/tenant/payments/page.tsx')).toContain('liveSlot={<MyRent />}')
    const rent = read('components/tenant/MyRent.tsx')
    expect(rent).toContain("from('rent_payments')")
    expect(rent).toContain("useReportLiveRows('rent', rows?.length)")
    expect(read('app/h/[id]/page.tsx')).not.toContain('m.user_id.slice(0, 8)')
    expect(read('lib/agent/orchestrator.ts')).not.toContain('盖章门槛过滤')
  })
})
