// 节点 4 · 连贯 (2026-09-26): one append-only thread per matter, with server
// time, the sender's party and hat, three-state read marks, server-hashed
// attachments with access audit, a tri-party maintenance thread first, the
// tenancy conversation migrated in, an application thread, and formal-notice
// copies that say they are copies. Pure-function tests plus source guards.
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { applyRetractions, canRetract, readStateFor, threadHref, workOrderSystemLine, RETRACT_WINDOW_MS, type ThreadMessage } from '@/lib/threads/shared'

const read = (p: string) => readFileSync(p, 'utf8')
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const YOU = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const msg = (o: Partial<ThreadMessage> & { id: number }): ThreadMessage => ({ sender_id: ME, sender_kind: 'landlord', acting_role: 'landlord', sender_label: null, kind: 'message', body: 'hi', ref_message_id: null, attachments: [], meta: {}, created_at: '2026-09-26T12:00:00Z', ...o })

describe('append-only semantics in the view', () => {
  it('a retraction hides its target from the default view but keeps it in the record; the retraction row itself is not shown', () => {
    const v = applyRetractions([msg({ id: 1 }), msg({ id: 2, kind: 'retraction', ref_message_id: 1, created_at: '2026-09-26T12:01:00Z' }), msg({ id: 3, sender_id: YOU, sender_kind: 'tenant' })])
    expect(v.map((m) => m.id)).toEqual([1, 3])
    expect(v[0].retracted).toBe(true); expect(v[0].retractedAt).toBe('2026-09-26T12:01:00Z'); expect(v[0].body).toBe('hi')
    expect(v[1].retracted).toBe(false)
  })
  it('only the sender may retract, only a plain message, only inside the window', () => {
    const now = new Date('2026-09-26T12:05:00Z')
    expect(canRetract(msg({ id: 1 }), ME, now)).toBe(true)
    expect(canRetract(msg({ id: 1 }), YOU, now)).toBe(false)
    expect(canRetract(msg({ id: 1, kind: 'formal_copy' }), ME, now)).toBe(false)
    expect(canRetract(msg({ id: 1 }), ME, new Date(now.getTime() + RETRACT_WINDOW_MS))).toBe(false)
  })
  it('read state comes from the OTHER parties’ marks: sent → delivered → read → acknowledged', () => {
    const reads = [{ user_id: ME, last_delivered_id: 9, last_opened_id: 9, last_acknowledged_id: 9 }, { user_id: YOU, last_delivered_id: 5, last_opened_id: 3, last_acknowledged_id: 1 }]
    expect(readStateFor(1, reads, ME)).toBe('acknowledged')
    expect(readStateFor(3, reads, ME)).toBe('opened')
    expect(readStateFor(5, reads, ME)).toBe('delivered')
    expect(readStateFor(7, reads, ME)).toBe('sent')
  })
  it('system lines are bilingual and carry the amount / version / reason', () => {
    expect(workOrderSystemLine('accept', { amount: 150, version: 1 })).toContain('$150.00')
    expect(workOrderSystemLine('quote', { amount: 180, version: 2 })).toContain('第 2 版')
    expect(workOrderSystemLine('decline', { code: 'out_of_area' })).toContain('out_of_area')
    expect(workOrderSystemLine('cancel', { reason: 'x' })).toBe('工单已取消：x / Cancelled: x')
    expect(threadHref('work_order', 'w', 'h', 'provider')).toBe('/provider/jobs')
    expect(threadHref('work_order', 'w', 'h', 'tenant')).toBe('/h/h?tab=maintenance')
    expect(threadHref('application', 'a', null, 'landlord')).toBe('/landlord/applicants/a')
    expect(threadHref('tenancy', 'h', 'h', 'landlord')).toBe('/h/h?tab=messages')
  })
})

describe('the schema is append-only and party-scoped', () => {
  const sql = read('supabase/migrations/20260926_node4_threads.sql')
  it('no update / delete grant on thread_messages; an unconditional trigger refuses UPDATE', () => {
    expect(sql).toContain('grant select, insert on public.thread_messages to authenticated')
    expect(sql).not.toMatch(/grant [^\n]*update[^\n]*public\.thread_messages/)
    expect(sql).toContain("if tg_op = 'UPDATE' then raise exception 'append_only'; end if;")
    expect(sql).toContain('create trigger trg_thread_messages_append_only before update or delete on public.thread_messages')
  })
  it('the insert trigger fixes server time, the sender and the party, validates retractions and copies registered hashes', () => {
    expect(sql).toContain('new.created_at := now();')
    expect(sql).toContain('new.sender_id := auth.uid();')
    expect(sql).toContain('new.sender_kind := party;')
    expect(sql).toContain("raise exception 'retraction_not_yours'")
    expect(sql).toContain("raise exception 'already_retracted'")
    expect(sql).toContain("raise exception 'attachment_not_registered'")
    expect(sql).toContain("'sha256', reg.sha256")
  })
  it('thread_party covers the four kinds; open_thread refuses non-parties; policies key on it', () => {
    for (const k of ["t.kind = 'tenancy'", "t.kind in ('work_order', 'dispute')", "t.kind = 'application'"]) expect(sql).toContain(k)
    expect(sql).toContain("lower(a.email) = em")
    expect(sql).toContain("raise exception 'not_a_party'")
    expect(sql).toContain('create policy thread_messages_party_insert on public.thread_messages for insert to authenticated')
    expect(sql).toContain('create policy message_reads_own_update on public.message_reads for update to authenticated using (user_id = auth.uid())')
    expect(sql).toContain('revoke execute on function public.thread_party(uuid) from public, anon')
  })
  it('household_messages were migrated into tenancy threads before the guards existed', () => {
    const mig = sql.indexOf("jsonb_build_object('migrated_from', 'household_messages'")
    const guard = sql.indexOf('create trigger trg_thread_messages_before_insert')
    expect(mig).toBeGreaterThan(0); expect(guard).toBeGreaterThan(mig)
  })
})

describe('surfaces and hooks', () => {
  it('the panel is mounted on the tenancy hub, under work orders (landlord/tenant and provider), and on both application pages', () => {
    expect(read('app/h/[id]/page.tsx')).toContain('<ThreadPanel kind="tenancy" refId={id}')
    expect(read('components/household/MaintenancePanel.tsx')).toContain('<ThreadPanel kind="work_order" refId={w.id}')
    expect(read('app/provider/jobs/page.tsx')).toContain('<ThreadPanel kind="work_order" refId={r.id} viewer="provider"')
    expect(read('app/landlord/applicants/[id]/page.tsx')).toContain('<ThreadPanel kind="application" refId={app.id} viewer="landlord"')
    expect(read('app/tenant/applications/[id]/page.tsx')).toContain('<ThreadPanel kind="application" refId={app.id} viewer="tenant"')
    expect(read('app/w/[token]/page.tsx')).toContain('<ExternalThread token={token}')
  })
  it('the panel writes through RLS only (open_thread RPC, thread_messages insert, message_reads upsert) and never updates a message', () => {
    const p = read('components/threads/ThreadPanel.tsx')
    // Viewing looks up; only the first write creates (production 2026-09-27: one empty thread per viewed work order).
    expect(p).toContain("supabase.rpc('find_thread', { p_kind: kind, p_ref: refId })")
    expect(p).toContain("supabase.rpc('open_thread', { p_kind: kind, p_ref: refId })")
    expect(p.indexOf("rpc('open_thread'")).toBeGreaterThan(p.indexOf('const ensureThreadId'))
    // 消息系统 A 期: the message centre lists threads through my_threads(), which only returns threads that hold a message.
    expect(read('supabase/migrations/20260929_messaging_a.sql')).toContain('from t join last l on l.thread_id = t.id')
    expect(p).toContain("from('thread_messages').insert(")
    expect(p).toContain("from('message_reads').upsert(row, { onConflict: 'thread_id,user_id' })")
    expect(p).not.toMatch(/from\('thread_messages'\)\.(update|delete)/)
    expect(p).toContain("kind: 'retraction'")
    for (const t of ['data-testid="thread-panel"', 'data-testid="read-state"', 'data-testid="acknowledge"', 'data-testid="thread-retracted"']) expect(p).toContain(t)
  })
  it('old messaging is gone; the inbox reads threads and read marks from the database', () => {
    expect(existsSync('lib/household/readMarks.ts')).toBe(false)
    expect(existsSync('app/api/household/notify-message/route.ts')).toBe(false)
    const inbox = read('components/messages/MessageCenter.tsx')
    expect(inbox).toContain("supabase.rpc('my_threads')")
    expect(read('supabase/migrations/20260929_messaging_a.sql')).toContain('left join public.message_reads r on r.thread_id = m.thread_id and r.user_id = auth.uid()')
    expect(inbox).not.toContain('localStorage')
    expect(read('app/h/[id]/page.tsx')).not.toContain('household_messages')
  })
  it('attachments: the server hashes and registers; URLs are audited; the external door posts as external', () => {
    const up = read('app/api/threads/upload/route.ts')
    expect(up).toContain("crypto.subtle.digest('SHA-256', buf)")
    expect(up).toContain("from('thread_attachments').insert(")
    const url = read('app/api/threads/attachment-url/route.ts')
    expect(url).toContain("download ? 'thread_attachment_downloaded' : 'thread_attachment_viewed'")
    const tok = read('app/api/w/[token]/route.ts')
    expect(tok).toContain("sender_kind: 'external'")
    expect(tok).toContain("if (body.action === 'message')")
    expect(tok).not.toMatch(/'approve_quote'|'accept_completion'|'mark_paid'/)
  })
  it('every work-order transition writes one system line; formal notices leave a copy that says it is a copy', () => {
    const s = read('lib/marketplace/server.ts')
    expect(s).toContain('await noteOnWorkOrder(admin, { id: wo.id, household_id: wo.household_id, scope: wo.scope, landlord_auth_id: wo.landlord_auth_id }, workOrderSystemLine(i.action, evPayload)')
    expect(s).toContain("kind: 'formal_copy', senderKind: 'landlord'")
    const ex = read('app/api/agent/execute/route.ts')
    expect((ex.match(/kind: 'formal_copy'/g) || []).length).toBe(2)
    expect(read('lib/threads/server.ts')).toContain('— ${FORMAL_COPY_NOTE.zh} / ${FORMAL_COPY_NOTE.en}')
    expect(read('lib/marketplace/sweep.ts')).toContain("{ event: 'quote_overdue' }")
  })
})
