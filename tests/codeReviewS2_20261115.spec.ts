import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ipBucket, requestIp } from '@/lib/rateLimit'
import { sameSitePath } from '@/lib/auth/sameSitePath'
import { safeNext } from '@/lib/landlordHat'
import { isMlsHost } from '@/lib/listings/externalSources'
import { __resetThreadVersions, foreignMessages, placeForeign, saveThread } from '@/lib/agent/threads'
import { canAct, entryNoticeText, entryWindowProblem } from '@/lib/marketplace/workOrders'
import { MCP_MAX_BATCH, parseMcpBody } from '@/lib/mcp/jsonrpc'
import type { ChatMessage } from '@/lib/agent/types'
import { FREE_RUNS_PER_SCREENING, FREE_SCREENINGS_PER_MONTH, SCREEN_SCORE_RUNS_PER_HOUR, sameApplicantName } from '@/lib/billing/entitlement'

// Code review 2026-11-15 — the S2 findings that were fixed (29 of 31; S2-6 and S2-31 wait for
// a decision, S2-9 is only narrowed). One block per finding. S2-10 and S2-11 sit in the
// screening module and were changed on the user's explicit request (「修这两条」).
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
const MIG = read('supabase/migrations/20261115b_code_review_s2.sql')
const msg = (id: string, role: 'user' | 'agent' = 'agent'): ChatMessage => ({ id, role, text: id })

describe('S2-1 · a card is approved through the RPC, never by a direct update', () => {
  it('the guard is an invoker trigger on UPDATE that lets RPCs and the service role through', () => {
    expect(MIG).toContain('create or replace function public.guard_pending_action_update()')
    expect(MIG).toContain('if not public.is_direct_client_write() then return new; end if;')
    expect(MIG).toMatch(/create trigger trg_guard_pending_action_update\s+before update on public\.agent_pending_actions/)
    const fn = MIG.slice(MIG.indexOf('function public.guard_pending_action_update()'), MIG.indexOf('revoke execute on function public.guard_pending_action_update()'))
    expect(fn).not.toMatch(/security definer/i)
  })
  it('names each refused move', () => {
    for (const why of ['identity columns are fixed', 'an executed card is read-only', 'executed_at is set by the executor', 'approve through decide_pending_action', 'a decided card does not come back', 'content can change only while the card is pending']) expect(MIG).toContain(`why := '${why}';`)
    expect(MIG).toContain("raise exception 'pending_action_guard: %', why using errcode = '42501';")
  })
  it('the client still only makes the moves the guard allows', () => {
    const clientFiles = [...walk('components'), ...walk('lib'), ...walk('app')].filter((f) => !f.startsWith('app/api/'))
    const direct = clientFiles.filter((f) => /from\('agent_pending_actions'\)[\s\S]{0,80}\.update\(\{[^}]*status: 'approved'/.test(read(f)))
    expect(direct).toEqual([])
  })
})

describe('S2-2 · the showing card takes the prospect from the tenants row', () => {
  const exec = read('app/api/agent/execute/route.ts')
  it('reads auth_id from the row and never from the card metadata', () => {
    expect(exec).toContain(".from('tenants').select('email, full_name, auth_id').eq('id', intent.tenant_id)")
    expect(exec).not.toContain("typeof m.tenant_auth_id === 'string' ? m.tenant_auth_id")
  })
})

describe('S2-3 · tenants.tier / email are frozen for the owner; claim_tenant takes only unclaimed rows', () => {
  it('guards INSERT and UPDATE', () => {
    expect(MIG).toMatch(/create trigger trg_guard_tenants_columns\s+before insert or update on public\.tenants/)
    expect(MIG).toContain('new.tier := old.tier;')
    expect(MIG).toContain('new.email := old.email;')
    expect(MIG).toContain('new.tier := 1;')
  })
  it('claims by email only where auth_id is null', () => {
    expect(MIG).toContain('where email = v_email and auth_id is null order by created_at limit 1;')
    expect(MIG).not.toMatch(/from public\.tenants where email = v_email;/)
  })
})

describe('S2-4 / S2-5 · screening delete is for the owner; one-click screening looks through the caller', () => {
  const del = read('app/api/screening/[id]/route.ts')
  it('checks ownership before the service-role delete and narrows the file paths', () => {
    const own = del.indexOf("code: 'not_owner'")
    expect(own).toBeGreaterThan(-1)
    expect(own).toBeLessThan(del.indexOf(".storage.from('tenant-files').remove(paths)"))
    expect(del).toContain('const ownFolder = new RegExp(`^screenings/[^/]+/${id}/`)')
    expect(del).not.toContain("!!p && p.startsWith('screenings/'))")
  })
  it('the existing-screening lookup runs under the caller, not the service role', () => {
    const r = read('app/api/screening/from-application/route.ts')
    expect(r).toContain("await sb.from('screenings').select('id, status').eq('application_id', appId)")
    expect(r).not.toContain("await admin.from('screenings').select('id, status').eq('application_id', appId)")
  })
})

describe('S2-7 · ?next= stays on the site', () => {
  it('refuses control characters, backslashes and other origins', () => {
    for (const bad of ['/\t/evil.com', '/\n/evil.com', '//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com', 'evil.com', '', null, undefined, '/a\u0000b']) expect(sameSitePath(bad as string | null)).toBeNull()
    for (const ok of ['/', '/landlord/agent', '/h/abc?tab=maintenance#x', '/screening/app?id=1&next=%2Fx']) expect(sameSitePath(ok)).toBe(ok)
  })
  it('the tab trick really is another origin for the URL parser (why the check exists)', () => {
    expect(new URL('/\t/evil.com', 'https://www.stayloop.ai').origin).toBe('https://evil.com')
  })
  it('one implementation, four call sites', () => {
    expect(read('lib/auth/useLoginForm.ts')).toContain('sameSitePath(redirect, window.location.origin)')
    expect(read('app/auth/callback/page.tsx')).toContain('sameSitePath(rawNext, window.location.origin)')
    expect(read('components/auth/AuthPage.tsx')).toContain('sameSitePath(redirect, window.location.origin)')
    expect(safeNext('/\t/evil.com')).toBe('/landlord/agent')
    expect(safeNext('/landlord/become?x=1')).toBe('/landlord/agent')
    expect(safeNext('/landlord/leases')).toBe('/landlord/leases')
    const stray = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => f !== 'lib/auth/sameSitePath.ts' && /startsWith\('\/\/'\)/.test(read(f)) && /next|redirect/i.test(read(f)))
    expect(stray).toEqual([])
  })
})

describe('S2-8 · MLS hosts are refused with a trailing dot and after a redirect', () => {
  it('normalises the host', () => {
    for (const u of ['https://www.realtor.ca/x', 'https://www.realtor.ca./x', 'https://REALTOR.CA../x', 'https://m.realtor.ca./']) expect(isMlsHost(u)).toBe(true)
    expect(isMlsHost('https://rentals.ca/toronto')).toBe(false)
  })
  it('the page the reader actually read is checked too', () => {
    expect(read('app/api/agent/turn/route.ts')).toContain('if (json.data?.url && isMlsHost(json.data.url)) return { content: null, images: [], reason: MLS_READ_REFUSED_REASON }')
  })
})

describe('S2-9 · a verification request’s tenant email is fixed once the tenant has consented', () => {
  it('the re-point only applies while pending', () => {
    expect(read('app/api/verify/create/route.ts')).toContain(".eq('token', token).eq('status', 'pending')")
  })
})

describe('S2-12 · first checkout writes the renewal date and the card', () => {
  const hook = read('app/api/stripe/webhook/route.ts')
  it('the completed branch reads the subscription after the plan write, best-effort', () => {
    const plan = hook.indexOf('if (planErr) throw planErr')
    const fill = hook.indexOf('const sub = await stripe.subscriptions.retrieve(subscriptionId)')
    expect(plan).toBeGreaterThan(-1)
    expect(fill).toBeGreaterThan(plan)
    expect(hook).toContain(".eq('id', landlordId)\n              .eq('stripe_subscription_id', subscriptionId)")
    expect(hook).toContain("console.warn('checkout.session.completed: subscription details not read'")
  })
})

describe('S2-13 · endpoints that send mail have a durable caller bucket and a site-wide one', () => {
  it('ipBucket folds an IPv6 address into its /64 and leaves IPv4 alone', () => {
    expect(ipBucket('203.0.113.9')).toBe('203.0.113.9')
    expect(ipBucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64')
    expect(ipBucket('2001:0db8:0001:0002::1')).toBe('2001:db8:1:2::/64')
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(ipBucket('::ffff:203.0.113.9')).toBe('203.0.113.9')
    expect(ipBucket('')).toBe('unknown')
    expect(requestIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9')
    expect(requestIp(new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
  })
  it('underMailLimits is fail-closed on both buckets', () => {
    const src = read('lib/rateLimit.ts')
    expect(src).toContain('underHourlyLimit(`${route}:${caller}`, perCallerPerHour, false)')
    expect(src).toContain('underHourlyLimit(`${route}:site-wide`, siteWidePerHour, false)')
  })
  it('each of the five endpoints uses it', () => {
    expect(read('app/api/contact/route.ts')).toContain("underMailLimits('contact', `ip:${ipBucket(ip)}`, 5, 60)")
    expect(read('app/api/notify-landlord/route.ts')).toContain("underMailLimits('notify-landlord', `ip:${ipBucket(requestIp(req.headers))}`, 20, 300)")
    expect(read('app/api/consumer/request/route.ts')).toContain("underHourlyLimit('consumer-request:site-wide', 100, false)")
    const intake = read('app/api/agent-intake/[token]/route.ts')
    expect(intake).toContain("underMailLimits('agent-intake-submit', `ip:${ip}`, 10, 300)")
    expect(intake).toContain('underHourlyLimit(`agent-intake-submit:link:${token.slice(0, 32)}`, 30, false)')
    const invite = read('app/api/household/invite/route.ts')
    expect(invite).toContain("underHourlyLimit('household-invite:site-wide', 300, false)")
    expect(invite).toContain('if (countErr) return NextResponse.json(')
    expect(invite).toContain('if (sentErr) return NextResponse.json(')
  })
})

describe('S2-14 · routes that spend model credit have a durable ceiling', () => {
  it('lease extraction and file classification', () => {
    expect(read('app/api/household/extract/route.ts')).toContain('underHourlyLimit(`household-extract:${userData.user.id}`, 20, true)')
    const c = read('app/api/classify-files/route.ts')
    expect(c).toContain('underHourlyLimit(`classify-files:${userId}`, 120, true)')
    expect(c).toContain('if (!mayScreen(await callerHats(sbAuth), false))')
  })
})

describe('S2-15 / S2-16 · open API: a self-declared client id also counts against its address; MCP batches are capped', () => {
  it('underV1Limits consumes the IP bucket when the key is a client id', () => {
    const src = read('lib/api/v1Limits.ts')
    expect(src).toContain('ipKey && ipKey !== clientKey ? underHourlyLimit(limitKeys(endpoint, ipKey).perKey, perKeyLimit, true) : Promise.resolve(true)')
    expect(read('lib/api/v1Http.ts')).toContain('underV1Limits(endpoint, clientKey, ipKeyFor(req.headers))')
    expect(read('app/api/mcp/route.ts')).toContain("underV1Limits('mcp', key, ipKeyFor(req.headers))")
  })
  it('a batch over the cap is one Invalid Request', () => {
    const one = { jsonrpc: '2.0', id: 1, method: 'ping' }
    expect(parseMcpBody(JSON.stringify(Array(MCP_MAX_BATCH).fill(one))).ok).toBe(true)
    const over = parseMcpBody(JSON.stringify(Array(MCP_MAX_BATCH + 1).fill(one)))
    expect(over.ok).toBe(false)
    if (!over.ok) expect(JSON.stringify(over.response)).toContain('batch too large')
    expect(MCP_MAX_BATCH).toBe(20)
  })
})

describe('S2-17 · guardrail compliance events are actually sent', () => {
  it('no bare `void <client>.from(…).insert/update/upsert/delete(` without a .then in server code', () => {
    // A statement = the `void x.from('t')…` line plus the chained lines under it (those starting with a dot).
    const offenders: string[] = []
    for (const f of [...walk('app/api'), ...walk('lib')]) {
      const lines = read(f).split('\n')
      lines.forEach((line, i) => {
        if (!/^\s*void [A-Za-z_.]+\.from\('[a-z_]+'\)/.test(line)) return
        let stmt = line
        for (let j = i + 1; j < lines.length && /^\s*\./.test(lines[j]); j++) stmt += lines[j]
        if (!stmt.includes('.then(')) offenders.push(`${f}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
  it('the turn route hands the insert to afterResponse', () => {
    expect(read('app/api/agent/turn/route.ts')).toContain("afterResponse(Promise.resolve(svcC.from('compliance_events').insert(")
  })
})

describe('S2-18 · a preview does not save the landlord address', () => {
  const exec = read('app/api/agent/execute/route.ts')
  it('saving is tied to a real run', () => {
    expect(exec).toContain('if (save) await saveTenantLandlordContact(admin, userId, e)')
    expect((exec.match(/resolveLandlordContact\(admin, userId, \[[^\]]+\], !preview\)/g) ?? []).length).toBe(2)
  })
})

describe('S2-19 · a decided rent-reminder card is not raised again', () => {
  it('dedupe looks at every status a card can have', () => {
    const r = read('app/api/cron/agent-routines/route.ts')
    expect(r).toContain(".in('status', ['pending', 'approved', 'rejected', 'expired'])")
    expect(r).not.toContain("'executed'])")
  })
})

describe('S2-20 · conversation saves do not overwrite what somebody else appended', () => {
  beforeEach(() => __resetThreadVersions())

  it('foreignMessages / placeForeign keep each foreign message after the one it followed', () => {
    const local = [msg('a', 'user'), msg('b'), msg('c', 'user')]
    const stored = [msg('a', 'user'), msg('b'), msg('rt-1'), msg('rt-2')]
    const theirs = foreignMessages(local, stored)
    expect(theirs.map((f) => [f.after, f.msg.id])).toEqual([['b', 'rt-1'], ['rt-1', 'rt-2']])
    expect(placeForeign(local, theirs).map((m) => m.id)).toEqual(['a', 'b', 'rt-1', 'rt-2', 'c'])
    // placed again on a later save: stable, no duplicates
    expect(placeForeign(placeForeign(local, theirs), theirs).map((m) => m.id)).toEqual(['a', 'b', 'rt-1', 'rt-2', 'c'])
    // anchor gone → at the end; nothing before it in the stored copy → at the front
    expect(placeForeign([msg('z')], [{ after: 'gone', msg: msg('rt-9') }]).map((m) => m.id)).toEqual(['z', 'rt-9'])
    expect(placeForeign([msg('z')], [{ after: null, msg: msg('rt-0') }]).map((m) => m.id)).toEqual(['rt-0', 'z'])
  })

  it('saveThread writes conditionally, merges on a conflict, and keeps the adopted message on the next save', async () => {
    // A tiny fake of the three PostgREST calls saveThread makes.
    const row = { id: 't1', messages: [msg('a', 'user'), msg('b')] as ChatMessage[], last_message_at: 'S0' }
    const writes: ChatMessage[][] = []
    const client = {
      from: () => ({
        update: (patch: Record<string, unknown>) => {
          const conds: Record<string, unknown> = {}
          const apply = () => {
            if (conds.last_message_at !== undefined && conds.last_message_at !== row.last_message_at) return { data: [], error: null }
            row.messages = patch.messages as ChatMessage[]; row.last_message_at = patch.last_message_at as string
            writes.push(row.messages)
            return { data: [{ id: row.id }], error: null }
          }
          const q = {
            eq: (k: string, v: unknown) => { conds[k] = v; return q },
            select: () => Promise.resolve(apply()),
            then: (res: (v: { data: unknown; error: null }) => unknown) => Promise.resolve(apply()).then(res),
          }
          return q
        },
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { messages: row.messages }, error: null }) }) }),
      }),
    } as never
    // First save: no version on record → unconditional, and the version is remembered.
    await saveThread(client, 't1', [msg('a', 'user'), msg('b')])
    expect(writes.length).toBe(1)
    // The cron appends a report behind the page's back.
    row.messages = [...row.messages, msg('rt-1')]; row.last_message_at = 'CRON'
    // The page saves its own (stale) copy plus a new turn: conflict → merge.
    await saveThread(client, 't1', [msg('a', 'user'), msg('b'), msg('c', 'user'), msg('d')])
    expect(row.messages.map((m) => m.id)).toEqual(['a', 'b', 'rt-1', 'c', 'd'])
    // Next save from the same page (its copy still lacks rt-1): the adopted message stays.
    await saveThread(client, 't1', [msg('a', 'user'), msg('b'), msg('c', 'user'), msg('d'), msg('e', 'user')])
    expect(row.messages.map((m) => m.id)).toEqual(['a', 'b', 'rt-1', 'c', 'd', 'e'])
  })
})

describe('S2-21 · a delisted model that fails its test is disabled with an update, and the result is read', () => {
  const src = read('lib/models/autoDiscover.ts')
  it('no partial upsert in the retired branch', () => {
    const block = src.slice(src.indexOf('for (const id of diff.retired)'), src.lastIndexOf('__resetModelConfigCaches()'))
    expect(block).not.toContain('.upsert(')
    expect(block).toContain(".update({ user_selectable: false, enabled: false,")
    expect(block).toContain('disabled = !error')
    expect(src).toContain('测试失败，但停用没有写入')
  })
})

describe('S2-22 / S2-23 · cron timeout; message ids are drawn after the lock', () => {
  it('the proactive cron passes a timeout', () => {
    expect(MIG).toMatch(/'agent-proactive-daily',\s+'0 13 \* \* \*',[\s\S]*timeout_milliseconds := 300000/)
  })
  it('the chain trigger re-draws the id once the advisory lock is held, before reading the previous hash', () => {
    const fn = MIG.slice(MIG.indexOf('create or replace function public.thread_messages_chain()'))
    const lock = fn.indexOf('perform pg_advisory_xact_lock(hashtextextended(new.thread_id::text, 42));')
    const id = fn.indexOf("new.id := nextval('public.thread_messages_id_seq');")
    const prev = fn.indexOf('select m.hash into prev from public.thread_messages m')
    expect(lock).toBeGreaterThan(-1)
    expect(id).toBeGreaterThan(lock)
    expect(prev).toBeGreaterThan(id)
    // the canonical form is not redefined here: stayloop-thread-v1 stays as it is
    expect(MIG).not.toContain('function public.thread_message_canonical')
  })
})

describe('S2-24 · a work order in rework is not a dead end for the landlord', () => {
  it('dispute and cancel are possible from rework', () => {
    expect(canAct('dispute', 'rework', 'landlord').ok).toBe(true)
    expect(canAct('cancel', 'rework', 'landlord').ok).toBe(true)
    expect(canAct('cancel', 'completed', 'landlord').ok).toBe(false)
    expect(canAct('accept_completion', 'rework', 'landlord').ok).toBe(false)
  })
})

describe('S2-25 / S2-26 / S2-27 / S2-28 · front-end correctness', () => {
  it('the Fully executed stamp is a Toronto date', () => {
    for (const f of ['components/lease/OntarioLeaseDoc.tsx', 'components/lease/TrrebLeaseDoc.tsx']) {
      const s = read(f)
      expect(s).toContain('`· ${torontoDate(new Date(Math.max(')
      expect(s).not.toContain('.toISOString().slice(0, 10)}`')
    }
  })
  it('useHats retries a failed load instead of staying on loading for ever', () => {
    const s = read('lib/useHats.ts')
    expect(s).toContain('export const HATS_RETRY_MS = [1000, 3000, 8000, 15000]')
    expect(s).toContain('retry.current.timer = setTimeout(() => { retry.current.timer = null; void load(uid) }, wait)')
    expect(s).toContain('return () => { if (r.timer) { clearTimeout(r.timer); r.timer = null } r.tries = 0 }')
  })
  it('the notice toolbox drops a late answer for the previous lease', () => {
    const s = read('components/landlord/NoticeToolbox.tsx')
    expect(s).toContain('void loadLeaseData(leaseId, () => !cancelled)')
    expect(s).toContain('if (!isCurrent()) return')
  })
  it('the dispatch policy card does not save over a policy it could not read', () => {
    const s = read('components/marketplace/DispatchPolicyCard.tsx')
    expect(s).toContain('if (!auth.user || !loaded) return')
    expect(s).toMatch(/if \(error\) \{ setMsg\([^\n]+\); return \}\n\s+setPolicy\(normalizePolicy\(data as never\)\); setLoaded\(true\)/)
  })
})

describe('S2-29 · work-order notices outside Ontario do not quote the Ontario Act', () => {
  const bc = { code: 'BC', statute: { zh: '《住宅租赁法》（不列颠哥伦比亚省）', en: 'the Residential Tenancy Act (British Columbia)' } }
  it('the notice names the province’s own statute and no Ontario section or hours', () => {
    const base = { unit: '1 Main St', scheduleStart: '2026-12-01T15:00:00Z', scheduleEnd: '2026-12-01T17:00:00Z', provider: 'X', scope: 's', entryPermission: null }
    for (const emergency of [false, true]) {
      const n = entryNoticeText({ ...base, emergency, otherProvince: bc })
      expect(n.body).toContain(bc.statute.zh)
      expect(n.body).toContain(bc.statute.en)
      expect(n.body).not.toMatch(/RTA|s\.2[67]|8:00/)
    }
    const on = entryNoticeText({ ...base, emergency: false })
    expect(on.body).toContain('s.27')
  })
  it('Ontario’s 24 h / 8–20 limits are not enforced elsewhere, a window still is', () => {
    const now = new Date('2026-09-23T12:00:00Z')
    expect(entryWindowProblem({ emergency: false, scheduleStart: '2026-09-23T20:00:00Z', otherProvince: bc }, now)).toBeNull()
    expect(entryWindowProblem({ emergency: false, scheduleStart: null, otherProvince: bc }, now)).toBe('no_window')
    expect(entryWindowProblem({ emergency: false, scheduleStart: '2026-09-23T20:00:00Z' }, now)).toBe('less_than_24h')
  })
  it('the server derives the province once and uses it for the notice, the rule id and the repair email', () => {
    const s = read('lib/marketplace/server.ts')
    expect(s).toContain('export function otherProvinceOf(')
    expect(s).toContain("const entryRule = elsewhere ? `${wo.emergency ? 'emergency-entry' : 'entry-notice'}:${elsewhere.code}`")
    expect(s).toContain('otherProvince: otherProvinceOf(hhRow as')
    expect(read('app/api/maintenance/notify/route.ts')).toContain('const elsewhere = otherProvinceOf(ctx.household)')
  })
})

describe('S2-30 · the realtor rail prompt names Stayloop listings and the public benchmark', () => {
  it('no 「实时挂牌」 / TRREB in lifecycle prompts', () => {
    const s = read('lib/lifecycle/stages.ts')
    expect(s).not.toMatch(/实时挂牌|TRREB/)
    expect(s).toContain('Stayloop 在租挂牌和 CMHC / 统计局的公开租金基准')
  })
})

describe('S2-10 · a one-time unlock pays for the applicant on that screening, nobody else', () => {
  it('sameApplicantName ignores case, spacing, punctuation and word order — and nothing more', () => {
    const onFile = ['Wei  Zhang', null]
    for (const ok of ['Wei Zhang', 'wei zhang', 'ZHANG, Wei', ' Zhang  Wei ']) expect(sameApplicantName(ok, onFile)).toBe(true)
    for (const bad of ['Wei Zhao', 'Wei', 'Zhang', 'Wei Zhang Jr', '', null, undefined]) expect(sameApplicantName(bad as string | null, onFile)).toBe(false)
    expect(sameApplicantName('张伟', ['张伟'])).toBe(true)
    expect(sameApplicantName('张伟', ['张 伟'])).toBe(false)
    expect(sameApplicantName('Wei Zhang', [null, undefined, ''])).toBe(false)
    expect(sameApplicantName('Wei Zhang', ['someone else', 'Zhang Wei'])).toBe(true)
  })
  const dc = read('app/api/deep-check/route.ts')
  it('the gate compares the claimed applicant with the screening row before a credit is spent', () => {
    const check = dc.indexOf('if (claimedApplicant !== null && !sameApplicantName(claimedApplicant, [s?.ai_extracted_name as string | null, s?.tenant_name as string | null]))')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(dc.indexOf("rlsClient.rpc('consume_unlock_credit'"))
    expect(check).toBeLessThan(dc.indexOf('if (s?.unlocked_at) return null'))
    // …and only after the plan checks: Pro and trial accounts are not limited this way
    expect(check).toBeGreaterThan(dc.indexOf('if (isProEntitled(landlord)) return null'))
    expect(dc).toContain('const gate = await enforceProGate(req, gateScreeningId, claimedApplicant)')
  })
})

describe('S2-11 · the free allowance counts what was scored this month', () => {
  const MIGC = read('supabase/migrations/20261115c_screening_run_log.sql')
  const ss = read('app/api/screen-score/route.ts')
  it('the run log is service-only and survives the screening being deleted', () => {
    expect(MIGC).toContain('create table if not exists public.screening_runs (')
    expect(MIGC).toContain('alter table public.screening_runs enable row level security;')
    expect(MIGC).toContain('revoke all on public.screening_runs from anon, authenticated;')
    expect(MIGC).not.toMatch(/screening_id\s+uuid[^,]*references/)
    expect(MIGC).not.toMatch(/create policy[^;]*screening_runs/)
  })
  it('both functions check that the screening is the caller’s own', () => {
    expect(MIGC).toContain("if auth.uid() is not null and not (auth.uid() = any(v_keys)) and not coalesce(public.is_stayloop_admin(), false) then\n    raise exception 'not_your_screening'")
    expect(MIGC).toContain('if auth.uid() is not null and not (auth.uid() = any(public.screening_landlord_keys(v_ll))) and not coalesce(public.is_stayloop_admin(), false) then\n    return;')
    expect(MIGC).toContain('revoke execute on function public.screening_quota_usage(uuid) from public, anon;')
    expect(MIGC).toContain('revoke execute on function public.record_screening_run(uuid) from public, anon;')
  })
  it('the route keeps the old check, adds the two new ones, a cost ceiling and the run record — in that order', () => {
    const oldCheck = ss.indexOf("if (count !== null && count >= FREE_SCREENINGS_PER_MONTH) {")
    const usage = ss.indexOf("await supabase.rpc('screening_quota_usage', { p_screening_id: screening_id })")
    const rows = ss.indexOf('if (u && !u.counted && Number(u.rows_this_month) >= FREE_SCREENINGS_PER_MONTH) {')
    const runs = ss.indexOf('if (u && Number(u.runs_this_row) >= FREE_RUNS_PER_SCREENING) {')
    const hourly = ss.indexOf('underHourlyLimit(`screen-score:${userData.user.id}`, SCREEN_SCORE_RUNS_PER_HOUR, true)')
    const record = ss.indexOf("await supabase.rpc('record_screening_run', { p_screening_id: screening_id }).then(() => {}, () => {})")
    const start = ss.indexOf("writeProgress('signing_files', 6)")
    for (const i of [oldCheck, usage, rows, runs, hourly, record, start]) expect(i).toBeGreaterThan(-1)
    expect([oldCheck, usage, rows, runs, hourly, record, start]).toEqual([oldCheck, usage, rows, runs, hourly, record, start].slice().sort((a, b) => a - b))
  })
  it('the numbers live in lib/billing/entitlement.ts', () => {
    expect(FREE_SCREENINGS_PER_MONTH).toBe(3)
    expect(FREE_RUNS_PER_SCREENING).toBe(3)
    expect(SCREEN_SCORE_RUNS_PER_HOUR).toBe(40)
  })
})

