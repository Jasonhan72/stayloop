import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterResponse } from '@/lib/afterResponse'
import { ilikeExact } from '@/lib/db/ilikeExact'
import { EMAIL_SHAPE, emailShapeOk } from '@/lib/validation/emailShape'

// Code review 2026-11-15 (design/code-review-2026-11-15.md) — the S0 and the five S1s.
// Each block pins the fix so a later edit cannot quietly reopen the hole.
const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel)
  }
  return out
}
const MIG = read('supabase/migrations/20261115_code_review_s0_s1.sql')

describe('S0-1 · evidence-pack export never splices tenant_email into an or=() filter', () => {
  const route = read('app/api/matters/export/route.ts')

  it('delegations are read with parameterised queries, merged by id', () => {
    expect(route).toContain('delegationsOfMatter(admin, M),')
    expect(route).toContain(".in('principal_auth_id', principals)")
    expect(route).toContain(".eq('principal_email', email)")
  })

  it('no .or() in the route interpolates an email', () => {
    const ors = route.match(/\.or\(`[^`]*`\)/g) ?? []
    for (const o of ors) expect(o).not.toMatch(/email/i)
    expect(route).not.toContain('principal_email.eq.${')
  })

  it('the lease form, the quick form and the import page check the email shape before writing', () => {
    expect(read('app/landlord/leases/new/page.tsx')).toContain('if (!emailShapeOk(tenantEmail))')
    expect(read('app/landlord/leases/page.tsx')).toContain('if (!emailShapeOk(f.tenant_email))')
    expect(read('app/leases/import/page.tsx').split('if (!emailShapeOk(form.tenant_email))').length - 1).toBe(2)
  })

  it('the JS pattern and the SQL constraint are the same pattern', () => {
    expect(MIG).toContain(`check (tenant_email is null or tenant_email ~ '${EMAIL_SHAPE.source}');`)
    expect(MIG).toContain('add constraint lease_documents_tenant_email_shape')
    // rental_matters is fed by applicants' own emails too: a constraint there would break my_matters().
    expect(MIG).not.toMatch(/alter table public\.rental_matters/)
  })

  it('emailShapeOk accepts real addresses and refuses filter syntax', () => {
    for (const ok of ['', '  ', 'a@b.co', 'A.b+c_d@sub-x.example.co', ' padded@x.io ']) expect(emailShapeOk(ok)).toBe(true)
    for (const bad of ['x@y.zz,principal_email.neq.zz', 'a b@c.d', 'x@y', 'Name <a@b.co>', 'a@b.co)', 'a@@b.co']) expect(emailShapeOk(bad)).toBe(false)
  })
})

describe('S1-1 · search_ltb_orders is for the people who may screen', () => {
  it('checks the caller inside the function, with every term coalesced (NULL in (…) is not false)', () => {
    expect(MIG).toContain('if auth.uid() is not null then')
    expect(MIG).toContain("if not coalesce((v_hats ->> 'landlord')::boolean, false)")
    expect(MIG).toContain("and coalesce(v_hats ->> 'agent', '') not in ('verified', 'renewal_due')")
    expect(MIG).toContain("and not coalesce((v_hats ->> 'admin')::boolean, false) then")
    expect(MIG).toContain("raise exception 'screening_requires_landlord_or_agent'")
    expect(MIG).not.toMatch(/or \(v_hats ->> 'agent'\) in/)
  })

  it('anon never gets EXECUTE', () => {
    expect(MIG).toContain('revoke execute on function public.search_ltb_orders(text, text, text[], text[], integer) from public, anon;')
    expect(MIG).not.toMatch(/grant execute on function public\.search_ltb_orders[^;]*\banon\b/)
  })

  it('the unused /api/ltb-search route is gone and the audit expects it gone', () => {
    expect(existsSync(join(ROOT, 'app/api/ltb-search/route.ts'))).toBe(false)
    expect(read('scripts/route-audit.mjs')).toContain("'ltb-search removed → 404/405'")
  })

  it('the permission matrix carries the tenant / landlord / agent rows', () => {
    const m = read('scripts/e2e/db-matrix.sql')
    expect(m).toContain("('tenant','ltb_orders','rpc search_ltb_orders (screening role only, review 2026-11-15 S1-1)','ERR 42501'")
    expect(m).toContain("('landlord','ltb_orders','rpc search_ltb_orders (landlord hat)'")
    expect(m).toContain("('agent','ltb_orders','rpc search_ltb_orders (verified agent)'")
  })
})

describe('S1-2 · a landlord cannot delete their own landlords row', () => {
  it('the FOR ALL policy is replaced by an UPDATE-only one and DELETE is revoked', () => {
    expect(MIG).toContain('drop policy if exists "Landlords see own profile" on public.landlords;')
    expect(MIG).toMatch(/create policy "Landlords update own profile" on public\.landlords\s+for update to authenticated\s+using \(auth\.uid\(\) = auth_id\)\s+with check \(auth\.uid\(\) = auth_id\);/)
    expect(MIG).toContain('revoke delete, truncate on public.landlords from anon, authenticated;')
    expect(MIG).not.toMatch(/on public\.landlords\s+for (all|delete)/i)
  })

  it('no client code deletes a landlords row', () => {
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => /from\('landlords'\)[^\n;]*\.delete\(/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('the permission matrix expects the delete to be refused', () => {
    expect(read('scripts/e2e/db-matrix.sql')).toContain("('landlord','landlords','delete own row (trial reset + listings cascade, review 2026-11-15 S1-2)','ERR 42501'")
  })
})

describe('S1-3 · emails go into .ilike() escaped', () => {
  it('ilikeExact escapes the three ILIKE metacharacters and nothing else', () => {
    expect(ilikeExact('john_smith@outlook.com')).toBe('john\\_smith@outlook.com')
    expect(ilikeExact('100%@x.io')).toBe('100\\%@x.io')
    expect(ilikeExact('a\\b@x.io')).toBe('a\\\\b@x.io')
    expect(ilikeExact('plain.name+tag@x.io')).toBe('plain.name+tag@x.io')
  })

  it('the two service-role lookups by tenant email use it', () => {
    expect(read('app/api/agent/execute/route.ts')).toContain(".ilike('tenant_email', ilikeExact(callerEmail))")
    expect(read('app/api/cron/agent-routines/route.ts')).toContain(".ilike('tenant_email', ilikeExact(email))")
  })

  it('there is one ilikeExact, and no server file passes a bare email variable to .ilike()', () => {
    const files = [...walk('app/api'), ...walk('lib')]
    expect(files.filter((f) => /function ilikeExact\(/.test(read(f)))).toEqual(['lib/db/ilikeExact.ts'])
    const bare = files.filter((f) => /\.ilike\('[a-z_]*email[a-z_]*',\s*(?!ilikeExact\()[A-Za-z_.]+\)/.test(read(f)))
    expect(bare).toEqual([])
  })
})

describe('S1-4 · work after the response rides waitUntil', () => {
  it('afterResponse runs the work, accepts a thunk, and never throws or rejects', async () => {
    const done = vi.fn()
    afterResponse(Promise.resolve().then(done))
    afterResponse(async () => { done() })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => afterResponse(Promise.reject(new Error('boom')))).not.toThrow()
    expect(() => afterResponse(() => { throw new Error('sync boom') })).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(done).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('the helper hands the promise to the Worker context when there is one', () => {
    const src = read('lib/afterResponse.ts')
    expect(src).toContain("import { getCloudflareContext } from '@opennextjs/cloudflare'")
    expect(src).toContain('try { getCloudflareContext().ctx.waitUntil(p) } catch { void p }')
  })

  it('no route or server library leaves a notice floating with a bare `void`', () => {
    const FLOATING = /^\s*(?:if \([^\n]*\) |else )?void (notifyUser|notifyThreadParties|suggestDispatch|sendEmail|ensureMatter|postSystemMessage|noteOnWorkOrder)\(/m
    const offenders = [...walk('app/api'), ...walk('lib')].filter((f) => FLOATING.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('the repair-ticket path hands both the push and the dispatch suggestion to afterResponse', () => {
    const exec = read('app/api/agent/execute/route.ts')
    expect(exec).toContain('if (ll.auth_id) afterResponse(suggestDispatch(admin, ll.auth_id, ticket.id))')
    expect(exec).toContain("if (ll.auth_id) afterResponse(notifyUser(admin, ll.auth_id, { kind: 'event', title: '新的报修工单 / New repair ticket'")
  })

  it('the daily sweep awaits its notices (a cron has nobody waiting)', () => {
    const sweep = read('lib/marketplace/sweep.ts')
    expect(sweep).not.toMatch(/void notifyUser\(/)
    expect((sweep.match(/await notifyUser\(/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

describe('S1-5 · the landlord can answer a listing inquiry by email', () => {
  const server = read('lib/threads/server.ts')
  const start = server.indexOf("if (th.kind === 'listing_inquiry') {", server.indexOf('async function tokenStillParty('))
  const block = server.slice(start, server.indexOf("if (th.kind === 'agent_client')", start))

  it('tokenStillParty re-checks the landlord of the listing instead of refusing every landlord', () => {
    expect(start).toBeGreaterThan(-1)
    expect(block).toContain("if (row.party_kind === 'tenant') return !!row.user_id && row.user_id === th.subject_user")
    expect(block).toContain("if (row.party_kind === 'landlord' && row.user_id) {")
    expect(block).toContain('listing_id: th.listing_id, subject_user: th.subject_user')
    expect(block).toContain("return people.some((p) => p.kind === 'landlord' && p.userId === row.user_id)")
  })

  it('anything else on that thread is still refused', () => {
    expect(block.trimEnd().endsWith('return false\n  }')).toBe(true)
  })
})
