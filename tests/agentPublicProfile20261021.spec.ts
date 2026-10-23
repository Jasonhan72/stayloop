// Public agent profiles (2026-10-21): /agents, /agents/<slug>, the contact relay and the
// agent's own settings. Modelled on HouseSigma's agent pages, built from Stayloop data only.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PUBLIC_AGENT_COLUMNS, bioProblem, cleanAreas, cleanFocus, cleanLanguages, initials, isPublishable, isValidSlug,
  matchesDirectoryFilter, normalizeSlug, suggestSlug, toPublicAgent, type AgentProfileRow,
} from '@/lib/agentPublic'

const read = (p: string) => readFileSync(p, 'utf8')

function row(extra: Partial<AgentProfileRow> = {}): AgentProfileRow {
  return {
    auth_id: '4388a326-5e19-43c7-81ac-80abbdc91d21', legal_name: '[TEST] Sheng Agent', reco_number: '1234567', category: 'broker',
    brokerage_name: '[TEST] Maple Realty Inc., Brokerage', crea_member: true, status: 'verified', verified_at: '2026-10-01T00:00:00Z',
    expires_at: null, created_at: '2026-09-14T12:00:00Z', public_profile: true, profile_slug: 'test-agent-4388', bio: 'Rentals in North York.',
    languages: ['zh', 'en', 'xx'], service_areas: ['North York', 'north york', ' Markham '], focus: ['tenant_rep', 'nope'], show_activity: false,
    ...extra,
  }
}

describe('slugs, bio rules and list cleaning', () => {
  it('suggests a readable slug, falls back for Chinese-only names, validates like the DB', () => {
    expect(suggestSlug('Sheng Chu', '4388a326-...')).toBe('sheng-chu-4388')
    expect(suggestSlug('José Núñez', 'abcd1234')).toBe('jose-nunez-abcd')
    expect(suggestSlug('褚胜', 'ffee0011')).toBe('agent-ffee')
    expect(normalizeSlug('  My Page!! 2026 ')).toBe('my-page-2026')
    for (const ok of ['abc', 'sheng-chu-4388', 'a1-b2']) expect(isValidSlug(ok)).toBe(true)
    for (const bad of ['ab', 'Abc', '-abc', 'abc-', 'a--b', 'a b', 'x'.repeat(61), 42]) expect(isValidSlug(bad)).toBe(false)
  })
  it('keeps links, email addresses and phone numbers out of the bio', () => {
    expect(bioProblem('Seven years in rentals around Yonge & Eglinton.')).toBeNull()
    expect(bioProblem('See www.example.com')).toBe('contact_details')
    expect(bioProblem('https://x.y')).toBe('contact_details')
    expect(bioProblem('mail me a@b.ca')).toBe('contact_details')
    expect(bioProblem('call 416-555-0199')).toBe('contact_details')
    expect(bioProblem('2 bedrooms, 3 years, 10 clients')).toBeNull()
    expect(bioProblem('x'.repeat(801))).toBe('too_long')
  })
  it('cleans languages, focus and areas to the allowed sets and sizes', () => {
    expect(cleanLanguages(['zh', 'en', 'zh', 'xx'])).toEqual(['zh', 'en'])
    expect(cleanFocus(['tenant_rep', 'bogus'])).toEqual(['tenant_rep'])
    expect(cleanAreas(['North York', 'north york', ' Markham ', 'x', 42])).toEqual(['North York', 'Markham'])
    expect(cleanAreas(Array.from({ length: 20 }, (_, i) => `Area ${i}`))).toHaveLength(12)
    expect(initials('Sheng Chu')).toBe('SC')
    expect(initials('褚胜')).toBe('褚')
    expect(initials('[TEST] Agent Person')).toBe('AP')
    expect(initials('  ')).toBe('?')
  })
})

describe('what is public', () => {
  it('only a published, verified, unexpired profile with a slug is shown', () => {
    const now = new Date('2026-10-21T12:00:00Z')
    expect(isPublishable(row(), now)).toBe(true)
    expect(isPublishable(row({ status: 'renewal_due' }), now)).toBe(true)
    expect(isPublishable(row({ public_profile: false }), now)).toBe(false)
    expect(isPublishable(row({ profile_slug: null }), now)).toBe(false)
    for (const s of ['pending', 'rejected', 'expired'] as const) expect(isPublishable(row({ status: s }), now)).toBe(false)
    expect(isPublishable(row({ expires_at: '2026-10-20' }), now)).toBe(false)
    expect(isPublishable(row({ expires_at: '2026-10-21' }), now)).toBe(true)
  })
  it('the public shape carries no auth id or contact details, and cleans the lists', () => {
    const p = toPublicAgent(row())
    expect(Object.keys(p).sort()).toEqual(['bio', 'brokerage_name', 'category', 'crea_member', 'focus', 'joined', 'languages', 'name', 'photo_url', 'reco_number', 'service_areas', 'slug', 'status', 'verified_at'])
    expect(p.languages).toEqual(['zh', 'en'])
    expect(p.service_areas).toEqual(['North York', 'Markham'])
    expect(p.joined).toBe('2026-09')
    for (const c of ['business_email', 'business_phone', 'review_note', 'attested_at', 'trade_name']) expect(PUBLIC_AGENT_COLUMNS).not.toContain(c)
  })
  it('directory filters by language, focus and area', () => {
    const p = toPublicAgent(row())
    expect(matchesDirectoryFilter(p, { language: 'zh' })).toBe(true)
    expect(matchesDirectoryFilter(p, { language: 'fr' })).toBe(false)
    expect(matchesDirectoryFilter(p, { focus: 'landlord_rep' })).toBe(false)
    expect(matchesDirectoryFilter(p, { area: 'north' })).toBe(true)
    expect(matchesDirectoryFilter(p, { area: 'Vaughan' })).toBe(false)
  })
})

// ── routes ───────────────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  limit: vi.fn(async (_k: string, _n: number, _f: boolean) => true),
  user: null as null | { id: string; email: string; is_anonymous?: boolean },
  agentRow: null as AgentProfileRow | null,
  clients: [] as Record<string, any>[],
  inserted: [] as Record<string, any>[],
  audit: [] as Record<string, any>[],
  ensureThread: vi.fn(async () => ({ id: 'thread-1', kind: 'agent_client', ref_id: 'c1', household_id: null, title: 't', listing_id: null, subject_user: null })),
  postSystemMessage: vi.fn(async () => 91),
  notify: vi.fn(async () => ({ pushed: 1, emailed: 0 })),
}))
vi.mock('@/lib/rateLimit', () => ({ underHourlyLimit: (k: string, n: number, f: boolean) => h.limit(k, n, f) }))
vi.mock('@/lib/threads/server', () => ({
  displayNameFor: async () => '[TEST] Tenant',
  ensureThread: (...a: unknown[]) => (h.ensureThread as any)(...a),
  postSystemMessage: (...a: unknown[]) => (h.postSystemMessage as any)(...a),
  notifyThreadParties: (...a: unknown[]) => (h.notify as any)(...a),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const from = (table: string) => {
      const f: Record<string, any> = {}
      const q: any = {
        select: () => q, eq: (k: string, v: any) => ((f[k] = v), q), in: () => q, not: () => q, or: () => q, order: () => q, limit: () => q,
        ilike: (k: string, v: string) => ((f[`ilike:${k}`] = v), q),
        maybeSingle: async () => {
          if (table === 'agent_profiles') return { data: h.agentRow && f.profile_slug === h.agentRow.profile_slug ? h.agentRow : null }
          if (table === 'agent_clients') return { data: h.inserted[h.inserted.length - 1] ?? null }
          return { data: null }
        },
        insert: (r: Record<string, any>) => {
          if (table === 'agent_audit_events') { h.audit.push(r); return Promise.resolve({ error: null }) }
          if (table === 'agent_clients') { const x = { id: 'c-new', ...r }; h.inserted.push(x); h.clients.push(x) }
          return { select: () => ({ maybeSingle: async () => ({ data: table === 'agent_clients' ? { id: 'c-new' } : null, error: null }) }) }
        },
        update: () => ({ eq: async () => ({ error: null }) }),
        then: (res: (v: unknown) => unknown) => {
          if (table === 'agent_clients' && f['ilike:email'] === undefined) return Promise.resolve({ data: [], count: 3 }).then(res)
          if (table === 'agent_clients') return Promise.resolve({ data: h.clients.filter((c) => c.agent_auth_id === f.agent_auth_id && c.email === f['ilike:email']).map((c) => ({ id: c.id })) }).then(res)
          if (table === 'landlords' || table === 'listings') return Promise.resolve({ data: [] }).then(res)
          return Promise.resolve({ data: [], count: 3 }).then(res)
        },
      }
      return q
    }
    return { from, auth: { getUser: async () => ({ data: { user: h.user } }) } }
  },
}))

const req = (url: string, init: RequestInit = {}) => new Request(`https://www.stayloop.ai${url}`, init)
const post = (body: unknown, auth = true) => req('/api/agents/test-agent-4388/contact', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer t' } : {}) }, body: JSON.stringify(body),
})
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) })

beforeEach(() => {
  h.limit.mockReset(); h.limit.mockImplementation(async () => true)
  h.user = { id: 'tenant-1', email: 'Tenant@Example.test' }
  h.agentRow = row()
  h.clients = []; h.inserted = []; h.audit = []
  h.ensureThread.mockClear(); h.postSystemMessage.mockClear(); h.notify.mockClear()
})

describe('GET /api/agents/<slug>', () => {
  it('a published profile returns public fields only; activity only when the agent opted in', async () => {
    const { GET } = await import('@/app/api/agents/[slug]/route')
    let res = await GET(req('/api/agents/test-agent-4388'), ctx('test-agent-4388'))
    let j = await res.json()
    expect(res.status).toBe(200)
    expect(j.agent.slug).toBe('test-agent-4388')
    expect(JSON.stringify(j)).not.toContain('4388a326')
    expect(j.activity).toBeNull()
    h.agentRow = row({ show_activity: true })
    res = await GET(req('/api/agents/test-agent-4388'), ctx('test-agent-4388'))
    j = await res.json()
    expect(j.activity).toEqual({ clients: 3, confirmed_delegations: 3, listings: 0 })
  })
  it('unpublished, unverified or malformed → 404', async () => {
    const { GET } = await import('@/app/api/agents/[slug]/route')
    h.agentRow = row({ public_profile: false })
    expect((await GET(req('/x'), ctx('test-agent-4388'))).status).toBe(404)
    h.agentRow = row({ status: 'pending' })
    expect((await GET(req('/x'), ctx('test-agent-4388'))).status).toBe(404)
    expect((await GET(req('/x'), ctx('Bad Slug'))).status).toBe(404)
  })
})

describe('POST /api/agents/<slug>/contact', () => {
  it('needs a signed-in user', async () => {
    const { POST } = await import('@/app/api/agents/[slug]/contact/route')
    expect((await POST(post({ role: 'tenant', message: 'hello there agent' }, false), ctx('test-agent-4388'))).status).toBe(401)
    h.user = null
    expect((await POST(post({ role: 'tenant', message: 'hello there agent' }), ctx('test-agent-4388'))).status).toBe(401)
  })
  it('validates role and length, refuses your own profile, and fails closed on the mail limiter', async () => {
    const { POST } = await import('@/app/api/agents/[slug]/contact/route')
    expect((await POST(post({ role: 'x', message: 'hello there agent' }), ctx('test-agent-4388'))).status).toBe(400)
    expect((await POST(post({ role: 'tenant', message: 'short' }), ctx('test-agent-4388'))).status).toBe(400)
    h.user = { id: h.agentRow!.auth_id, email: 'agent@example.test' }
    expect((await POST(post({ role: 'tenant', message: 'hello there agent' }), ctx('test-agent-4388'))).status).toBe(400)
    h.user = { id: 'tenant-1', email: 'tenant@example.test' }
    h.limit.mockImplementation(async (k: string) => !k.startsWith('agent-contact:u:'))
    expect((await POST(post({ role: 'tenant', message: 'hello there agent' }), ctx('test-agent-4388'))).status).toBe(429)
    expect(h.limit.mock.calls.filter((c) => String(c[0]).startsWith('agent-contact:')).every((c) => c[2] === false)).toBe(true)
  })
  it('creates the client (lower-cased email), opens the agent_client thread, posts as the person and notifies', async () => {
    const { POST } = await import('@/app/api/agents/[slug]/contact/route')
    const res = await POST(post({ role: 'tenant', message: 'Looking for a 2-bed near Finch, May 1.', area: 'North York', budget: '$2,800' }), ctx('test-agent-4388'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, thread_id: 'thread-1', new_client: true })
    expect(h.inserted[0]).toMatchObject({ agent_auth_id: h.agentRow!.auth_id, email: 'tenant@example.test', client_role: 'tenant', area: 'North York', budget: '$2,800', stage: 'searching' })
    expect(h.ensureThread).toHaveBeenCalledWith(expect.anything(), 'agent_client', 'c-new', expect.objectContaining({ createdBy: 'tenant-1' }))
    expect(h.postSystemMessage).toHaveBeenCalledWith(expect.anything(), 'thread-1', expect.objectContaining({ kind: 'message', senderId: 'tenant-1', senderKind: 'tenant', channel: 'app' }))
    expect(h.notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'thread-1' }), expect.objectContaining({ messageId: 91, exceptUserId: 'tenant-1' }))
    expect(h.audit[0]).toMatchObject({ action: 'agent_profile_contact', target_type: 'agent_client' })
  })
  it('an existing client of this agent is reused, not duplicated', async () => {
    const { POST } = await import('@/app/api/agents/[slug]/contact/route')
    h.clients = [{ id: 'c-old', agent_auth_id: h.agentRow!.auth_id, email: 'tenant@example.test' }]
    const res = await POST(post({ role: 'tenant', message: 'Following up on my search.' }), ctx('test-agent-4388'))
    expect(await res.json()).toMatchObject({ ok: true, new_client: false })
    expect(h.inserted).toHaveLength(0)
    expect(h.ensureThread).toHaveBeenCalledWith(expect.anything(), 'agent_client', 'c-old', expect.anything())
  })
})

describe('wiring', () => {
  it('the migration keeps the profile opt-in, checks formats, and exposes the slug only when published', () => {
    const m = read('supabase/migrations/20261021_agent_public_profile.sql')
    expect(m).toMatch(/public_profile\s+boolean not null default false/)
    expect(m).toContain('agent_profiles_slug_format')
    expect(m).toContain('agent_profiles_public_needs_slug')
    expect(m).toMatch(/case when ap\.public_profile then ap\.profile_slug end as profile_slug/)
    expect(m).toMatch(/revoke insert, update, delete, truncate on public\.agent_directory from public, anon, authenticated/)
  })
  it('the profile page names the descriptor and brokerage prominently and says Stayloop is not a brokerage', () => {
    const p = read('app/agents/[slug]/page.tsx')
    expect(p).toContain('data-testid="agent-profile-brokerage"')
    expect(p).toMatch(/categoryLabel\(agent\.category, L\)\}\{agent\.crea_member \? ' · REALTOR®' : ''\} · \{agent\.brokerage_name\}/)
    expect(p).toContain('Stayloop 不是经纪公司')
    expect(p).not.toMatch(/business_email|business_phone/)
  })
  it('entry points: listing page, agent picker, footer, route audit', () => {
    expect(read('app/listings/[slug]/page.tsx')).toContain("select('auth_id, profile_slug')")
    expect(read('components/AgentPicker.tsx')).toContain('profile_slug')
    expect(read('components/Footer.tsx')).toContain("{ key: 'foot.findAgent', href: '/agents' }")
    const audit = read('scripts/route-audit.mjs')
    expect(audit).toContain("'/agents'")
    expect(audit).toContain('agent contact anon → 401')
    expect(read('app/agent/verify/page.tsx')).toContain('<PublicProfileEditor')
  })
})
