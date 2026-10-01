// Sweep 2026-10-01 · group A4 (listings & leases): #11 #13 #14 #15 #16 #17 #18 #20 #22 #69.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import {
  DRAFT_SLOT_PREFIX, changedKeys, draftCardKey, escapeIlike, existingListingMessage, findExistingListing, isStaleBase, listingStateAfterSave, matchExistingListing,
  markDraftDone, normalizeListingUnit, pickExistingListing, publishListing, readDraftDone, readDraftSlot, relistExisting,
  saveDraftSlot, updateListing, type ExistingListing,
} from '@/lib/listingPublish'
import { leaseActionErrorText, leaseErrorNeedsReload, leaseHasTerms, leaseIsEditableDraft, leaseIsRecordOnly, leaseIsSendable, leaseIsSignable, leaseIsWithdrawable } from '@/lib/lease/leaseState'
import { hasUsableInvite, householdAddressMayMatch, pickHouseholdForLease, sameTenancyAddress, splitAddress, streetKey } from '@/lib/lease/householdMatch'
import type { DraftListing } from '@/lib/agent/types'

const read = (p: string) => readFileSync(p, 'utf8')

// A chainable stand-in for the supabase query builder: records calls, resolves to `result`.
function fakeClient(results: Record<string, unknown>) {
  const calls: { table: string; op: string; args: unknown[] }[] = []
  const builder = (table: string) => {
    let op = 'select'
    const b: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => { calls.push({ table, op: name, args }); if (['insert', 'update', 'delete'].includes(name)) op = name; return b }
    for (const m of ['select', 'eq', 'ilike', 'limit', 'is', 'in', 'order', 'insert', 'update', 'delete']) b[m] = chain(m)
    b.maybeSingle = () => Promise.resolve(results[`${table}:maybeSingle`] ?? { data: null })
    b.single = () => Promise.resolve(results[`${table}:${op}:single`] ?? { data: null })
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(results[`${table}:${op}`] ?? { data: [] }).then(res)
    return b
  }
  return { client: { from: (t: string) => builder(t) } as never, calls }
}

function memStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size },
    _m: m,
  }
}

describe('#13 the duplicate check returns the landlord’s existing row (archived included) so it can be brought back', () => {
  const rows = [
    { id: 'a', slug: 'old', unit: '1203', status: 'archived', is_active: false },
    { id: 'b', slug: 'other', unit: '407', status: 'active', is_active: true },
  ]
  it('same unit (typed any way) → the archived row, flagged archived', () => {
    const e = pickExistingListing(rows, '#1203')!
    expect(e.id).toBe('a')
    expect(e.archived).toBe(true)
    expect(e.is_active).toBe(false)
    expect(normalizeListingUnit('Unit 1203')).toBe(normalizeListingUnit('1203'))
  })
  it('a different unit is not a duplicate; a unit-less new listing collides with any unit at that address (#16)', () => {
    expect(pickExistingListing(rows, '999')).toBeNull()
    expect(pickExistingListing(rows, null)?.id).toBe('b')
  })
  it('a live row wins over an off-market one for the same unit', () => {
    const e = pickExistingListing([{ id: 'x', unit: null, status: 'archived', is_active: false }, { id: 'y', unit: null, status: 'active', is_active: true }], '')!
    expect(e.id).toBe('y')
  })
  it('message names the state and the unit when none was typed', () => {
    const e: ExistingListing = { id: 'a', slug: 's', unit: '1203', status: 'archived', is_active: false, archived: true }
    expect(existingListingMessage(e, true, '')).toContain('恢复上架')
    expect(existingListingMessage(e, true, '')).toContain('单元 1203')
    expect(existingListingMessage({ ...e, archived: false, status: 'active' }, false, '1203')).toContain('Relist it')
  })
  it('LIKE wildcards in a typed address are escaped', () => {
    expect(escapeIlike('12_A 100%')).toBe('12\\_A 100\\%')
  })
  it('publishListing returns the existing row and never inserts', async () => {
    const { client, calls } = fakeClient({ 'listings:select': { data: [{ id: 'a', slug: 'old', address: '28 Avondale Ave', unit: '1203', status: 'archived', is_active: false }] } })
    const r = await publishListing(client, { landlord_id: 'L', address: '28 Avondale Ave', unit: '1203', slug: 's', images: ['https://x/1.jpg'] } as never, { zh: true })
    expect(r.slug).toBeNull()
    expect(r.existing?.id).toBe('a')
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })
  it('relisting updates the old row in place: identity kept, back on the market, status no longer archived', async () => {
    const { client, calls } = fakeClient({ 'listings:update': { data: [{ slug: 'old', is_active: true, verification_status: 'pending', source: 'stayloop', status: 'active', updated_at: 't2' }] } })
    const res = await relistExisting(client, { id: 'a', slug: 'old', unit: '1203', status: 'archived', is_active: false, archived: true }, { landlord_id: 'L', address: 'A', unit: '1203', slug: 'old', monthly_rent: 2500, images: ['https://x/1.jpg'] } as never, { zh: true })
    expect(res.error).toBeNull()
    const patch = calls.find((c) => c.op === 'update')!.args[0] as Record<string, unknown>
    expect(patch).toMatchObject({ is_active: true, status: 'active', monthly_rent: 2500 })
    for (const k of ['landlord_id', 'slug', 'address', 'unit']) expect(patch).not.toHaveProperty(k)
  })
  it('the wizard offers the existing row before re-entering everything, and relists it', () => {
    const w = read('app/dashboard/listings/new/page.tsx')
    expect(w).toContain('void checkExisting(); setStep(2)')
    expect(w).toContain('data-testid="existing-listing"')
    expect(w).toContain('relistExisting(supabase, existing')
    expect(w).toContain('setExisting(dup); setError(null); setDupAtPublish(true)')
  })
  it('the dashboard lists deleted listings and restores them; the editor’s 已上架 clears the archive state', () => {
    const d = read('app/dashboard/page.tsx')
    expect(d).toContain(".eq('status', 'archived')")
    expect(d).toContain("update({ status: 'active', is_active: false })")
    expect(d).toContain('data-testid="archived-listings"')
    const e = read('app/dashboard/listings/[id]/edit/page.tsx')
    expect(e).toContain("if (archived) patch.status = 'active'")
    expect(e).toContain('data-testid="relist-banner"')
    expect(e).toContain("get('relist') === '1'")
  })
})

describe('#15 the published-listing editor writes only what changed, only at the version it loaded', () => {
  it('changedKeys compares by value', () => {
    expect(changedKeys({ a: 1, b: [1, 2], c: null }, { a: 1, b: [1, 2], c: undefined })).toEqual([])
    expect(changedKeys({ a: 1, b: ['x'] }, { a: 2, b: ['x', 'y'] })).toEqual(['a', 'b'])
  })
  it('a stash older than the row (or without a base) is stale', () => {
    expect(isStaleBase('2026-09-30T10:00:00.123456+00:00', '2026-09-30T10:00:00.123456+00:00')).toBe(false)
    expect(isStaleBase('2026-09-30T10:00:00+00:00', '2026-09-30T11:00:00+00:00')).toBe(true)
    expect(isStaleBase(null, '2026-09-30T11:00:00+00:00')).toBe(true)
  })
  it('the editor’s stale refusal says so in editor words', async () => {
    const { client } = fakeClient({ 'listings:update': { data: [] }, 'listings:maybeSingle': { data: { id: 'a' } } })
    const r = await updateListing(client, 'a', { title: 'x' }, { zh: true, expectedUpdatedAt: 't1', context: 'editor' })
    expect(r.stale).toBe(true)
    expect(r.error).toContain('打开编辑页之后被改过')
  })
  it('the result says live / review / off', () => {
    expect(listingStateAfterSave({ is_active: true, verification_status: 'verified', source: 'stayloop' })).toBe('live')
    expect(listingStateAfterSave({ is_active: true, verification_status: 'pending', source: 'stayloop' })).toBe('review')
    expect(listingStateAfterSave({ is_active: true, verification_status: 'verified', source: 'stayloop', status: 'archived' })).toBe('off')
  })
  it('wiring: diff patch, updated_at guard, base_updated_at in the card stash, stale stash flagged', () => {
    const e = read('app/dashboard/listings/[id]/edit/page.tsx')
    expect(e).toContain('changedKeys(before, after)')
    expect(e).toContain("updateListing(getSupabaseBrowser(), id, patch, { zh, expectedUpdatedAt: baseUpdatedAt, context: 'editor' })")
    expect(e).toContain('isStaleBase(d.base_updated_at')
    expect(e).toContain('data-testid="agent-edit-stale"')
    expect(e).toContain('data-testid="listing-save-outcome"')
    expect(e).not.toMatch(/from\('listings'\)\.update\(\{\s*title: form\.title/)
    expect(read('components/agent/DraftListingChatCard.tsx')).toContain('base_updated_at: form.base_updated_at ?? null')
    expect(read('lib/listingPublish.ts')).toContain("q.select('slug, is_active, verification_status, source, status, updated_at')")
  })
})

describe('#16 one draft slot per user × card; a published draft stays published', () => {
  const draft: DraftListing = { address: '28 Avondale Ave', monthly_rent: 2450, images: ['data:image/jpeg;base64,AAAA'] }
  it('the card key is stable for the same draft and differs between drafts', () => {
    expect(draftCardKey(draft)).toBe(draftCardKey({ ...draft }))
    expect(draftCardKey(draft)).not.toBe(draftCardKey({ ...draft, address: '100 King St W' }))
  })
  it('slots are per user and per card; publishing clears the slot and leaves a done marker', () => {
    const s = memStore()
    const k = draftCardKey(draft)
    expect(saveDraftSlot(s, 'u1', k, { ...draft, unit: '1203' })).toBe(true)
    expect(readDraftSlot(s, 'u1', k)?.unit).toBe('1203')
    expect(readDraftSlot(s, 'u2', k)).toBeNull()
    expect(readDraftSlot(s, 'u1', draftCardKey({ ...draft, address: 'x' }))).toBeNull()
    markDraftDone(s, 'u1', k, { kind: 'published', slug: 'sl', address: draft.address, unit: '1203' })
    expect(readDraftSlot(s, 'u1', k)).toBeNull()
    expect(readDraftDone(s, 'u1', k)?.slug).toBe('sl')
  })
  it('keeps at most three draft slots per user', () => {
    const s = memStore()
    for (let i = 0; i < 5; i++) saveDraftSlot(s, 'u1', `k${i}`, { ...draft, address: `${i} A St` })
    expect([...s._m.keys()].filter((k) => k.startsWith(`${DRAFT_SLOT_PREFIX}u1:`)).length).toBeLessThanOrEqual(3)
    expect(readDraftSlot(s, 'u1', 'k4')?.address).toBe('4 A St')
  })
  it('wiring: no global slot; the editor works on ?card= and marks the card done', () => {
    const c = read('components/agent/DraftListingChatCard.tsx')
    expect(c).not.toContain("const DRAFT_KEY = 'stayloop-draft-listing'")
    expect(c).toContain('readDraftDone(store, uid, cardKey)')
    expect(c).toContain('router.push(`/dashboard/listings/edit?card=${encodeURIComponent(cardKey)}`)')
    const e = read('app/dashboard/listings/edit/page.tsx')
    expect(e).toContain("get('card')")
    expect(e).toContain("markDraftDone(localStorage, user.id, cardKey, { kind: 'published'")
    expect(e).toContain('localStorage.removeItem(LEGACY_DRAFT_KEY)')
    expect(e).not.toContain("router.push('/listings/' + slug)")
  })
})

describe('#14 / #18 one tenancy, one household', () => {
  it('street keys survive abbreviations, commas and folded units', () => {
    expect(streetKey('28 Avondale Avenue, Toronto, ON')).toBe('28 avondale')
    expect(streetKey('28 Avondale Ave')).toBe('28 avondale')
    expect(streetKey('100 King Street West')).toBe('100 king w')
    expect(streetKey('100 King St E')).toBe('100 king e')
    expect(streetKey('1 St Clair Ave W')).toBe('1 st clair w')
    expect(splitAddress('1203 - 28 Avondale Ave')).toEqual({ street: '28 Avondale Ave', unit: '1203' })
    expect(splitAddress('Unit 1203, 28 Avondale Ave')).toEqual({ street: '28 Avondale Ave', unit: '1203' })
    expect(streetKey('Rental unit')).toBeNull()
  })
  it('same address + unit is the same tenancy; another unit or street is not', () => {
    expect(sameTenancyAddress({ address: '28 Avondale Avenue', unit: '#1203' }, { address: '1203-28 Avondale Ave', unit: null })).toBe(true)
    expect(sameTenancyAddress({ address: '28 Avondale Ave', unit: '1203' }, { address: '28 Avondale Ave', unit: '1204' })).toBe(false)
    expect(sameTenancyAddress({ address: '100 King St W', unit: null }, { address: '100 Kingston Rd', unit: null })).toBe(false)
  })
  it('a second signed lease picks the existing household; the tenant email only breaks ties when addresses cannot be compared', () => {
    const cands = [
      { id: 'H1', address: '28 Avondale Ave', unit: '1203', status: 'active', tenant_emails: ['mia@x.com'] },
      { id: 'H2', address: 'Rental unit', unit: null, status: 'active', tenant_emails: ['sam@x.com'] },
      { id: 'H3', address: '5 Bay St', unit: '2', status: 'ended', tenant_emails: [] },
    ]
    // Same unit, different tenant: the previous tenancy, never reused (review 2026-10-01).
    expect(pickHouseholdForLease({ address: '28 Avondale Avenue', unit: '1203', tenant_email: 'x@y.com' }, cands)).toBeNull()
    expect(pickHouseholdForLease({ address: '28 Avondale Avenue', unit: '1203', tenant_email: 'Mia@X.com ' }, cands)).toBe('H1')
    expect(pickHouseholdForLease({ address: '40 Other Rd', unit: '1', tenant_email: 'mia@x.com' }, cands)).toBeNull()
    expect(pickHouseholdForLease({ address: '9 New St', unit: null, tenant_email: 'sam@x.com' }, cands)).toBe('H2')
    expect(pickHouseholdForLease({ address: '5 Bay St', unit: '2', tenant_email: null }, cands)).toBeNull()
  })
  it('the sign route attaches to the managed household before creating a new one', () => {
    const s = read('app/api/lease/sign/route.ts')
    expect(s).toContain('await findManagedHousehold(admin, landlordAuth')
    expect(s).toContain('await attachLeaseToHousehold(admin, attachTo, full, landlordAuth')
    expect(s).toMatch(/if \(attachTo && landlordAuth\) \{[\s\S]*\} else if \(!existing && landlordAuth\) \{/)
    expect(s).toContain("action: 'household_lease_attached_from_esign'")
    expect(s).toMatch(/source: 'esign', verified: true/)
  })
  it('the import page checks the caller’s households first and can correct an unconfirmed import', () => {
    const p = read('app/leases/import/page.tsx')
    expect(p).toContain("supabase.rpc('my_households_for_import')")
    expect(p).toContain('sameTenancyAddress({ address: form.address, unit: form.unit }')
    expect(p).toContain("supabase.rpc('update_household_import'")
    expect(p).toContain('data-testid="import-existing"')
    expect(p).toContain("get('edit')")
    expect(p).not.toContain('upsert: true')
    const m = read('supabase/migrations/20261001_A4_listings_leases_sweep.sql')
    expect(m).toContain('create or replace function public.my_households_for_import()')
    expect(m).toContain("if h.verified then raise exception 'household_verified'")
    expect(m).toContain("if h.created_by <> v_uid then raise exception 'not_creator'")
    expect(m).toMatch(/revoke all on function public\.my_households_for_import\(\) from public, anon;/)
    expect(m).toMatch(/revoke all on function public\.update_household_import\([^)]*\) from public, anon;/)
  })
})

describe('#17 / #20 what a lease row allows', () => {
  const terms = { landlord_legal_name: 'Sarah Wang', rent: { amount: 2800 } }
  it('records without terms can be neither sent nor signed', () => {
    expect(leaseHasTerms({})).toBe(false)
    expect(leaseIsSendable({ status: 'imported', terms: {} })).toBe(false)
    expect(leaseIsSignable({ status: 'active', terms: {} })).toBe(false)
    expect(leaseIsSignable({ status: 'active', terms })).toBe(false)
    expect(leaseIsRecordOnly({ status: 'imported' })).toBe(true)
    expect(leaseIsRecordOnly({ status: 'active', terms: {} })).toBe(true)
  })
  it('a drafted lease flows: edit until sent, withdraw until signed', () => {
    expect(leaseIsSendable({ status: 'draft', terms })).toBe(true)
    expect(leaseIsSignable({ status: 'signed_tenant', terms })).toBe(true)
    expect(leaseIsEditableDraft({ status: 'draft', terms, sent_at: null })).toBe(true)
    expect(leaseIsEditableDraft({ status: 'sent', terms, sent_at: 't' })).toBe(false)
    expect(leaseIsWithdrawable({ status: 'sent', sent_at: 't' })).toBe(true)
    expect(leaseIsWithdrawable({ status: 'sent', tenant_signature: { name: 'x' } })).toBe(false)
    expect(leaseIsWithdrawable({ status: 'imported' })).toBe(false)
  })
  it('route errors become words', () => {
    expect(leaseActionErrorText('lease terms incomplete — fill the form first', true)).toContain('起草这份租约的标准租约')
    expect(leaseActionErrorText('lease_no_terms', false)).toContain('cannot be sent or signed online')
    expect(leaseActionErrorText('lease_not_signable', false)).toContain('no longer waiting')
  })
  it('send and sign routes refuse rows outside the signing flow', () => {
    expect(read('app/api/lease/sign/route.ts')).toContain("if (!leaseIsSignable(lease)) {")
    expect(read('app/api/lease/send/route.ts')).toContain("error: 'lease_not_sendable'")
  })
  it('the detail page gates the controls and shows the imported file + a draft-a-standard-lease action', () => {
    const d = read('app/landlord/leases/[id]/page.tsx')
    expect(d).toContain('{sendable && (')
    expect(d).toContain('{signable && !l.landlord_signature')
    expect(d).toContain("createSignedUrl(pdfPath, 600)")
    expect(d).toContain('href={`/landlord/leases/new?from_lease=${l.id}`}')
    expect(d).toContain('data-testid="lease-edit-draft"')
    expect(d).toContain('data-testid="lease-delete"')
    expect(d).toContain('<SampleBanner')
  })
  it('the drafting form reopens an application’s draft, asks before a replacement, and edits drafts in place', () => {
    const n = read('app/landlord/leases/new/page.tsx')
    expect(n).toContain(".eq('application_id', applicationParam)")
    expect(n).toContain('router.replace(`/landlord/leases/new?edit=${draft.id}&reopened=1`)')
    expect(n).toContain('data-testid="lease-prior"')
    expect(n).toContain("if (priorLease && !replaceOk && !editId)")
    expect(n).toContain(".eq('status', 'draft')")
    expect(n).toContain("searchParams.get('from_lease')")
    expect(read('app/landlord/leases/[id]/edit/page.tsx')).toContain('redirect(`/landlord/leases/new?edit=${encodeURIComponent(id)}`)')
  })
})

describe('#22 / #69 listing triggers', () => {
  const m = read('supabase/migrations/20261001_A4_listings_leases_sweep.sql')
  it('updated_at moves only on content changes (enrich cache / verification stamps do not)', () => {
    expect(m).toContain("'updated_at', 'lat', 'lng', 'transit', 'enriched_at', 'price_history'")
    expect(m).toContain('if (to_jsonb(new) - cache_cols) is distinct from (to_jsonb(old) - cache_cols) then')
    expect(m).toContain('new.updated_at := old.updated_at;')
  })
  it('going off market or archived expires pending showing / inquiry cards with listing_inactive', () => {
    expect(m).toContain('after update of is_active, status on public.listings')
    expect(m).toContain("and a.action_type in ('showing_request', 'listing_inquiry')")
    expect(m).toContain("jsonb_build_object('ok', false, 'reason', 'listing_inactive')")
    expect(m).toContain("and a.metadata ->> 'listing_id' = new.id::text")
    expect(m).toMatch(/revoke all on function public\.expire_listing_showing_cards\(\) from public, anon, authenticated, service_role;/)
  })
})

describe('review 2026-10-01 (A4 follow-ups)', () => {
  it('a household is reused only for the same tenant: invites, the current lease and members all count', () => {
    const prev = { id: 'H1', address: '28 Avondale Ave', unit: '1203', status: 'active', tenant_emails: ['alice@x.com'] }
    expect(pickHouseholdForLease({ address: '28 Avondale Ave', unit: '1203', tenant_email: 'bob@x.com' }, [prev])).toBeNull()
    expect(pickHouseholdForLease({ address: '28 Avondale Ave', unit: '1203', tenant_email: 'alice@x.com' }, [prev])).toBe('H1')
    expect(pickHouseholdForLease({ address: '28 Avondale Ave', unit: '1203', tenant_email: 'alice@x.com' }, [{ ...prev, tenant_emails: [] }])).toBeNull()
    expect(pickHouseholdForLease({ address: '28 Avondale Ave', unit: '1203', tenant_email: '' }, [prev])).toBeNull()
    expect(householdAddressMayMatch({ address: '28 Avondale Ave', unit: '1203' }, { address: '28 Avondale Avenue', unit: '#1203' })).toBe(true)
    expect(householdAddressMayMatch({ address: '28 Avondale Ave', unit: '1203' }, { address: '28 Avondale Ave', unit: '1204' })).toBe(false)
    expect(householdAddressMayMatch({ address: '9 New St', unit: null }, { address: 'Rental unit', unit: null })).toBe(true)
    const r = read('app/api/lease/sign/route.ts')
    expect(r).toContain(".from('household_members').select('household_id, user_id').in('household_id', nearIds).eq('role', 'tenant').eq('status', 'active')")
    expect(r).toContain('admin.auth.admin.getUserById(m.user_id)')
    expect(r).toContain(".from('lease_documents').select('id, tenant_email').in('id', leaseIds)")
  })
  it('an invite that lapsed unanswered does not stop a fresh one; an accepted or open one does', () => {
    const now = Date.parse('2026-10-01T00:00:00Z')
    const base = { invited_email: 'Bob@X.com', declined_at: null, revoked_at: null }
    expect(hasUsableInvite([{ ...base, accepted_at: null, expires_at: '2026-09-20T00:00:00Z' }], 'bob@x.com', now)).toBe(false)
    expect(hasUsableInvite([{ ...base, accepted_at: null, expires_at: '2026-10-10T00:00:00Z' }], 'bob@x.com', now)).toBe(true)
    expect(hasUsableInvite([{ ...base, accepted_at: '2026-09-01T00:00:00Z', expires_at: '2026-09-02T00:00:00Z' }], 'bob@x.com', now)).toBe(true)
    expect(hasUsableInvite([{ ...base, accepted_at: null, expires_at: '2026-10-10T00:00:00Z', revoked_at: 't' }], 'bob@x.com', now)).toBe(false)
    const r = read('app/api/lease/sign/route.ts')
    expect(r).toContain('if (email && !hh.member_emails.includes(email)) {')
    expect(r).toContain('if (!hasUsableInvite((inv ?? []) as InviteRow[], email, Date.now())) {')
  })
  it('the from_lease note says what the matcher does, and the replacement withdraws first', () => {
    const n = read('app/landlord/leases/new/page.tsx')
    expect(n).not.toContain('它会成为这份在管租约的当前租约，不会另建一份')
    expect(n).toContain('如果地址、单元和租客邮箱都与这份在管租约一致')
    expect(n).toContain('这份记录还没有在管租约，双方签署后会为它建立一份')
    const del = n.indexOf(".is('tenant_signature', null)\n        .select('id')")
    const ins = n.indexOf(".from('lease_documents')\n      .insert({")
    expect(del).toBeGreaterThan(0)
    expect(ins).toBeGreaterThan(del)
    expect(n).toContain('旧租约在你保存前已被签署（或状态已变），没有撤回，也没有另建替代租约')
  })
  it('“live” only for a public listing; a listing waiting for review is not called live', () => {
    const e: ExistingListing = { id: 'a', slug: 's', unit: '1203', status: 'active', is_active: true, archived: false }
    expect(existingListingMessage({ ...e, verification_status: 'pending', source: 'stayloop' }, true, '1203')).toContain('等待 Stayloop 审核')
    expect(existingListingMessage({ ...e, verification_status: 'pending', source: 'stayloop' }, true, '1203')).not.toContain('目前在架')
    expect(existingListingMessage({ ...e, verification_status: 'verified', source: 'stayloop' }, false, '1203')).toContain('live and public')
    expect(existingListingMessage({ ...e, verification_status: 'pending', source: 'realtor' }, false, '1203')).toContain('live and public')
  })
  it('a retyped address still finds the old row (abbreviations, folded units)', () => {
    const rows = [
      { id: 'a', slug: 'old', address: '28 Avondale Ave', unit: '1203', status: 'archived', is_active: false },
      { id: 'b', slug: 'fold', address: '1105 - 203 College Street', unit: null, status: 'active', is_active: true, verification_status: 'verified', source: 'stayloop' },
      { id: 'c', slug: 'other', address: '128 Avondale Ave', unit: '1203', status: 'active', is_active: true },
    ]
    expect(matchExistingListing(rows, '28 Avondale Avenue', '#1203')?.id).toBe('a')
    expect(matchExistingListing(rows, '203 College St', '1105')?.id).toBe('b')
    expect(matchExistingListing(rows, '203 College St', '1105')?.verification_status).toBe('verified')
    expect(matchExistingListing(rows, '203 College St', '907')).toBeNull()
    expect(matchExistingListing(rows, '30 Avondale Ave', '1203')).toBeNull()
  })
  it('findExistingListing narrows by house number and decides in JS', async () => {
    const { client, calls } = fakeClient({ 'listings:select': { data: [{ id: 'a', slug: 'old', address: '28 Avondale Ave', unit: '1203', status: 'archived', is_active: false }] } })
    const e = await findExistingListing(client, 'L', '28 Avondale Avenue', '1203')
    expect(e?.id).toBe('a')
    expect(calls.find((c) => c.op === 'ilike')?.args).toEqual(['address', '%28%'])
  })
  it('the card key survives a JSON round-trip (undefined fields)', () => {
    const d = { address: 'a', monthly_rent: 1, foo: undefined } as unknown as DraftListing
    expect(draftCardKey(d)).toBe(draftCardKey(JSON.parse(JSON.stringify(d))))
    expect(draftCardKey({ address: 'a', monthly_rent: 1, unit: null } as unknown as DraftListing)).not.toBe(draftCardKey({ address: 'a', monthly_rent: 1 } as DraftListing))
  })
  it('the wizard says “not published” next to the button and scrolls the offer into view', () => {
    const w = read('app/dashboard/listings/new/page.tsx')
    expect(w).toContain('data-testid="publish-existing-note"')
    expect(w).toContain("existingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })")
  })
  it('the draft editor resolves a signed-out visitor instead of “…” forever', () => {
    const e = read('app/dashboard/listings/edit/page.tsx')
    expect(e).toContain('if (!user) { setResolved(true); return }')
    expect(e).toContain('if (authLoading) return')
  })
  it('send / sign answer “no terms” and “not waiting any more” with different codes, and the page reloads on the latter', () => {
    const send = read('app/api/lease/send/route.ts')
    expect(send).toContain("error: 'lease_no_terms'")
    expect(send).toContain("error: 'lease_not_sendable', detail: 'this lease is no longer waiting to be sent (signed or ended)'")
    expect(read('app/api/lease/sign/route.ts')).toContain("error: 'lease_no_terms'")
    expect(leaseActionErrorText('lease_not_sendable', true)).toContain('已不在待发送')
    expect(leaseActionErrorText('lease_not_sendable', true)).not.toContain('没有完整的条款文档')
    expect(leaseErrorNeedsReload('lease_not_sendable')).toBe(true)
    expect(leaseErrorNeedsReload('lease_no_terms')).toBe(false)
    expect(read('app/landlord/leases/[id]/page.tsx')).toContain('if (leaseErrorNeedsReload(j.error)) await load()')
  })
})
