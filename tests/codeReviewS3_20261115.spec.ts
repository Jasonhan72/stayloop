import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { chunk, IN_CHUNK, selectInChunks, selectPaged } from '@/lib/db/paged'
import { isPublicHost, isPublicHttpsUrl, readTextCapped } from '@/lib/net/publicUrl'
import { autoReplySignal, rawHeaders } from '@/lib/threads/autoReply'
import { externalHref, externalHrefLabel } from '@/lib/ui/externalHref'
import { veriffIsSandbox } from '@/lib/verify/providers/veriff'
import { VERIFY_LIMITS } from '@/lib/verify/limits'
import { LISTING_VISIBILITY_OR } from '@/lib/listingVisibility'
import { PUSH_TIMEOUT_MS } from '@/lib/push/webpush'

// Code review 2026-11-15 — the rest: S2-6, S2-9, S2-31 and the 32 S3 rows, fixed on the user's
// 「把所有的都修了，按照你的研究的结果来做」. One block per finding; the database half is
// migration 20261115d and was trial-run against production in a rolled-back transaction.
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
const MIG = read('supabase/migrations/20261115d_code_review_s3.sql')
const fnBody = (name: string) => {
  const i = MIG.indexOf(`function public.${name}(`)
  return MIG.slice(i, MIG.indexOf('end $function$;', i))
}
const bytes = (s: string) => new TextEncoder().encode(s)

describe('S2-6 · a delegation opens matters only when its scope has the matter item', () => {
  it('matter_party and my_matters both require it, null-safe', () => {
    for (const fn of ['matter_party', 'my_matters']) {
      expect(fnBody(fn), fn).toContain("and 'matter' = any (coalesce(d.scope, '{}'::text[]))")
    }
  })
  it('the scope label still says what the item grants, and the proposal ticks it by default', () => {
    expect(read('lib/delegations/shared.ts')).toContain("hint: { zh: '进入客户的租赁事务与对话'")
    expect(read('components/delegations/ProposeDelegation.tsx')).toContain("client.client_role === 'landlord' ? ['listing', 'matter'] : ['search', 'matter']")
  })
})

describe('S2-9 · a verification belongs to the account that consented, not to a typed address', () => {
  it('the request carries tenant_auth_id and the applicant can read only their own bound rows', () => {
    expect(MIG).toContain('alter table public.verification_requests add column if not exists tenant_auth_id uuid;')
    expect(MIG).toMatch(/create policy "Applicants read own bound verification requests"[\s\S]{0,160}for select to authenticated[\s\S]{0,120}tenant_auth_id = \(select auth\.uid\(\)\)/)
  })
  it('consent binds only a signed-in, confirmed account whose email is the one the request names', () => {
    const r = read('app/api/verify/[token]/consent/route.ts')
    expect(r).toContain('...(tenantAuthId ? { tenant_auth_id: tenantAuthId } : {})')
    expect(r).toContain('if (!u || u.is_anonymous || !u.email_confirmed_at) return null')
    expect(r).toContain("return (u.email || '').trim().toLowerCase() === want ? u.id : null")
  })
  it('the passport API and the passport page read by tenant_auth_id, never by tenant_email', () => {
    const api = read('app/api/v1/passport/verify/route.ts')
    expect(api).toContain(".eq('tenant_auth_id', tok.tenant_user_id as string)")
    expect(api).not.toMatch(/verification_requests'\)[^\n]*\.eq\('tenant_email'/)
    const page = read('app/tenant/passport/page.tsx')
    expect(page).toContain(".eq('tenant_auth_id', uid)")
    expect(page).toContain("setVerified({ identity: ok('id'), income: ok('bank') })")
    expect(read('app/verify/[token]/page.tsx')).toContain("if (path === '/consent') {")
  })
})

describe('S2-31 · the privacy page no longer says listing data is licensed from MLS', () => {
  it('3b states where listings come from and keeps the record-keeping facts', () => {
    const p = read('app/privacy/page.tsx')
    expect(p).not.toMatch(/授权提供|is licensed from|提供给它们/)
    expect(p).toContain('不来自 MLS® 系统或房地产协会的数据授权')
    expect(p).toContain('they do not come from MLS® systems or a data licence from a real estate association')
    expect(p).toContain('至少保留 180 天')
  })
})

describe('S3-1 · a failed take-down update releases the claim', () => {
  it('the executor releases and answers 502 instead of finalising a failure', () => {
    const r = read('app/api/agent/execute/route.ts')
    const i = r.indexOf("update({ status: 'removed', removed_at:")
    const after = r.slice(i, i + 700)
    expect(after).toContain('await releaseClaim(admin, action.id, error.message)')
    expect(after).not.toContain("{ ok: false, reason: error.message, listing_id: listingId }")
  })
})

describe('S3-2 · the link reader uses the shared host rule and reads a capped body', () => {
  it('isPublicHost knows a trailing dot, internal names and reserved ranges', () => {
    for (const h of ['localhost.', 'LOCALHOST', 'db.internal', 'printer.lan', '127.0.0.1', '10.1.2.3', '192.168.0.1.', '169.254.169.254', '100.64.0.1', '0177.0.0.1', '2130706433', '0x7f000001', '[::1]', '198.18.0.1', '224.0.0.1', '']) {
      expect(isPublicHost(h), h).toBe(false)
    }
    for (const h of ['www.kijiji.ca', 'rentals.ca.', '8.8.8.8']) expect(isPublicHost(h), h).toBe(true)
    expect(isPublicHttpsUrl('https://example.com/a')).toBe(true)
    expect(isPublicHttpsUrl('http://example.com/a')).toBe(false)
    expect(isPublicHttpsUrl('https://user:pw@example.com/')).toBe(false)
  })
  it('readTextCapped stops at the cap', async () => {
    const big = 'x'.repeat(50_000)
    expect((await readTextCapped(new Response(big), 1000)).length).toBe(1000)
    expect(await readTextCapped(new Response('short'), 1000)).toBe('short')
  })
  it('the turn route applies both, and drops an oversized image', () => {
    const r = read('app/api/agent/turn/route.ts')
    expect(r).toContain('if (!isPublicHost(parsed.hostname)) {')
    expect(r).toContain('const html = await readTextCapped(res, DIRECT_READ_MAX_BYTES)')
    expect(r).not.toContain('const html = await res.text()')
    expect(r).toContain('im.data.length <= IMAGE_MAX_BASE64_CHARS')
  })
})

describe('S3-3 · dedupe reads are paged and id lists are chunked', () => {
  it('chunk splits and keeps order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
    expect(IN_CHUNK).toBeLessThanOrEqual(100)
  })
  it('selectPaged reads past one page and reports a runaway', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i)
    const page = async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null })
    const r = await selectPaged(page, 1000)
    expect(r.data.length).toBe(2500)
    expect(r.truncated).toBe(false)
    expect((await selectPaged(page, 1000, 2)).truncated).toBe(true)
    const failing = await selectPaged(async () => ({ data: null, error: { message: 'boom' } }))
    expect(failing.error?.message).toBe('boom')
  })
  it('selectInChunks concatenates and stops at the first error', async () => {
    const seen: number[][] = []
    const ok = await selectInChunks([1, 2, 3, 4, 5], async (ids) => { seen.push(ids); return { data: ids.map((x) => x * 10), error: null } }, 2)
    expect(ok.data).toEqual([10, 20, 30, 40, 50])
    expect(seen.length).toBe(3)
    const bad = await selectInChunks([1, 2, 3], async (ids) => (ids[0] === 2 ? { data: null, error: { message: 'no' } } : { data: ids, error: null }), 1)
    expect(bad.error?.message).toBe('no')
  })
  it('the daily sweep uses them and a failed dedupe read stops the rent sweep', () => {
    const r = read('app/api/agent/proactive/route.ts')
    expect(r).toContain("import { selectInChunks, selectPaged, type PagedResult } from '@/lib/db/paged'")
    expect(r).not.toContain(".eq('action_type', RENT_OVERDUE_ACTION_TYPE).limit(2000)")
    expect(r).toContain("if (cardRes.error || cardRes.truncated) throw new Error(")
    expect(r).toContain("if (pushedRes.error || pushedRes.truncated) throw new Error(")
  })
})

describe('S3-4 · the thread notice limiter fails closed', () => {
  it('a limiter outage sends nothing', () => {
    expect(read('app/api/threads/notify/route.ts')).toContain('underHourlyLimit(`thread-notify:${ud.user.id}`, 60, false)')
  })
})

describe('S3-5 · the landlord hears that the lease is fully signed', () => {
  it('the fully-executed branch emails the landlord, resolved under the dual-ID rule', () => {
    const r = read('app/api/lease/sign/route.ts')
    expect(r).toContain('subject: `Fully signed — the lease for ${unit}`')
    expect(r).toContain('async function landlordEmailOf(')
    expect(r).toContain('.or(`id.eq.${landlordId},auth_id.eq.${landlordId}`)')
  })
})

describe('S3-6 · a push request has a deadline', () => {
  it('sendWebPush passes an abort signal', () => {
    expect(PUSH_TIMEOUT_MS).toBeLessThanOrEqual(10_000)
    expect(read('lib/push/webpush.ts')).toContain('signal: AbortSignal.timeout(PUSH_TIMEOUT_MS)')
  })
})

describe('S3-7 · an automatic reply is not that person’s message', () => {
  const mail = (headers: string) => bytes(`From: a@b.ca\r\nTo: t-x@reply.stayloop.ai\r\n${headers}\r\n\r\nI am away until Monday.\r\n`)
  it('recognises the standard signals', () => {
    expect(autoReplySignal(mail('Auto-Submitted: auto-replied'))).toBe('auto-submitted')
    expect(autoReplySignal(mail('auto-submitted: auto-generated; type=x'))).toBe('auto-submitted')
    expect(autoReplySignal(mail('Precedence: bulk'))).toBe('precedence')
    expect(autoReplySignal(mail('Precedence: auto_reply'))).toBe('precedence')
    expect(autoReplySignal(mail('X-Autoreply: yes'))).toBe('x-autoreply')
  })
  it('lets an ordinary reply through', () => {
    expect(autoReplySignal(mail('Subject: Re: hello'))).toBeNull()
    expect(autoReplySignal(mail('Auto-Submitted: no'))).toBeNull()
    expect(autoReplySignal(mail('Precedence: first-class'))).toBeNull()
    // a header name that only appears in the body does not count
    expect(autoReplySignal(bytes('From: a@b.ca\r\nSubject: x\r\n\r\nAuto-Submitted: auto-replied\r\n'))).toBeNull()
  })
  it('unfolds continuation lines', () => {
    expect(rawHeaders(bytes('Subject: a\r\n b\r\nX: 1\r\n\r\nbody')).get('subject')).toBe('a b')
  })
  it('recordEmailReply logs auto_reply before posting, and the table accepts the outcome', () => {
    const s = read('lib/threads/server.ts')
    const i = s.indexOf("if (autoReplySignal(mail.raw)) { await log('auto_reply'")
    expect(i).toBeGreaterThan(-1)
    expect(i).toBeLessThan(s.indexOf('const msgId = await postSystemMessage(admin, row.thread_id, {', i))
    expect(MIG).toContain("check (outcome in ('recorded', 'unknown_token', 'sender_mismatch', 'empty', 'revoked', 'auto_reply', 'error'));")
  })
})

describe('S3-8 · the partner key door on screen-score follows the third-tier switch', () => {
  it('a partner key is refused while the switch is off, before the key is even looked up', () => {
    const r = read('app/api/screen-score/route.ts')
    const gate = r.indexOf('if (partnerKey && !partnerScreeningEnabled()) return NextResponse.json(PARTNER_SCREENING_CLOSED, { status: 503 })')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(r.indexOf("from('trust_api_keys')"))
  })
})

describe('S3-9 · a dispute is resolved once', () => {
  it('the status update is conditional and comes before the correction', () => {
    const r = read('app/api/admin/consumer/route.ts')
    const claim = r.indexOf(".eq('id', dispute.id).eq('status', 'open').select('id')")
    expect(claim).toBeGreaterThan(-1)
    expect(claim).toBeLessThan(r.indexOf("from('screening_corrections').insert("))
    expect(r).toContain("if (!claimed || claimed.length === 0) return NextResponse.json({ error: 'already_resolved' }, { status: 409, headers: NO_STORE })")
  })
})

describe('S3-10 · landlord rows are found under the dual-ID rule', () => {
  it('no listed call site picks a row with limit(1) / maybeSingle on an or() or by auth_id alone', () => {
    for (const p of ['app/api/verify/create/route.ts', 'app/api/admin/consumer/route.ts', 'lib/listingPublish.ts', 'lib/useLandlord.ts', 'lib/useUser.ts', 'components/settings/LandlordPhoneCard.tsx', 'app/dashboard/page.tsx', 'app/api/lease/sign/route.ts']) {
      const s = read(p)
      expect(s, p).toContain('pickLandlordRow(')
      expect(s, p).not.toMatch(/from\('landlords'\)[^\n]*\.or\([^\n]*\)\.limit\(1\)\.maybeSingle\(\)/)
    }
    expect(read('lib/useLandlord.ts')).not.toMatch(/from\('landlords'\)\s*\.select\([^)]*\)\s*\.eq\('auth_id', authId\)/)
    expect(read('lib/useUser.ts')).not.toMatch(/from\('landlords'\)\s*\.select\('\*'\)\s*\.eq\('auth_id', authId\)/)
  })
})

describe('S3-11 · anonymous read surfaces have a site-wide ceiling', () => {
  it('search, detail, enrich and share links go through underCostLimits', () => {
    for (const p of ['app/api/listings/search/route.ts', 'app/api/listings/[slug]/route.ts', 'app/api/listings/enrich/route.ts', 'app/go/[code]/route.ts']) {
      expect(read(p), p).toContain('underCostLimits(')
    }
    const lim = read('lib/rateLimit.ts')
    const fn = lim.slice(lim.indexOf('export async function underCostLimits'))
    expect(fn).toContain('underHourlyLimit(`${route}:site-wide`, siteWidePerHour, true)')
  })
  it('one neighbourhood primer is generated at a time, with a site-wide ceiling', () => {
    const r = read('app/api/listings/enrich/route.ts')
    expect(r).toContain('if (c.stale && (await claimProfileGeneration(city, hood))) {')
    expect(r).toContain('if (!(await underHourlyLimit(key, 1, false))) return false')
  })
  it('the two config reads are memoised and never remember a failed read', () => {
    for (const p of ['app/api/config/marketplace/route.ts', 'app/api/config/tenant-insurance/route.ts']) {
      const s = read(p)
      expect(s, p).toContain('const MEMO_MS = 5 * 60_000')
      expect(s.indexOf('if (error) return'), p).toBeLessThan(s.lastIndexOf('memo = {'))
    }
  })
})

describe('S3-12 · one unlock payment is fulfilled in one transaction', () => {
  it('the webhook calls the RPC and no longer writes the ledger itself for unlocks', () => {
    const r = read('app/api/stripe/webhook/route.ts')
    expect(r).toContain("admin.rpc('fulfil_unlock_payment', {")
    expect(r).not.toContain("admin.rpc('grant_unlock_credit'")
  })
  it('the function stamps before it returns and is service-role only', () => {
    const fn = fnBody('fulfil_unlock_payment')
    expect(fn).toContain('on conflict (id) do nothing')
    expect(fn).toContain("if v_done is not null then return 'already'; end if;")
    expect(fn).toContain('where id = p_screening_id and unlocked_at is null')
    expect(MIG).toContain('revoke execute on function public.fulfil_unlock_payment(text, text, uuid, uuid, text) from public, anon, authenticated;')
  })
})

describe('S3-13 · Veriff sandbox flag and a limiter on the credit pull', () => {
  it('the flag comes from the deployment, not a literal', () => {
    expect(veriffIsSandbox({})).toBe(false)
    expect(veriffIsSandbox({ VERIFF_SANDBOX: '1' })).toBe(true)
    expect(veriffIsSandbox({ VERIFF_SANDBOX: 'true' })).toBe(true)
    expect(veriffIsSandbox({ VERIFF_SANDBOX: 'off' })).toBe(false)
    expect(read('app/api/verify/[token]/start/route.ts')).toContain("session_id: session.id, sandbox: avail.sandbox,")
    expect(read('lib/verify/store.ts')).toContain('sandbox: veriffIsSandbox() }')
  })
  it('the credit route is limited per token, per IP and site-wide', () => {
    expect(VERIFY_LIMITS.credit.perToken).toBeLessThanOrEqual(10)
    expect(read('app/api/verify/[token]/credit/route.ts')).toContain("if (!(await underVerifyLimits('credit', token, req.headers)))")
  })
})

describe('S3-14 · billing routes answer 403 without a landlord hat', () => {
  it('portal and resume', () => {
    for (const p of ['app/api/stripe/portal/route.ts', 'app/api/stripe/resume/route.ts']) {
      expect(read(p), p).toContain("if (!landlord) return NextResponse.json({ error: 'landlord_required' }, { status: 403 })")
    }
  })
})

describe('S3-15 / 16 / 17 / 18 · database clean-ups', () => {
  it('the demo seed is dropped and nothing calls it', () => {
    expect(MIG).toContain('drop function if exists public.seed_demo_agent_data(text);')
    for (const p of [...walk('app'), ...walk('lib'), ...walk('components')]) expect(read(p), p).not.toContain('seed_demo_agent_data')
    expect(read('lib/agent/session-loader.ts')).not.toMatch(/seedDemo\s*[?:]/)
  })
  it('email_unsubscribes has no open insert', () => {
    expect(MIG).toContain('drop policy if exists "Anyone can unsubscribe with token" on public.email_unsubscribes;')
    expect(MIG).toContain('revoke all on public.email_unsubscribes from anon, authenticated;')
  })
  it('a revoked or expired invite cannot be declined', () => {
    const fn = fnBody('decline_household_invite')
    expect(fn).toContain("if v_inv.revoked_at is not null then raise exception 'invite revoked'; end if;")
    expect(fn).toContain("if v_inv.expires_at is not null and v_inv.expires_at < now() then raise exception 'invite expired'; end if;")
  })
  it('public listings are active and verified, in the policy and in the shared filter', () => {
    expect(MIG).toMatch(/create policy "Public can read verified listings" on public\.listings\s+for select to public\s+using \(is_active = true and verification_status = 'verified'\);/)
    expect(LISTING_VISIBILITY_OR).toBe('verification_status.eq.verified')
  })
  it('no single-row visibility check re-admits an unverified Realtor.ca row (2026-11-16)', () => {
    for (const f of ['app/api/listings/[slug]/route.ts', 'app/api/listings/enrich/route.ts', 'app/dashboard/page.tsx']) {
      expect(read(f), f).not.toMatch(/verified'\s*\|\|[^\n]*source\)?\s*===\s*'realtor'/)
    }
    expect(read('app/api/listings/[slug]/route.ts')).toContain("const publiclyVisible = l.verification_status === 'verified' && l.display_internet !== false && !stale")
    expect(read('app/api/listings/enrich/route.ts')).toContain("if (!l || !l.is_active || l.verification_status !== 'verified') return")
  })
})

describe('S3-19 … S3-23 · deploy and repo hygiene', () => {
  it('the Worker has no workers.dev hostname', () => {
    expect(read('wrangler.jsonc')).toMatch(/"workers_dev": false,/)
  })
  it('workflow inputs are passed through the environment, and the benchmark job is scoped', () => {
    const kb = read('.github/workflows/kb-refresh.yml')
    expect(kb).not.toContain("format('--only={0}', inputs.only)")
    expect(kb).not.toContain('"${{ inputs.dry_run }}"')
    expect(kb).toContain('./node_modules/.bin/tsx scripts/kb/ingest.ts "${ARGS[@]}"')
    expect(kb).toContain('INPUT_ONLY: ${{ inputs.only }}')
    const rent = read('.github/workflows/rent-benchmarks-refresh.yml')
    expect(rent).toMatch(/\npermissions:\n  contents: read\n/)
    expect(rent).toContain('timeout-minutes: 15')
    expect(rent.slice(0, rent.indexOf('steps:'))).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(read('scripts/rent-benchmarks/load.mjs')).toContain('if (rows.length === 0) {')
  })
  it('the deploy script is tracked, the old log is not, and the old scripts left the root', () => {
    expect(read('.gitignore')).toContain('!/ship2-v53.command')
    expect(existsSync(join(ROOT, 'ship2-v53.command'))).toBe(true)
    expect(existsSync(join(ROOT, 'ship-v53.log'))).toBe(false)
    expect(readdirSync(ROOT).filter((f) => f.endsWith('.command'))).toEqual(['ship2-v53.command'])
  })
  it('Sentry rides waitUntil and its DSN can be synced', () => {
    expect(read('lib/observability/sentry.ts')).toContain('afterResponse(fetch(url, {')
    expect(read('scripts/worker-secrets-sync.sh')).toMatch(/OPTIONAL="[^"]*SENTRY_DSN[^"]*"/)
  })
})

describe('S3-24 … S3-32 · signed-in pages', () => {
  it('no native dialogs on the landlord dashboard or the showing feedback page', () => {
    for (const p of ['app/dashboard/page.tsx', 'app/agent/showings/[id]/feedback/page.tsx']) {
      expect(read(p).replace(/\/\/.*$/gm, ''), p).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\(/)
    }
    expect(read('app/dashboard/page.tsx')).toContain('data-testid="dashboard-notice"')
  })
  it('四枚章 is gone from the two places the older guards did not cover', () => {
    expect(read('lib/i18n.tsx')).not.toMatch(/四枚章|first of four/)
    expect(read('lib/agent/prompts.ts')).not.toContain('四枚章')
  })
  it('URL params are stripped through the helper, effects depend on the user object', () => {
    expect(read('app/agent/earnings/page.tsx')).toContain("stripUrlParams('all')")
    expect(read('app/agent/earnings/page.tsx')).not.toContain('history.replaceState')
    expect(read('app/h/[id]/page.tsx')).toContain('}, [user, id, load])')
    expect(read('app/listings/page.tsx')).not.toMatch(/\}, \[user\?\.id, loading,/)
  })
  it('pages export nothing extra', () => {
    expect(read('app/landlord/leases/page.tsx')).not.toContain('export const LEASE_ACTIVITY_ACTIONS')
    expect(read('app/landlord/applicants/page.tsx')).not.toContain('export function verifiedTierFromSnapshot')
  })
  it('dead files are gone and the cron secret has one comparison', () => {
    expect(existsSync(join(ROOT, 'components/AuthModal.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'components/v4/SecHead.tsx'))).toBe(false)
    for (const p of ['app/api/agent/proactive/route.ts', 'app/api/agent/reflect/route.ts', 'app/api/cron/agent-routines/route.ts']) {
      const s = read(p)
      expect(s, p).toContain('await secretMatches(')
      expect(s, p).not.toContain('function timingSafeEqual')
    }
  })
  it('a failed read has its own screen', () => {
    expect(read('app/h/[id]/page.tsx')).toContain('data-testid="household-load-failed"')
    expect(read('app/landlord/applicants/[id]/page.tsx')).toContain('data-testid="application-load-failed"')
    const p = read('app/tenant/passport/page.tsx')
    for (const id of ['share-load-failed', 'share-action-error', 'pack-load-failed']) expect(p, id).toContain(`data-testid="${id}"`)
  })
  it('cards are drafted in the interface language and the default subject names no "agent"', () => {
    expect(read('app/landlord/applicants/[id]/page.tsx')).toContain('zh ? insertCard(title, summary) : insertCard(titleEn, summaryEn)')
    expect(read('components/household/PaymentPlanDraft.tsx')).toContain("data_scope: zh ? ['租金记录', '还款计划'] : ['Rent record', 'Repayment plan']")
    const ex = read('app/api/agent/execute/route.ts')
    expect(ex).not.toMatch(/Stayloop 代理|Stayloop agent/)
    expect(ex).toContain("'经 Stayloop 发来的消息 / A message sent through Stayloop'")
  })
  it('a provider website becomes a link only when it is a real http(s) address', () => {
    expect(externalHref('example.com')).toBe('https://example.com/')
    expect(externalHref(' https://example.com/about ')).toBe('https://example.com/about')
    expect(externalHref('//example.com/x')).toBe('https://example.com/x')
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'localhost', 'mailto:a@b.com', 'https://user:pw@example.com', 'exa mple.com', 'ftp://example.com', '', null, undefined, 'https://example.com/\tx']) {
      expect(externalHref(bad as string | null | undefined), String(bad)).toBeNull()
    }
    expect(externalHrefLabel('https://example.com/')).toBe('example.com')
    // since 2026-11-22 the website sits on the provider's page, not on the directory rows
    expect(read('app/providers/[id]/page.tsx')).toContain('rel="noopener noreferrer nofollow"')
    expect(read('app/providers/[id]/page.tsx')).toContain('const site = p ? externalHref(p.website) : null')
    expect(read('app/provider/onboard/page.tsx')).toContain('const website = f.website.trim() ? externalHref(f.website) : null')
  })
})
