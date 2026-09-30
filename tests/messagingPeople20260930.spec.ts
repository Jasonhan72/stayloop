// 找得到人 (2026-09-30 · user: "现在很难找到对象去发消息"; "导出证据包…改成导出聊天记录")
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { audienceLine, counterpartGroup, counterpartLine, initialOf, isTwoParty, personName, type Person } from '@/lib/threads/shared'
import { cleanDisplayName } from '@/lib/displayName'

const read = (p: string) => readFileSync(p, 'utf8')
const sql = read('supabase/migrations/20260930_messaging_people.sql')

describe('people are named, never addressed', () => {
  it('person_name sanitises and is not callable by API roles; the lookups are party-gated', () => {
    const pn = sql.slice(sql.indexOf('create or replace function public.person_name'), sql.indexOf('-- Batched'))
    expect(pn).toContain("n ~ '@'")
    expect(pn).toContain("n ~ '\\d{6,}'")
    expect(pn).toContain("n ~* 'stayloop'")
    expect(pn).toContain("raw_user_meta_data ->> 'display_name'")
    expect(sql).toContain('revoke all on function public.person_name(uuid) from public, anon, authenticated;')
    expect(sql).toContain('revoke all on function public.person_names(uuid[]) from public, anon, authenticated;')
    const pf = sql.slice(sql.indexOf('create or replace function public.people_for'), sql.indexOf('create or replace function public.thread_people'))
    expect(pf).toContain('public.party_for(p_kind, p_ref, p_listing, p_subject) is null then return')
    // an external contractor is named by the name the landlord typed, never by their address
    expect(pf).toContain("nullif(trim(w.external_name), ''), 'external'")
    expect(pf).not.toMatch(/select[^;]*external_email[^;]*,\s*'external'/)
  })
  it('the sender name is stamped at send time and is outside the hash (no fingerprint changes)', () => {
    expect(sql).toContain('new.sender_label := public.my_sender_label(new.thread_id);')
    expect(sql).not.toContain('new.sender_label := null;')
    const canon = read('supabase/migrations/20260929_messaging_a.sql')
    const fn = canon.slice(canon.indexOf('function public.thread_message_canonical'), canon.indexOf('$$;', canon.indexOf('function public.thread_message_canonical')))
    expect(fn).not.toContain('sender_label')
  })
  it('the admin shortcut comes after every real relationship', () => {
    const pf = sql.slice(sql.indexOf('create or replace function public.party_for'), sql.indexOf('-- ── people_for'))
    expect(pf.indexOf("if r is null and public.is_stayloop_admin() then r := 'admin'; end if;")).toBeGreaterThan(pf.indexOf("elsif p_kind = 'support' then"))
    expect(pf).toContain("d.status = 'active' and d.expires_at > now()")
  })
  it('a contractor’s personal email is the landlord’s alone', () => {
    expect(sql).toContain('revoke select (external_email) on public.work_orders from authenticated;')
    expect(read('lib/marketplace/workOrders.ts')).not.toMatch(/'external_email'/)
    expect(read('components/marketplace/WorkOrderCard.tsx')).not.toContain('wo.external_email ||')
    expect(read('components/household/MaintenancePanel.tsx')).not.toContain('w.external_email ||')
    expect(read('app/landlord/providers/page.tsx')).toContain("supabase.rpc('my_external_contacts')")
    expect(read('app/admin/providers/page.tsx')).not.toContain('external_email')
  })
  it('a tenant never sees the landlord’s address in an approval preview or receipt, and writes into the tenancy thread', () => {
    const ex = read('app/api/agent/execute/route.ts')
    expect(ex).not.toContain('PREVIEW({ subject, body, to: ll.email })')
    expect(ex).not.toContain('sent_to: ll.email')
    expect(ex).toContain("if (derived && tenancyId) {")
    expect(ex).toContain("await ensureThread(admin, 'tenancy', tenancyId,")
  })
  it('the participants route answers under the caller’s JWT and returns no address', () => {
    const r = read('app/api/threads/participants/route.ts')
    expect(r).toContain("sb.rpc('thread_people', { p_thread: tid })")
    expect(r).toContain("sb.rpc('people_for', args)")
    expect(r).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(r).toContain("!r.name.includes('@')")
  })
})

describe('naming helpers', () => {
  const p = (name: string | null, role: string, is_me = false): Person => ({ user_id: null, name, role, channel: 'app', pending: false, is_me })
  it('a name, else the role word; initials; several people', () => {
    expect(personName('Sarah Wang', 'landlord', true)).toBe('Sarah Wang')
    expect(personName('', 'landlord', true)).toBe('房东')
    expect(personName(null, 'external', false)).toBe('Contractor')
    expect(initialOf('sarah', 'landlord', true)).toBe('S')
    expect(initialOf('王小明', 'tenant', true)).toBe('王')
    expect(initialOf(null, 'admin', true)).toBe('S')
    expect(counterpartLine(['Northline', 'Mia'], ['provider', 'tenant'], true)).toBe('Northline、Mia')
    expect(counterpartLine(['A', 'B', 'C'], ['tenant', 'tenant', 'tenant'], true)).toBe('A、B 等 3 人')
    expect(counterpartLine([''], ['landlord'], false)).toBe('Landlord')
    expect(counterpartLine([], [], true)).toBe('只有你')
  })
  it('only a two-party conversation may say 「发消息给 X」; groups by who is on the other side', () => {
    expect(isTwoParty(['landlord'])).toBe(true)
    expect(isTwoParty(['landlord', 'provider'])).toBe(false)
    expect(counterpartGroup('application', ['tenant'])).toBe('applicant')
    expect(counterpartGroup('work_order', ['landlord', 'provider'])).toBe('provider')
    expect(counterpartGroup('support', ['admin'])).toBe('stayloop')
    expect(counterpartGroup('tenancy', ['landlord'])).toBe('landlord')
  })
  it('the audience line names everyone who reads it, and says so when nobody else can', () => {
    expect(audienceLine([p('Sarah', 'landlord'), p(null, 'provider'), p('Me', 'tenant', true)], true)).toBe('这段对话里的每个人都能看到：Sarah（房东）、服务商、你')
    expect(audienceLine([p('Me', 'tenant', true)], true)).toBe('这件事里还没有其他人能收到消息')
  })
  it('display names drop addresses, long numbers and "Stayloop"', () => {
    expect(cleanDisplayName('  Sarah   Wang ')).toBe('Sarah Wang')
    expect(cleanDisplayName('sarah@example.com')).toBeNull()
    expect(cleanDisplayName('4165551234')).toBeNull()
    expect(cleanDisplayName('Stayloop 客服')).toBeNull()
    expect(cleanDisplayName('')).toBe('')
  })
})

describe('finding the person: the message centre and 新消息', () => {
  const c = read('components/messages/MessageCenter.tsx')
  const n = read('components/messages/NewMessage.tsx')
  it('the list leads with names; search and filters are by the people on the other side', () => {
    expect(read('supabase/migrations/20260930_messaging_people.sql')).toContain('counterpart_names text[], counterpart_roles text[]')
    expect(c).toContain('data-testid="inbox-row-name">{nameLine(r)}')
    expect(c).toContain('...(r.counterpart_names ?? [])')
    expect(c).toContain("(['landlord', 'tenant', 'applicant', 'provider', 'agent', 'stayloop'] as const)")
    expect(c).toContain('data-testid="contact-stayloop"')
    expect(c).toContain('data-testid="quick-people"')
  })
  it('deep links: an existing thread opens directly with the composer focused; ?matter filters', () => {
    expect(c).toContain("supabase.rpc('find_thread', { p_kind: parsed.kind, p_ref: parsed.ref })")
    expect(c).toContain('router.replace(`/messages?t=${String(data)}&compose=1`)')
    expect(c).toContain('focusComposer={compose}')
    expect(c).toContain('r.matter_id === matterFilter')
    expect(read('components/threads/ThreadPanel.tsx')).toContain('const d = takeDraft(kind, refId)')
  })
  it('新消息 starts from people, asks which matter only when there are several, opens existing conversations', () => {
    expect(n).toContain("(zh ? '发给谁？' : 'Who is it for?')")
    expect(n).toContain('if (c.targets.length === 1) { choose(c.targets[0]); return }')
    expect(n).toContain('if (t.thread_id) { onOpenThread(t.thread_id); return }')
    expect(n).toContain('data-testid="audience-line"')
    expect(n).toContain('disabled={busy || (!draft.trim() && !files.length) || nobodyElse || !!peopleErr}')
    // the read-only 「发给谁」 preview step is gone
    expect(n).not.toContain('STEP {step} / 3')
  })
  it('export works at every width (⋯ menu) and says 聊天记录, not 证据包', () => {
    expect(c).toContain('data-testid="conversation-menu"')
    expect(c).toContain("'导出聊天记录（可打印）'")
    expect(c).toContain("'导出聊天记录 JSON（供复核）'")
    const ui = ['components/messages/MessageCenter.tsx', 'components/matters/MattersPanel.tsx', 'components/home/HomeNext.tsx', 'lib/agent/ideas.ts', 'lib/export/evidencePack.ts']
    for (const f of ui) expect(read(f), f).not.toContain('证据包')
    expect(read('components/matters/MattersPanel.tsx')).toContain('data-testid="export-chat-history"')
  })
  it('phones: the list and the conversation fit the column; the More tab shows unread messages', () => {
    expect(c).toContain('sl-msg-col')
    expect(read('app/globals.css')).toContain('.sl-msg-col { height: calc(100dvh - 121px - env(safe-area-inset-bottom)); }')
    expect(read('components/workspace/rail.tsx')).toContain('data-testid="more-unread"')
  })
  it('one shared 「发消息」 button that resolves on click', () => {
    expect(existsSync('components/messages/MessageButton.tsx')).toBe(true)
    const b = read('components/messages/MessageButton.tsx')
    expect(b).toContain('router.push(await resolveThreadHref(target))')
    const o = read('lib/messages/openThread.ts')
    expect(o).toContain("window.sessionStorage.setItem(draftKey(kind, ref)")
    expect(o).not.toMatch(/\?[^`]*draft=/)
  })
  it('settings has a 显示名 and a way to reach Stayloop', () => {
    expect(read('app/settings/page.tsx')).toContain('<DisplayNameCard zh={zh} />')
    expect(read('components/settings/DisplayNameCard.tsx')).toContain('data: { display_name: v || null }')
  })
})

describe('review 2026-09-30 (21 confirmed findings)', () => {
  const fix = read('supabase/migrations/20260930_messaging_people_fixes.sql')
  const server = read('lib/threads/server.ts')
  it('listing-inquiry people and party come from the stored thread, never the caller’s arguments', () => {
    const pf = fix.slice(fix.indexOf('create or replace function public.people_for'), fix.indexOf('-- ── 4.'))
    expect(pf).toContain("select x.listing_id, x.subject_user into th from public.threads x where x.kind = 'listing_inquiry' and x.ref_id = p_ref;")
    expect(pf).toContain('if not found then return; end if;')
  })
  it('a Realtor.ca import has no landlord party or person; the client check fails closed', () => {
    expect((fix.match(/l\.source is distinct from 'realtor'/g) || []).length).toBeGreaterThanOrEqual(4)
    const hook = read('lib/messages/realtorListings.ts')
    expect(hook).toContain("supabase.rpc('listing_sources'")
    expect(hook).toContain('if (error) { setSet(new Set(key.split(\',\'))); return }')
  })
  it('an invitee gets a notice with the invitation link and no reply address; every reply re-checks the party', () => {
    expect(server).toContain('const token = party.pending ? null : await replyTokenFor(')
    expect(server).toContain('`${SITE()}/join/${party.inviteToken}`')
    expect(server).toContain('if (row.revoked_at || !(await tokenStillParty(admin, row)))')
    expect(server).toContain("if (th.kind === 'tenancy') return !!row.user_id && (await activeMember(th.ref_id, row.user_id))")
    expect(fix).toContain("raise exception 'landlord_already_member';")
    expect(fix).toContain('revoke select (invited_email) on public.household_invites from authenticated;')
  })
  it('"Stayloop" cannot be faked with spaces, width or zero-width characters', async () => {
    expect(fix).toContain('normalize(n, NFKC)')
    const { cleanDisplayName } = await import('@/lib/displayName')
    expect(cleanDisplayName('Stay loop')).toBeNull()
    expect(cleanDisplayName('Ｓｔａｙｌｏｏｐ')).toBeNull()
    expect(cleanDisplayName('Stay​loop 客服')).toBeNull()
    expect(cleanDisplayName('S.t.a.y.l.o.o.p')).toBeNull()
    expect(cleanDisplayName('Mia Chen')).toBe('Mia Chen')
  })
  it('notifications always carry the role; receipts and relayed messages name people by the sanitised name', () => {
    expect(read('app/api/threads/notify/route.ts')).toContain('senderLabel: base ? `${base}（${role.split(\' / \')[0]}） / ${base} (${role.split(\' / \').pop()})` : role')
    expect(read('app/api/work-orders/[id]/receipt/route.ts')).not.toContain('ll?.user?.email')
    expect(server).toContain("await admin.rpc('person_names', { p_users: [userId] })")
  })
  it('unnamed people are counted, not merged; Stayloop’s own addresses are not masked', async () => {
    expect(counterpartLine(['', ''], ['tenant', 'tenant'], true)).toBe('租客 ×2')
    expect(counterpartLine(['Sarah', ''], ['landlord', 'tenant'], true)).toBe('Sarah、租客')
    const { maskEmails } = await import('@/lib/relay')
    expect(maskEmails('写信到 privacy@stayloop.ai 或 t-abc@reply.stayloop.ai', '租客')).toBe('写信到 privacy@stayloop.ai 或 t-abc@reply.stayloop.ai')
    expect(maskEmails('发给 mia.chen@example.com', '租客')).toBe('发给 租客')
    expect(read('components/messages/NewMessage.tsx')).toContain("const allNamed = t.people_names.length > 0 && t.people_names.every((n) => !!n)")
  })
  it('an empty conversation still opens; the tenant relay reports a conversation, not an email', () => {
    expect(read('components/messages/MessageCenter.tsx')).toContain("supabase.rpc('thread_people', { p_thread: selected })")
    expect(read('lib/agent/chatCopy.ts')).toContain('消息已发到在管租约对话（对话里的每个人都能看到）')
    const ex = read('app/api/agent/execute/route.ts')
    expect(ex).toContain(".eq('role', 'tenant').eq('status', 'active')")
    expect(ex).toContain("if (preview) return PREVIEW({ subject: '', body: bodyText, to: null })")
  })
})
