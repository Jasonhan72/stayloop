// @vitest-environment jsdom
// V0.9 (2026-11-23, user: 「专业服务里的每一项里，也要有 test 的入驻服务商，另外所有的 test 的服务商都要有
// 卡通的头像和里面的 demo 内容，看起来都要内容充实和美观」).
//  A. a provider's record gains what the agent profile already had — a photo or logo, an
//     introduction, languages — entered by the provider on /provider/onboard and shown on the card
//     and the page. The photo key has one writer (POST /api/providers/photo) and is guarded in the DB;
//  B. the seeded "[TEST]" entries get drawn avatars and demo content from scripts/demo/ — a script
//     that only ever touches rows named "[TEST] …".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')
const ID = '55555555-5555-4555-8555-555555555555'
const OTHER = '66666666-6666-4666-8666-666666666666'

const state = vi.hoisted(() => ({
  id: '55555555-5555-4555-8555-555555555555',
  lang: 'zh' as 'zh' | 'en',
  auth: { user: null as null | { id: string }, loading: false, role: null as string | null },
  hats: { loading: false, tenant: true, landlord: false, agent: null as string | null, provider: null as string | null, admin: false },
  tables: {} as Record<string, unknown[]>,
}))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: state.id }) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => state.auth }))
vi.mock('@/lib/useHats', () => ({ useHats: () => state.hats, activeHat: () => 'tenant' }))
vi.mock('@/lib/marketplace/config', () => ({ useMarketplaceConfig: () => ({ graceDays: 0, quoteHoursDefault: 24 }) }))
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header') }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const rows = () => state.tables[table] ?? []
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'limit', 'in', 'overlaps', 'eq', 'order']) q[m] = () => q
    q.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    q.then = (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok)
    return q
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: null } }) } } }
})

import ProviderProfilePage from '../app/providers/[id]/page'
import ProviderCard from '../components/directory/ProviderCard'
import ProviderAvatar from '../components/directory/ProviderAvatar'
import ProviderPhotoControl from '../components/provider/ProviderPhotoControl'
import { PROVIDER_PHOTO_BUCKET, isProviderPhotoKey, isProviderPhotoKeyOf, providerPhotoUrl } from '../lib/providerPhotoKeys'
import { AGENT_PHOTO_BUCKET } from '../lib/agentPhotoKeys'

afterEach(() => {
  cleanup()
  state.id = ID
  state.lang = 'zh'
  state.auth = { user: null, loading: false, role: null }
  state.tables = {}
})

const KEY = `${ID}/demo0123456789abcdef.webp`
const flush = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }) }

// ───────────────────────────────────────────────────────────── A. the three new fields

describe('a provider photo key: our bucket only, the provider’s own folder only', () => {
  it('the shape is <provider id>/<id>.webp|jpg and the URL is built from it', () => {
    expect(PROVIDER_PHOTO_BUCKET).toBe('provider-photos')
    expect(PROVIDER_PHOTO_BUCKET).not.toBe(AGENT_PHOTO_BUCKET)
    expect(isProviderPhotoKey(KEY)).toBe(true)
    expect(isProviderPhotoKey(`${ID}/abcdefgh.jpg`)).toBe(true)
    for (const bad of [null, undefined, '', 'x.webp', `${ID}/a.webp`, `${ID}/abcdefgh.png`, `${ID}/../x/abcdefgh.webp`, `https://evil.example/${KEY}`, `${ID}/ABCDEFGH.webp`]) expect(isProviderPhotoKey(bad), String(bad)).toBe(false)
    expect(providerPhotoUrl(KEY)).toMatch(new RegExp(`/storage/v1/object/public/provider-photos/${ID}/demo0123456789abcdef\\.webp$`))
    expect(providerPhotoUrl('https://evil.example/x.webp')).toBeNull()
    expect(providerPhotoUrl(null)).toBeNull()
  })
  it('a key counts as a provider’s own only inside that provider’s folder', () => {
    expect(isProviderPhotoKeyOf(KEY, ID)).toBe(true)
    expect(isProviderPhotoKeyOf(KEY, ID.toUpperCase())).toBe(true)
    expect(isProviderPhotoKeyOf(KEY, OTHER)).toBe(false)
    expect(isProviderPhotoKeyOf('nope', ID)).toBe(false)
  })
})

describe('the migration: three columns, a guarded key, a bucket only the server writes', () => {
  const sql = read('supabase/migrations/20261123_provider_profile_content.sql')
  it('bio ≤ 800, languages ≤ 8, and a photo key that can only be one of ours', () => {
    expect(sql).toContain('add column if not exists bio text')
    expect(sql).toContain("add column if not exists languages text[] not null default '{}'")
    expect(sql).toContain('add column if not exists photo_key text')
    expect(sql).toContain('check (bio is null or char_length(bio) <= 800)')
    expect(sql).toContain('check (cardinality(languages) <= 8)')
    expect(sql).toMatch(/service_providers_photo_key_format[\s\S]{0,80}check \(photo_key is null or photo_key ~ '\^\[0-9a-f\]\{8\}-/)
  })
  it('a direct client write can neither set the key on insert nor change it on update; the old protections stay', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.guard_service_provider_fields()'), sql.indexOf('create or replace view public.provider_directory'))
    expect(fn).toContain('if public.is_direct_client_write() and not public.is_stayloop_admin() then')
    expect(fn).toContain('new.photo_key := null;')
    expect(fn).toContain('new.photo_key := old.photo_key;')
    expect(fn).toContain('new.status := old.status; new.verified_at := old.verified_at; new.verified_by := old.verified_by; new.review_note := old.review_note;')
    expect(fn).toContain('new.auth_id := old.auth_id;')
    // the introduction and the languages are not registered facts: changing them does not re-verify
    expect(fn).toContain('if new.legal_name is distinct from old.legal_name or new.business_number is distinct from old.business_number or new.trades is distinct from old.trades then')
    expect(fn).not.toMatch(/new\.bio|new\.languages/)
    // an invoker function, as the rule for guard triggers says
    expect(fn).not.toMatch(/SECURITY DEFINER/i)
  })
  it('the bucket is public to read and has no policy for the browser to write; the directory view stays read-only and signed-in only', () => {
    expect(sql).toContain("values ('provider-photos', 'provider-photos', true, 1048576, array['image/webp', 'image/jpeg'])")
    expect(sql).not.toMatch(/create policy/i)
    const view = sql.slice(sql.indexOf('create or replace view public.provider_directory'))
    expect(view).toContain('with (security_invoker = false)')
    expect(view).toMatch(/status,\s+bio,\s+languages,\s+photo_key\s+from public\.service_providers/)
    expect(view).toContain('revoke all on public.provider_directory from public, anon;')
    expect(view).toContain('revoke insert, update, delete, truncate, references, trigger on public.provider_directory from authenticated;')
    expect(view).not.toMatch(/to anon/)
  })
})

describe('POST / DELETE /api/providers/photo — the only writer of the key', () => {
  const route = read('app/api/providers/photo/route.ts')
  it('signed-in accounts with a provider record only; the record is found by the account, never by the request', () => {
    expect(route).toContain("if (!uid) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })")
    expect(route).toContain(".from('service_providers').select('id, photo_key').eq('auth_id', uid).maybeSingle()")
    expect(route).toContain("if (!cur) return NextResponse.json({ error: 'provider_record_required' }, { status: 403, headers: NO_STORE })")
    expect(route).not.toMatch(/searchParams|provider_id|fd\.get\('(id|provider)/)
  })
  it('the bytes are sniffed, the size capped, the upload rate-limited closed, and the key sits in the provider’s own folder', () => {
    expect(route).toContain('const ext = sniffPhoto(bytes)')
    expect(route).toContain('if (file.size > PROVIDER_PHOTO_MAX_BYTES)')
    expect(route).toContain('underHourlyLimit(`provider-photo:${uid}`, PER_USER_PER_HOUR, false)')
    expect(route).toContain('const key = `${cur.id}/${id}.${ext}`')
    expect(route).toContain(".update({ photo_key: key }).eq('id', cur.id).eq('auth_id', uid)")
    // only a file in this provider's folder is ever removed
    expect(route.match(/isProviderPhotoKeyOf\(cur\.key, cur\.id\)/g)?.length).toBe(2)
  })
  it('the route audit probes both verbs for an anonymous caller', () => {
    const audit = read('scripts/route-audit.mjs')
    expect(audit).toContain("await probe('provider photo POST anon → 401', `${BASE}/api/providers/photo`")
    expect(audit).toContain("await probe('provider photo DELETE anon → 401', `${BASE}/api/providers/photo`")
  })
})

describe('the photo, the languages and the introduction on the card and the page', () => {
  it('the avatar shows the photo when there is one, the initial when there is not', () => {
    const url = providerPhotoUrl(KEY) as string
    let r = render(<ProviderAvatar name="[TEST] Northline" size={88} photoUrl={url} />)
    const img = only<HTMLImageElement>(r.container, 'img[data-testid="provider-photo"]')
    expect(img.getAttribute('src')).toBe(url)
    expect(img.getAttribute('alt')).toBe('')
    expect(img.className).toContain('rounded-2xl')
    expect(all(r.container, '[data-testid="provider-avatar"]').length).toBe(0)
    cleanup()
    r = render(<ProviderAvatar name="[TEST] Northline" size={88} />)
    expect(textOf(only(r.container, '[data-testid="provider-avatar"]'))).toBe('N')
  })
  it('the card: photo in place of the initial, languages after the trades', () => {
    const { container: c } = render(<ProviderCard id={ID} name="[TEST] Northline" zh badge={{ ok: true, label: '资质已核' }} chips={[{ key: 'plumbing', label: '水管', ok: true }]} cities={['Toronto']} photoUrl={providerPhotoUrl(KEY)} languages={['en', 'zh']} />)
    only(c, 'img[data-testid="provider-photo"]')
    expect(all(c, '[data-testid="provider-card-chips"] span').map(textOf)).toEqual(['水管', '英语', '普通话'])
    expect(all(c, '[data-testid="provider-card-language"]').length).toBe(2)
  })
  it('both lists read the two fields for the card', () => {
    for (const f of ['app/providers/page.tsx', 'app/providers/professional/page.tsx']) {
      const s = read(f)
      expect(s, f).toContain('verified_at, languages, photo_key')
      expect(s, f).toContain('photoUrl={providerPhotoUrl(p.photo_key)}')
      expect(s, f).toContain('languages={p.languages}')
    }
  })
  it('the page: the photo in the head, 关于我们 and the languages — and neither section when the provider wrote nothing', async () => {
    const row = { id: ID, legal_name: '[TEST] Northline Home Services Inc.', trade_name: '[TEST] Northline Home Services', trades: ['handyman'], service_cities: ['Toronto'], pricing_mode: 'hourly', call_out_fee: 75, hourly_rate: 110, contact_email: null, contact_phone: null, website: null, verified_at: '2026-10-01T00:00:00Z', bio: '[TEST] 测试服务商资料。\n\n第二段。', languages: ['en', 'yue'], photo_key: KEY }
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    state.tables = { provider_directory: [row] }
    let r = render(<ProviderProfilePage />)
    await flush()
    expect(all(only(r.container, '[data-testid="provider-profile-head"]'), 'img[data-testid="provider-photo"]').length).toBe(2) // one per breakpoint
    const about = only(r.container, '[data-testid="provider-profile-about"]')
    expect(textOf(only(about, 'h2'))).toBe('关于我们')
    expect(only(about, 'p').className).toContain('whitespace-pre-line')
    expect(textOf(about)).toContain('第二段。')
    expect(all(only(r.container, '[data-testid="provider-profile-languages"]'), 'span').map(textOf)).toEqual(['英语', '粤语'])
    cleanup()
    state.tables = { provider_directory: [{ ...row, bio: '  ', languages: [], photo_key: null }] }
    r = render(<ProviderProfilePage />)
    await flush()
    expect(all(r.container, '[data-testid="provider-profile-about"], [data-testid="provider-profile-languages"], img[data-testid="provider-photo"]').length).toBe(0)
    expect(all(r.container, '[data-testid="provider-avatar"]').length).toBe(2)
  })
  it('a key that is not ours never becomes an image', async () => {
    state.auth = { user: { id: 'u1' }, loading: false, role: 'tenant' }
    state.tables = { provider_directory: [{ id: ID, legal_name: 'X Repairs', trade_name: null, trades: ['handyman'], service_cities: [], pricing_mode: 'hourly', call_out_fee: null, hourly_rate: null, verified_at: null, bio: null, languages: null, photo_key: 'https://evil.example/pixel.webp' }] }
    const r = render(<ProviderProfilePage />)
    await flush()
    only(r.container, '[data-testid="provider-profile-head"]')
    expect(all(r.container, 'img').length).toBe(0)
  })
})

describe('/provider/onboard: the provider fills the three in themselves', () => {
  const page = read('app/provider/onboard/page.tsx')
  it('an introduction (capped), languages (the agent list, cleaned) and the photo control once a record exists', () => {
    expect(page).toContain('data-testid="onboard-bio"')
    expect(page).toContain('maxLength={BIO_MAX}')
    expect(page).toContain('if (f.bio.trim().length > BIO_MAX) return setErr(')
    expect(page).toContain('bio: f.bio.trim() || null, languages: cleanLanguages(f.languages)')
    expect(page).toContain('{AGENT_LANGUAGES.map((l) => {')
    expect(page).toContain('<ProviderPhotoControl zh={zh}')
    expect(page).toContain('data-testid="onboard-photo-later"')
    // the payload never carries the key: only the route writes it
    const payload = page.slice(page.indexOf('const payload = {'), page.indexOf('const { error } = row && row !=='))
    expect(payload).not.toContain('photo_key')
    // a verified provider can open their own page from here
    expect(page).toContain('<Link href={providerHref(row.id)}')
  })
  it('the control: upload → the route; remove is a two-step in page, no native dialog', () => {
    const src = read('components/provider/ProviderPhotoControl.tsx')
    expect(src).toContain("fetch('/api/providers/photo', { method: 'POST'")
    expect(src).toContain("fetch('/api/providers/photo', { method: 'DELETE'")
    expect(src).not.toMatch(/window\.confirm|alert\(/)
    const { container: c } = render(<ProviderPhotoControl zh name="[TEST] Northline" photoUrl={providerPhotoUrl(KEY)} onChange={() => undefined} />)
    only(c, 'img[data-testid="provider-photo"]')
    expect(textOf(only(c, '[data-testid="provider-photo-upload"]'))).toBe('换一张')
    expect(all(c, '[data-testid="provider-photo-remove-confirm"]').length).toBe(0)
    act(() => { only<HTMLButtonElement>(c, '[data-testid="provider-photo-remove"]').click() })
    expect(textOf(only(c, '[data-testid="provider-photo-remove-confirm"]'))).toContain('移除图片，改回首字母？')
    cleanup()
    const en = render(<ProviderPhotoControl zh={false} name="Northline" photoUrl={null} onChange={() => undefined} />)
    expect(en.container.textContent).not.toMatch(/[一-鿿]/)
    expect(textOf(only(en.container, '[data-testid="provider-photo-upload"]'))).toBe('Upload an image')
  })
})

// ───────────────────────────────────────────────────────────── B. the seeded entries

describe('scripts/demo — drawn avatars and demo content for the "[TEST]" entries', () => {
  it('thirteen avatars, each a self-contained 512px SVG with no outside reference', async () => {
    const mod = (await import(/* @vite-ignore */ pathToFileURL(resolve('scripts/demo/avatars.mjs')).href)) as { AVATARS: Record<string, Record<string, unknown>>; avatarSvg: (s: Record<string, unknown>) => string }
    const ids = Object.keys(mod.AVATARS)
    expect(ids.length).toBe(13)
    const seen = new Set<string>()
    for (const id of ids) {
      const svg = mod.avatarSvg(mod.AVATARS[id])
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'), id).toBe(true)
      expect(svg.endsWith('</svg>'), id).toBe(true)
      expect(svg, id).not.toMatch(/<image|<script|href=|url\(\s*['"]?https?:|undefined|NaN/)
      seen.add(svg)
    }
    expect(seen.size).toBe(13) // no two alike
  })
  const seed = read('scripts/demo/seed-directory.mjs')
  it('the seed only ever touches rows named "[TEST] …", and every avatar it names exists', async () => {
    expect(seed.match(/if \(!isTest\((row|existing)\.legal_name\)\) throw new Error\('refusing a non-test/g)?.length).toBe(2)
    expect(seed).toContain("if (existing && !isTest(existing.legal_name)) throw new Error('refusing a non-test provider row')")
    expect(seed).toContain("if (!isTest(p.legal_name)) throw new Error('seed rows must be named [TEST] …')")
    for (const m of seed.matchAll(/legal_name: '([^']+)'/g)) expect(m[1].startsWith('[TEST] '), m[1]).toBe(true)
    const mod = (await import(/* @vite-ignore */ pathToFileURL(resolve('scripts/demo/avatars.mjs')).href)) as { AVATARS: Record<string, unknown> }
    const named = Array.from(seed.matchAll(/avatar: '([a-z-]+)'/g)).map((m) => m[1])
    expect(named.length).toBe(13)
    expect(new Set(named).size).toBe(13)
    for (const id of named) expect(Object.keys(mod.AVATARS), id).toContain(id)
  })
  it('two test providers in each professional category, with the licence that category needs', () => {
    for (const [trade, licence] of [['photographer_floorplan', 'business_registration'], ['insurance_broker', 'ribo_licence'], ['paralegal', 'lso_paralegal'], ['lawyer', 'lso_lawyer']] as const) {
      expect(seed.match(new RegExp(`trades: \\['${trade}'\\]`, 'g'))?.length, trade).toBe(2)
      expect(seed.match(new RegExp(`\\['${licence}', 'TEST-`, 'g'))?.length, licence).toBe(2)
    }
  })
  it('their accounts are test accounts with no password, on our own domain; nothing secret is printed or written', () => {
    expect(seed).toContain("if (!/^pro-[a-z]+-test@stayloop\\.ai$/.test(email)) throw new Error('not a demo provider address: ' + email)")
    expect(seed).toContain('createUser({ email, email_confirm: true, user_metadata: { test_account: true, demo_provider: true, full_name: name } })')
    // no password is ever passed to the admin API
    const call = seed.slice(seed.indexOf('admin.auth.admin.createUser('), seed.indexOf('if (error || !data?.user)'))
    expect(call.length).toBeGreaterThan(40)
    expect(call).not.toMatch(/password/i)
    // and no password is assigned anywhere else in the script
    expect(seed).not.toMatch(/password\s*[:=]\s*['"`]/i)
    for (const m of seed.matchAll(/email: '([^']+)'/g)) expect(m[1]).toMatch(/^pro-[a-z]+-test@stayloop\.ai$/)
    // fictional numbers only (555-01xx), no made-up website
    for (const m of seed.matchAll(/phone: '([^']+)'/g)) expect(m[1]).toMatch(/^416-555-01\d\d$/)
    expect(seed).toContain('website: null')
    expect(seed).not.toMatch(/console\.log\([^)]*(SERVICE_ROLE|env\.)/)
    // demo text says it is demo text
    for (const m of seed.matchAll(/bio: '([^']+)'/g)) expect(m[1].startsWith('[TEST] 测试'), m[1].slice(0, 20)).toBe(true)
  })
})
