// 消息系统 A 期 (2026-09-29 · design/messaging-redesign-2026-09.html)
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { canonicalMessage, canonicalTimestamp, GENESIS, sha256Hex, verifyChain, type ChainMessage } from '@/lib/threads/hashChain'
import { bareAddress, newReplyToken, replyAddress, stripQuotedReply, tokenFromAddress, htmlToText, REPLY_MARKER } from '@/lib/threads/emailReply'
import { uuidV5 } from '@/lib/threads/server'
import { KIND_TAG, messageCenterHref, type ThreadKind } from '@/lib/threads/shared'

const read = (p: string) => readFileSync(p, 'utf8')
const sql = read('supabase/migrations/20260929_messaging_a.sql')
// Seven real messages exported from production (the tri-party test work order), hashes computed by the database trigger.
const fixture = JSON.parse(read('tests/fixtures/threadChain20260929.json')) as ChainMessage[]

describe('hash chain: the browser reproduces the database byte for byte', () => {
  it('the production fixture verifies (one attachment, system lines, a formal copy)', async () => {
    const r = await verifyChain(fixture)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(7)
    expect(r.head).toBe(fixture[fixture.length - 1].hash)
    expect(fixture.some((m) => (m.attachments ?? []).length > 0)).toBe(true)
  })
  it('editing a body, deleting a message, or reordering breaks the chain at the right place', async () => {
    const edited = fixture.map((m, i) => (i === 3 ? { ...m, body: m.body + ' ' } : m))
    expect((await verifyChain(edited)).brokenAt).toBe(fixture[3].id)
    const dropped = fixture.filter((_, i) => i !== 2)
    const r = await verifyChain(dropped)
    expect(r.ok).toBe(false)
    expect(r.brokenAt).toBe(fixture[3].id)
    expect(r.reason).toBe('prev_mismatch')
  })
  it('timestamps keep microseconds and normalise offsets to UTC', () => {
    expect(canonicalTimestamp('2026-09-27T04:13:52.575423+00:00')).toBe('2026-09-27T04:13:52.575423Z')
    expect(canonicalTimestamp('2026-09-27T00:13:52.5-04:00')).toBe('2026-09-27T04:13:52.500000Z')
    expect(canonicalTimestamp('2026-09-27T04:13:52Z')).toBe('2026-09-27T04:13:52.000000Z')
  })
  it('the first message chains from genesis, and the canonical form starts with the version', async () => {
    const m = fixture[0]
    expect(m.prev_hash).toBe(GENESIS)
    expect(canonicalMessage(m, GENESIS).split('\n')[0]).toBe('stayloop-thread-v1')
    expect(await sha256Hex(canonicalMessage(m, GENESIS))).toBe(m.hash)
  })
  it('the SQL canonical form and the TS one list the same fields in the same order', () => {
    const fn = sql.slice(sql.indexOf('function public.thread_message_canonical'), sql.indexOf('$$;', sql.indexOf('function public.thread_message_canonical')))
    const order = ['p_prev', 'm.id::text', 'm.thread_id::text', "to_char(m.created_at at time zone 'UTC'", 'm.sender_id::text', 'm.sender_kind', 'm.acting_role', 'm.kind', 'm.channel', 'm.ref_message_id::text', "(a ->> 'path') || ':' || (a ->> 'sha256')", 'm.body']
    let at = 0
    for (const f of order) { const i = fn.indexOf(f, at); expect(i, f).toBeGreaterThan(-1); at = i }
  })
})

describe('schema: the record cannot be deleted, by anyone', () => {
  it('delete / update refused for every role; truncate refused; threads restrict', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.thread_messages_append_only()'))
    expect(fn.slice(0, 300)).toContain("raise exception 'append_only'")
    expect(fn.slice(0, 300)).not.toContain('is_direct_client_write')
    expect(sql).toContain('before truncate on public.thread_messages')
    expect(sql).toContain('foreign key (thread_id) references public.threads(id) on delete restrict')
    expect(sql).toContain('foreign key (household_id) references public.households(id) on delete set null')
  })
  it('the chain trigger runs after the client guard (alphabetical), serialised per thread, for every writer', () => {
    expect(sql).toContain('create trigger trg_thread_messages_zz_chain before insert on public.thread_messages')
    expect('trg_thread_messages_zz_chain' > 'trg_thread_messages_before_insert').toBe(true)
    expect(sql).toContain('pg_advisory_xact_lock(hashtextextended(new.thread_id::text, 42))')
    expect(sql).toContain("new.channel := 'app';") // clients cannot claim an email / SMS channel
  })
  it('receipts and raw-inbound rows are append-only too; tokens are service-role only', () => {
    expect(sql).toContain('create trigger trg_message_deliveries_immutable before update or delete on public.message_deliveries')
    expect(sql).toContain('create trigger trg_thread_inbound_immutable before update or delete on public.thread_inbound')
    expect(sql).toMatch(/revoke all on public\.thread_reply_tokens, public\.message_deliveries, public\.thread_inbound from public, anon, authenticated, service_role/)
    expect(sql).not.toMatch(/grant select[^;]*on public\.thread_reply_tokens to authenticated/)
    expect(sql).not.toMatch(/grant select \([^)]*recipient_address/)
  })
  it('new functions are locked with "from public, anon"', () => {
    for (const f of ['party_for(text, uuid, uuid, uuid)', 'my_threads()', 'my_unread_messages()', 'my_message_targets()', 'open_thread(text, uuid)']) {
      expect(sql).toContain(`revoke execute on function public.${f} from public, anon;`)
    }
  })
  it('three new kinds, and the party rules for them', () => {
    expect(sql).toContain("'listing_inquiry', 'agent_client', 'support'")
    const pf = sql.slice(sql.indexOf('create or replace function public.party_for'), sql.indexOf('create or replace function public.thread_party'))
    expect(pf).toContain("if p_subject = uid then return 'tenant'; end if;")
    expect(pf).toContain('c.agent_auth_id = uid')
    expect(pf).toContain("if p_ref = uid then return 'member'; end if;")
    // listing inquiries are opened by the server only (the prospect is the subject)
    const ot = sql.slice(sql.indexOf('create or replace function public.open_thread'), sql.indexOf('-- ── 3.'))
    expect(ot).not.toContain("'listing_inquiry', 'agent_client'")
  })
  it('realtime publishes messages and read marks (RLS applies)', () => {
    expect(sql).toContain('alter publication supabase_realtime add table public.thread_messages')
    expect(sql).toContain('alter publication supabase_realtime add table public.message_reads')
  })
})

describe('email replies', () => {
  it('reply tokens: fresh, lowercase, found in any recipient form', () => {
    const t = newReplyToken()
    expect(t).toMatch(/^[a-z0-9]{32}$/)
    expect(newReplyToken()).not.toBe(t)
    expect(tokenFromAddress(replyAddress(t))).toBe(t)
    expect(tokenFromAddress(`"Stayloop" <${replyAddress(t).toUpperCase()}>`)).toBe(t)
    expect(tokenFromAddress('t-abc@reply.stayloop.ai')).toBeNull()
    expect(tokenFromAddress(`t-${t}@reply.stayloop.ai.evil.com`)).toBeNull()
    expect(tokenFromAddress(`t-${t}@evil.com`)).toBeNull()
    expect(bareAddress('Mia Chen <Mia@Example.com>')).toBe('mia@example.com')
    expect(bareAddress('not an address')).toBeNull()
  })
  it('only the new text of a reply is recorded', () => {
    const gmail = `好的，明天 10 点到。\n\nOn Mon, Sep 28, 2026 at 2:05 PM Mia Chen 经 Stayloop <messages@stayloop.ai>\nwrote:\n\n> ${REPLY_MARKER}\n> 钥匙在门卫`
    expect(stripQuotedReply(gmail)).toBe('好的，明天 10 点到。')
    expect(stripQuotedReply(`Sounds good\n\n${REPLY_MARKER}\n\nMia · 14:05\nkeys are at the desk`)).toBe('Sounds good')
    expect(stripQuotedReply('可以\n\n在 2026年9月28日 14:05，房东 经 Stayloop 写道：\n> 原文')).toBe('可以')
    expect(stripQuotedReply('Fine\n-----Original Message-----\nFrom: x')).toBe('Fine')
    expect(stripQuotedReply('line one\n> quoted\nline two')).toBe('line one\nline two')
    expect(htmlToText('<p>Yes<br>Tuesday</p><blockquote>old</blockquote>')).toContain('Yes\nTuesday')
    expect(htmlToText('<p>Yes</p><blockquote>old</blockquote>')).not.toContain('old')
  })
  it('the inbound route is secret-gated, stores the raw bytes, and a message needs a live token + matching sender', () => {
    const r = read('app/api/threads/inbound/route.ts')
    expect(r).toContain("safeEqual(req.headers.get('x-inbound-secret') || '', secret)")
    expect(r).toContain('if (!secret ||')
    const s = read('lib/threads/server.ts')
    const fn = s.slice(s.indexOf('export async function recordEmailReply'))
    expect(fn.indexOf("storage.from('thread-inbound').upload")).toBeLessThan(fn.indexOf("if (!token)"))
    expect(fn).toContain("if (!from || from !== row.email.toLowerCase()) { await log('sender_mismatch'")
    expect(fn).toContain("if (row.revoked_at)")
    expect(fn).toContain("channel: 'email'")
    expect(existsSync('workers/reply-email/src/index.ts')).toBe(true)
    expect(read('workers/reply-email/wrangler.toml')).toContain('INBOUND_URL = "https://www.stayloop.ai/api/threads/inbound"')
    expect(read('tsconfig.json')).toContain('"workers"')
  })
})

describe('relay: no personal address changes hands', () => {
  it('every thread email is from our address with a per-recipient reply address', () => {
    const s = read('lib/threads/server.ts')
    expect(s).toContain("replyTo: token ? replyAddress(token) : undefined, fromName: `${opts.senderLabel.split(' / ')[0]} 经 Stayloop`")
    expect(read('lib/email.ts')).toContain('const fromHeader = args.fromName ?')
  })
  it('the five places that exposed a personal inbox now relay', () => {
    const m = read('lib/marketplace/server.ts')
    expect(m).not.toMatch(/replyTo: ll\?\.user\?\.email/)
    expect(m).not.toContain('async function landlordEmail')
    expect(m).toContain('const landlordEmail: string | null = null')
    expect(read('app/w/[token]/page.tsx')).not.toContain('mailto:${v.landlord_email}')
    expect(read('app/api/delegations/route.ts')).not.toContain('replyTo: ud.user.email')
    expect(read('app/api/notify-landlord/route.ts')).not.toContain('replyTo: app.email')
    const ex = read('app/api/agent/execute/route.ts')
    expect(ex).not.toContain('房东联系邮箱 / Landlord contact: ${callerEmail}')
    expect(ex).not.toContain('`房东联系邮箱：${callerEmail}`')
    const si = read('app/api/showing-intent/route.ts')
    expect(si).not.toContain('（${user.email}）')
    expect(si).not.toContain('recipient_label: user.email')
    expect(si).toContain('await ensureListingThread(admin,')
  })
  it('exports name people, never by address', () => {
    const r = read('app/api/matters/export/route.ts')
    expect(r).not.toContain('data?.user?.email ?? uid.slice(0, 8)')
    expect(r).toContain('displayNameFor(admin, uid)')
    expect(read('app/api/threads/participants/route.ts')).not.toMatch(/email: p\.email/)
  })
  it('the listing-inquiry ref is uuid v5(listing, prospect): one thread per pair, stable', async () => {
    // RFC 4122 test vector: v5(DNS namespace, "www.example.com")
    expect(await uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
    const a = await uuidV5('11111111-1111-1111-1111-111111111111', 'u1')
    expect(await uuidV5('11111111-1111-1111-1111-111111111111', 'u1')).toBe(a)
    expect(await uuidV5('11111111-1111-1111-1111-111111111111', 'u2')).not.toBe(a)
  })
})

describe('one entry: the message centre', () => {
  it('the header envelope, the rail and the old pages all lead to /messages', () => {
    expect(read('components/Header.tsx')).toContain('<InboxButton zh={lang === \'zh\'} />')
    expect(read('components/messages/InboxButton.tsx')).toContain('href="/messages"')
    expect(read('lib/messages/unread.ts')).toContain("supabase.rpc('my_unread_messages')")
    expect(existsSync('app/tenant/messages/page.tsx')).toBe(false)
    expect(existsSync('app/landlord/messages/page.tsx')).toBe(false)
    expect(messageCenterHref('x')).toBe('/messages?t=x')
  })
  it('new message: only matters you are part of, recipients from the matter, first write opens the thread', () => {
    const n = read('components/messages/NewMessage.tsx')
    expect(n).toContain("supabase.rpc('my_message_targets')")
    expect(n).toContain('/api/threads/participants?')
    expect(n).toContain("supabase.rpc('open_thread', { p_kind: target.kind, p_ref: target.ref_id })")
    expect(n.indexOf("rpc('open_thread'")).toBeGreaterThan(n.indexOf('async function ensureThread'))
  })
  it('the panel is realtime (with a slow safety poll) and the record panel verifies the chain in the browser', () => {
    const p = read('components/threads/ThreadPanel.tsx')
    expect(p).toContain("on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thread_messages', filter: `thread_id=eq.${tid}` }")
    expect(p).not.toContain('}, 8000)')
    expect(p).toContain('supabase.removeChannel(ch)')
    const c = read('components/messages/MessageCenter.tsx')
    expect(c).toContain('verifyChain(')
    expect(c).toContain('data-testid="chain-status"')
    expect(c).toContain("from('message_deliveries')")
  })
  it('every kind has a tag; the agent client row and the listing modal open conversations', () => {
    for (const k of ['work_order', 'application', 'tenancy', 'dispute', 'listing_inquiry', 'agent_client', 'support'] as ThreadKind[]) expect(KIND_TAG[k].zh.length).toBeGreaterThan(0)
    expect(read('components/agent/ClientBook.tsx')).toContain('/messages?new=agent_client:${c.id}')
    expect(read('components/ShowingRequestModal.tsx')).toContain('/messages?t=${done.threadId}')
  })
  it('the privacy page states 7-year retention, records kept after account closure, and the relay', () => {
    const p = read('app/privacy/page.tsx')
    expect(p).toContain('事务结束后记录保留 7 年')
    expect(p).toContain('对话记录保留')
    expect(p).toContain('看不到你的私人邮箱')
  })
})
