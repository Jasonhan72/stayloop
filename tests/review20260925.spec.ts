// Code + module review of the 2026-09-25 work (user: "做一下代码review和模块关系的
// review，包含网页端和手机端"). Each block pins one confirmed finding.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('showing_intents: parties can read and submit, never rewrite (FOR ALL policy gap)', () => {
  it('a BEFORE UPDATE OR DELETE guard blocks direct clients; the service role still settles status', () => {
    const sql = read('supabase/migrations/20260925_showing_intents_guard.sql')
    expect(sql).toContain('if public.is_direct_client_write() and not public.is_stayloop_admin() then')
    expect(sql).toContain("raise exception 'showing_intents are read-only for clients after submission' using errcode = '42501'")
    expect(sql).toContain('before update or delete on public.showing_intents')
    expect(sql).toContain('security invoker') // current_user must be the caller, not the owner, for is_direct_client_write()
    expect(sql).toContain('revoke execute on function public.guard_showing_intent_writes() from public, anon, authenticated')
    // The only writers: the tenant's insert through the caller's client and the service role's status update.
    const route = read('app/api/showing-intent/route.ts')
    expect(route).toContain("sb.from('showing_intents').insert({")
    expect(route).not.toMatch(/from\('showing_intents'\)\s*\.(update|delete)\(/)
    expect(read('app/api/agent/execute/route.ts')).toContain("admin.from('showing_intents').update({ status: 'accepted' })")
  })
})

describe('function ACLs: revoking anon is a no-op while PUBLIC still holds EXECUTE', () => {
  it('the fix migration revokes from PUBLIC too and re-grants the intended callers', () => {
    const sql = read('supabase/migrations/20260925_function_public_execute.sql')
    expect(sql).toContain("execute format('revoke execute on function %s from public, anon', f.sig)")
    expect(sql).toContain("execute format('grant execute on function %s to authenticated, service_role', f.sig)")
    expect(sql).toContain("execute format('revoke execute on function %s from public, anon, authenticated', f.sig)")
    expect(sql).toContain("p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)")
    for (const fn of ['seed_demo_agent_data', 'decide_pending_action', 'bootstrap_agent_session', 'claim_tenant', 'lookup_corp_by_bn', 'search_corp_registry', 'get_entitlements']) expect(sql).toContain(`'${fn}'`)
    expect(sql).toContain('alter function public.listings_price_history() set search_path = public, pg_temp')
  })
  it('migrations after the fix never revoke anon without also revoking PUBLIC', () => {
    // Forward guard: the 09-22 and 09-25 files that revoked anon alone are superseded by the fix
    // migration above; anything newer has to name PUBLIC in the same revoke.
    const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && f > '20260925_function_public_execute.sql' && !f.startsWith('20260925_'))
    for (const f of files) {
      const sql = read(`supabase/migrations/${f}`).replace(/--[^\n]*/g, '')
      for (const m of sql.matchAll(/revoke\s+(?:execute|all)\s+on\s+function\s+[^;]*?\s+from\s+([^;]+);/gi)) {
        const roles = m[1].toLowerCase()
        if (roles.includes('anon')) expect(roles, `${f}: ${m[0].slice(0, 120)}`).toContain('public')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Code review of the 2026-09-25 work: web + phone. Three read-only reviewers
// (assistant/workbench · listing detail · tenant/landlord data layer) + a
// module graph. Each block below pins one confirmed fix.
import { rememberableRoleFromPath, roleFromPath } from '@/lib/activeRole'
import { sameProperty } from '@/lib/agent/draftReconcile'
import { groupFeatures, lastPriceChange, transitKind, transitLines } from '@/lib/listingInsights'

describe('active hat: the remembered role must be a hat the account holds', () => {
  it('gate pages are never remembered as a choice; the route still names the UI context', () => {
    expect(roleFromPath('/landlord/become')).toBe('landlord')
    expect(rememberableRoleFromPath('/landlord/become')).toBeNull()
    expect(rememberableRoleFromPath('/agent/verify')).toBeNull()
    expect(rememberableRoleFromPath('/screening/app?as=agent')).toBeNull()
    expect(rememberableRoleFromPath('/landlord/agent')).toBe('landlord')
    expect(rememberableRoleFromPath('/tenant/todo')).toBe('tenant')
  })
  it('one predicate (activeHat) in the header, /settings, the home hero and the phone bar; the bar waits for hats', () => {
    const hats = read('lib/useHats.ts')
    expect(hats).toContain('export function heldHat(')
    expect(hats).toContain('export function activeHat(')
    expect(hats).toContain("if (role === 'agent') return !!h.agent && isRegistrationLive(h.agent)")
    for (const f of ['components/Header.tsx', 'app/settings/page.tsx', 'app/settings/models/page.tsx', 'components/home/HomeNext.tsx', 'components/MobileBottomNav.tsx']) {
      expect(read(f), f).toContain('activeHat(hats, auth.role)')
      expect(read(f), f).not.toContain('auth.role || bestHat(hats)')
    }
    const nav = read('components/MobileBottomNav.tsx')
    expect(nav).toContain('if (hats.loading) return null')
    expect(nav).not.toContain('hats.loading || hats.landlord') // loading was treated as "holds the hat"
    expect(nav).not.toContain('const HOME') // dead branch removed
    expect(read('lib/useAuth.ts')).toContain('const r = rememberableRoleFromPath(pathname)')
  })
})

describe('conversation threads: loading is not a change; a reply lands in the thread it was asked in', () => {
  const s = read('lib/agent/useAgentSession.ts')
  it('the loaded array is remembered and skipped by every persist path', () => {
    expect(s).toContain('const lastAppliedRef = useRef<ChatMessage[] | null>(null)')
    expect(s).toContain('lastAppliedRef.current = next')
    expect(s).toContain('if (messages === lastAppliedRef.current) return // loaded, not changed')
    expect(s).toContain('if (msgs.length <= 1 || msgs === lastAppliedRef.current) return')
    expect(s).toContain('messagesRef.current !== lastAppliedRef.current) void saveThread(')
  })
  it('sending waits for the thread to resolve; "+" and opening another thread invalidate in-flight work', () => {
    expect(s).toContain('if (resolvingRef.current) await resolvingRef.current')
    expect(s).toContain('const resolvingRef = useRef<Promise<void> | null>(null)')
    expect(s).toContain('if (!id || gen !== resolveGen.current) return null')
    expect(s.slice(s.indexOf('const newThread = useCallback'), s.indexOf('const openThread = useCallback'))).toContain('resolveGen.current++')
    expect(s.slice(s.indexOf('const openThread = useCallback'), s.indexOf('// The rail\'s "+"'))).toContain('resolvingRef.current = p')
  })
  it('a late reply or "已执行" line is appended to the original thread row, then the panel is told', () => {
    expect(s).toContain('let sentThread: string | null = null')
    expect(s).toContain('if (sentThread && threadIdRef.current !== sentThread) {')
    expect(s).toContain('void appendToThread(getSupabaseBrowser(), sentThread, [reply]).then(() => notifyActivityChanged())')
    expect(s).toContain('const startedIn = threadIdRef.current')
    expect(s).toContain('if (startedIn && threadIdRef.current !== startedIn) void appendToThread(getSupabaseBrowser(), startedIn, [doneMsg])')
    expect(s).toContain("? 'maintenance request'")
    // undo: the audit row exists before the badges re-read
    const undo = s.slice(s.indexOf('const undo = useCallback'))
    expect(undo.indexOf("action: 'approval_undone'")).toBeLessThan(undo.indexOf('notifyPendingChanged()'))
    expect(read('lib/agent/threads.ts')).toContain('export async function appendToThread(')
  })
  it('the chat disables input while a thread loads and resets per-thread UI state on switch', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('disabled={thinking || threadLoading}')
    expect(chat).toMatch(/setDecided\(\[\]\)\s+setListingOffset\(\{\}\)\s+setChipDraft\(null\)\s+\}, \[currentThreadId\]\)/)
  })
  it('hidden panels do not fetch; the activity event name has one home', () => {
    expect(read('lib/agent/useActivityLog.ts')).toContain('export function useActivityLog(live: boolean, limit = 30, enabled = true)')
    const panel = read('components/agent/AssistantPanel.tsx')
    expect(panel).toContain("window.matchMedia('(min-width: 1024px)')")
    expect(panel).toContain('useActivityLog(live, 30, visible)')
    expect(panel).toContain("!avatar || avatar === 'default'")
    expect(read('lib/agent/pendingCount.ts')).toContain("import { ACTIVITY_CHANGED_EVENT } from './useActivityLog'")
    expect(read('lib/agent/pendingCount.ts')).not.toContain("new Event('sl-activity-changed')")
  })
  it('the saved avatar wins on a live session and is mirrored locally', () => {
    const p = read('components/agent/AgentWorkspacePage.tsx') // the shared assistant page (2026-09-25)
    expect(p).toContain("if (live && hasData) { setAvatar(dbAvatar); setStoredAvatar(dbAvatar ?? 'default') }")
    expect(p).toContain('else setAvatar(getStoredAvatar() ?? dbAvatar)')
  })
  it('draft reconcile: same property means the same street NAME, not its first three letters', () => {
    expect(sameProperty('100 King St W', '100 Kingston Rd')).toBe(false)
    expect(sameProperty('1001 Bay St', '1001 Bayview Ave')).toBe(false)
    expect(sameProperty('1001 Bay St', '1001 Bay Street, Toronto')).toBe(true)
    expect(sameProperty('280 Dundas Street W', '280 Dundas St W #515')).toBe(true)
    expect(sameProperty('280 Dundas St W', '281 Dundas St W')).toBe(false)
  })
})

describe('phone: one safe-area-aware bottom bar; sample pages say they are samples', () => {
  it('the tab bar pads the safe area outside its 64px row; the workbench column and shell subtract it', () => {
    const rail = read('components/workspace/rail.tsx')
    expect(rail).toContain("style={{ background: '#FFFFFF', paddingBottom: 'env(safe-area-inset-bottom)' }}")
    expect(rail).toContain('<div className="flex h-16 items-stretch justify-between px-1">')
    expect(rail).not.toContain('h-16 items-stretch justify-between border-t border-line-divider px-1 pb-[env(safe-area-inset-bottom)]')
    expect(rail).toContain("style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}")
    const css = read('app/globals.css')
    expect(css).toContain('.sl-phone-col { height: calc(100dvh - 121px - env(safe-area-inset-bottom)); }')
    expect(css).toContain('.sl-phone-pb { padding-bottom: calc(4rem + env(safe-area-inset-bottom)); }')
    expect(read('components/agent/AgentWorkspacePage.tsx')).toContain('sl-phone-col flex flex-col md:h-[calc(100vh-66px)] md:flex-row')
    expect(read('components/WorkspaceShell.tsx')).toContain("phoneApp ? 'sl-phone-pb min-w-0 flex-1 p-0 md:p-0'")
  })
  it('/x/ideas and /x/progress carry the preview notice for anonymous sessions (CLAUDE.md 示范数据标注)', () => {
    const rp = read('components/mobile/RolePages.tsx')
    expect((rp.match(/<PreviewNote zh=\{zh\}/g) || []).length).toBe(3)
    expect(rp).toContain('data-testid="preview-note"')
  })
  it('the identity menu (the only hat switcher since the final round) is made of menu items', () => {
    expect(read('components/Header.tsx')).toMatch(/role="menuitem"/)
    expect(existsSync('components/agent/HatChip.tsx')).toBe(false)
  })
})

describe('listing detail: failures are not facts, client writes cannot forge history, the primer runs in the background', () => {
  const route = read('app/api/listings/enrich/route.ts')
  const page = read('app/listings/[slug]/page.tsx')
  it('an OSM failure is marked and retried after an hour, never cached as "no station" for 30 days', () => {
    expect(route).toContain('const RETRY_MS = 60 * 60_000')
    expect(route).toContain("transit = { stations: [], fetched_at: new Date().toISOString(), failed: true }")
    expect(route).toContain('const fresh = !!transit && (transit.failed ? age < RETRY_MS : age < FRESH_MS)')
    expect(route).toContain('function readTransit(v: unknown): ListingTransit | null') // shape-checked before the page reads .stations.length
    expect(route).toContain("addressdetails: '1'") // the geocode must land in the listing's city
    expect(route).toContain('if (!cityOk && !fsaOk) return null')
    expect(page).toContain(') : insight.transit.failed ? (')
    expect(page).toContain("signal: AbortSignal.timeout(20_000)")
  })
  it('the neighbourhood name is whitelisted and delimited; the primer is generated after the response with a 24 h negative cache', () => {
    expect(route).toContain("export const SAFE_PLACE = /^[\\p{L}\\p{N} .,'&()\\/-]{2,60}$/u")
    expect(route).toContain('<place>${name}</place>')
    expect(route).toContain('const PROFILE_RETRY_MS = 24 * 60 * 60_000')
    expect(route).toContain('getRequestContext().ctx.waitUntil(p)')
    expect(route).toContain("if (error) console.warn('[listings/enrich] profile write failed', error.message)")
    expect(route).toContain('LISTING_VISIBILITY_OR')
    expect(route).not.toContain('Cache-Control') // POST responses are never cached
    expect(route).toContain('export function normCity(city: string): string')
  })
  it('the page: TRREB only for apartment / townhouse with a bedroom count, no days-on-market for imports, similar homes from the same city with usable photos, no dead ScoreCard', () => {
    expect(page).toContain("const trrebType = listing.property_type === 'townhouse' ? 'townhouse' : ['apartment', 'condo'].includes(listing.property_type || '') ? 'apartment' : null")
    expect(page).toContain("const dom = listing.source === 'realtor' ? null : daysOnMarket(listing.published_at || listing.created_at)")
    expect(page).toContain("h.event === 'imported' ? (zh ? '导入 Stayloop（Realtor.ca 挂牌）' : 'Imported (Realtor.ca listing)')")
    expect(page).toContain('xl:grid-cols-[1.15fr_1fr]')
    expect(page).toContain('.filter((x) => hasUsablePhotos(x.images))')
    expect(page).toContain(".ilike('city', `${String((data as DBListing).city || '').split(',')[0].trim()}%`)")
    expect(page).not.toContain('function ScoreCard(')
    expect(page).not.toContain('useMemo')
    expect(page).toContain("n === 1 ? (zh ? '仅 1 套在租（非中位）'")
    expect(page).toContain("insight?.neighborhood?.scope === 'city' ? (zh ? '相对全市' : 'vs the city')")
  })
  it('pure helpers: building words, numeric refs, VIA is rail, history sorted by date', () => {
    const g = groupFeatures({ amenities: ['Recreation Centre', 'Games Room', 'Car Wash', 'Intercom', 'Laundry - Coin Operated', 'Hot Tub', 'parking_spot', null as unknown as string, 'Balcony'] }, 'en')
    expect(g.building).toEqual(['Recreation Centre', 'Games Room', 'Car Wash', 'Intercom', 'Laundry - Coin Operated', 'Hot Tub', '1 parking spot'])
    expect(g.unit).toEqual(['Balcony'])
    expect(groupFeatures({ amenities: ['parking_spot'] }, 'zh').building).toEqual(['1 个车位'])
    expect(transitLines({ ref: '14234' })).toEqual([])
    expect(transitLines({ ref: '504' })).toEqual(['504'])
    expect(transitKind({ railway: 'station', network: 'VIA Rail' })).toBe('rail')
    expect(transitKind({ railway: 'station', network: 'GO Transit', train: 'yes' })).toBe('go')
    expect(lastPriceChange([{ date: '2026-09-20', price: 2650 }, { date: '2026-09-01', price: 2700 }])).toEqual({ date: '2026-09-20', delta: -50, pct: -1.9 })
    expect(lastPriceChange([{ date: '2026-09-01', price: 0 }, { date: '2026-09-20', price: 2650 }])).toBeNull()
  })
  it('DB: history / transit / pin are server-owned, neighbourhood re-queues the badge, imports say "imported"', () => {
    const sql = read('supabase/migrations/20260925_listing_geo_history_guard.sql')
    expect(sql).toContain('declare direct boolean := public.is_direct_client_write() and not public.is_stayloop_admin();')
    expect(sql).toContain('new.transit := null; new.enriched_at := null; new.lat := null; new.lng := null;')
    expect(sql).toContain('new.price_history := old.price_history;')
    expect(sql).toContain("'event', case when new.source = 'realtor' then 'imported' else 'listed' end")
    expect(sql).toContain('or new.neighborhood is distinct from old.neighborhood')
    expect(sql).toContain('create or replace view public.applicant_applications with (security_invoker = false) as')
    expect(sql).toContain("and coalesce(auth.jwt() ->> 'email', '') <> ''")
    expect(sql).toContain('create or replace view public.my_showing_intents with (security_invoker = false) as')
    expect(sql).toContain("check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 300)")
  })
})

describe('tenant / landlord walk-through fixes (review C)', () => {
  it('the application tracker matches its lease by application_id first; the dead status helper is gone', () => {
    const s = read('components/tenant/MyApplications.tsx')
    expect(s).toContain('const exact = leases.find((x) => x.application_id === r.id)')
    expect(s).toContain("select('id, application_id, status, unit_label, sent_at, signed_at, created_at')")
    expect(s).not.toContain('applicationStatusLabel')
  })
  it('my rent lists tenant-side tenancies only, with the real status vocabulary; showings use the inbox words', () => {
    const rent = read('components/tenant/MyRent.tsx')
    expect(rent).toContain(".eq('role', 'tenant')")
    expect(rent).toContain("failed: { zh: '失败', en: 'Failed' }")
    expect(rent).not.toContain("partial: '部分'")
    const sh = read('components/tenant/MyShowings.tsx')
    expect(sh).toContain("s === 'declined' ? (zh ? '房东婉拒' : 'Declined')")
    expect(sh).toContain('<div className="mt-0.5 break-words text-[12px] text-body-3">')
    expect(read('components/messages/Inbox.tsx')).toContain("supabase.from('my_showing_intents')")
  })
  it('the dashboard insight counts only listings the public can see; re-listing restarts the clock', () => {
    const d = read('app/dashboard/page.tsx')
    expect(d).toContain("verification_status === 'verified' || (l as { source?: string | null }).source === 'realtor'))")
    expect(d).toContain("const patch = next ? { is_active: true, published_at: new Date().toISOString() } : { is_active: false }")
  })
  it('lease activity is filtered on the server and live mode prints no invented counts', () => {
    const l = read('app/landlord/leases/page.tsx')
    expect(l).toContain(".in('action', LEASE_ACTIVITY_ACTIONS)")
    expect(l).not.toContain('.limit(80)')
    expect(l).toContain("right={liveMode ? undefined : (lang === 'zh' ? '本月新增 1' : '1 new this month')}")
    expect(l).toContain("right={liveMode ? undefined : (lang === 'zh' ? '近 6 个月' : 'Last 6 months')}")
    expect(l).toContain('rows.map(l => [leaseCode(l.id), l.id,')
    expect(read('lib/agent/renewalStages.ts')).toContain('export const NOTICE_DAYS = N1_NOTICE_DAYS')
  })
  it('the published-listing editor enforces the photo rule, edits the deposit and downscales photos; the apply page uploads every prepared file', () => {
    const e = read('app/dashboard/listings/[id]/edit/page.tsx')
    expect(e).toContain('if (form.is_active && !hasUsablePhotos(photos)) { setError(zh ? LISTING_PUBLISH_MSG.noPhotos.zh : LISTING_PUBLISH_MSG.noPhotos.en); return }')
    expect(e).toContain('deposit: form.deposit,')
    expect(e).toContain('const prep = await prepareUploads(picked)')
    const a = read('app/apply/[slug]/page.tsx')
    expect(a).toContain('const outFiles = prep.accepted.length ? prep.accepted.map((a) => a.file) : [raw]')
    expect(a).toContain('for (const [n, file] of outFiles.entries()) {')
  })
  it('sample fixtures name the real providers', () => {
    expect(read('app/tenant/payments/page.tsx')).not.toContain('Plaid')
    expect(read('app/landlord/applicants/[id]/page.tsx')).not.toContain('Plaid')
  })
})
