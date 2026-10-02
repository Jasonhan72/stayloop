'use client'

// One thread, as any signed-in party sees it (节点 4 「连贯」, 2026-09-26).
// Mounted under a work order (tenant · landlord · provider), on a tenancy's
// messages tab, and on both application detail pages. Reads and writes go
// through the caller's own RLS; the insert trigger fixes server time, the
// sender and the party; a retraction is a new row (the original stays in the
// record and is shown collapsed); read marks are the viewer's own high-water
// marks — the sender sees 已送达 / 已读 / 已确认收到 from the other parties'
// marks. Attachments upload through /api/threads/upload (the server computes
// the SHA-256) and open through /api/threads/attachment-url (access audited).
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { applyRetractions, canRetract, CHANNEL_LABEL, fmtSize, FORMAL_COPY_NOTE, KIND_LABEL, PARTY_LABEL, READ_LABEL, readStateFor, type Attachment, type ReadMark, type ThreadKind, type ThreadMessage } from '@/lib/threads/shared'
import { notifyMessagesChanged } from '@/lib/messages/unread'
import { takeDraft } from '@/lib/messages/openThread'
import { roleLabel, type Person } from '@/lib/threads/shared'
import { isSendKey } from '@/components/messages/composerKeys'

export type ThreadViewer = 'tenant' | 'landlord' | 'provider' | 'agent' | 'admin'

const SELECT = 'id, thread_id, sender_id, sender_kind, acting_role, sender_label, kind, body, ref_message_id, attachments, meta, created_at, channel, prev_hash, hash'

async function jwt(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export default function ThreadPanel({ kind, refId, viewer, zh, compact = false, title, allowAttachments = true, participants, fill = false, hideHeader = false, onMessages, onSelectMessage, selectedId, people, focusComposer = false }: {
  kind: ThreadKind
  refId: string
  viewer: ThreadViewer
  zh: boolean
  /** Collapsed header with a count; opens on click (used under work-order cards). */
  compact?: boolean
  title?: string
  allowAttachments?: boolean
  /** Shown in the header: who is in this thread. */
  participants?: string
  /** Message centre: take the full height of the parent, the list scrolls, the composer sticks. */
  fill?: boolean
  hideHeader?: boolean
  /** Message centre: the loaded messages (for the record panel) and the clicked one. */
  onMessages?: (msgs: ThreadMessage[], threadId: string | null) => void
  onSelectMessage?: (id: number) => void
  selectedId?: number | null
  /** 找得到人: who is in the thread (names by user_id, for bubbles whose sender_label predates the name snapshot). */
  people?: Person[] | null
  /** Opened from a 「发消息」 button: focus the composer and pick up a stashed draft. */
  focusComposer?: boolean
}) {
  const auth = useAuth()
  const me = auth.user?.id ?? null
  const [tid, setTid] = useState<string | null>(null)
  const [denied, setDenied] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<ThreadMessage[]>([])
  const [reads, setReads] = useState<ReadMark[]>([])
  const readsRef = useRef<ReadMark[]>([])
  const [open, setOpen] = useState(!compact)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // The message list's own scroll container. Never scrollIntoView: it scrolls
  // every scrollable ancestor, document included (site test 2026-10-02 · L6 D4:
  // the landlord applicant page opened 933px down, header and decisions off-screen).
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const nameOf = useCallback((m: ThreadMessage): string | null => {
    if (m.sender_label) return m.sender_label
    const p = people?.find((x) => x.user_id && x.user_id === m.sender_id)
    return p?.name ?? null
  }, [people])
  useEffect(() => {
    if (!focusComposer) return
    const d = takeDraft(kind, refId)
    if (d) setDraft((cur) => cur || d)
    setOpen(true)
    const t = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [focusComposer, kind, refId])
  const fileRef = useRef<HTMLInputElement>(null)

  // Look the thread up (read-only, party-checked). Viewing never creates a
  // thread — a tenant scrolling ten old work orders must not mint ten empty
  // threads (production 2026-09-27); open_thread runs on the first write.
  const [looked, setLooked] = useState(false)
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let on = true
    supabase.rpc('find_thread', { p_kind: kind, p_ref: refId }).then(({ data, error }) => {
      if (!on) return
      if (error) setDenied(error.message)
      else setTid(data ? String(data) : null)
      setLooked(true)
    })
    return () => { on = false }
  }, [auth.loading, auth.user, kind, refId])
  /** The thread id, creating the thread on first use (the RPC refuses non-parties). */
  const ensureThreadId = useCallback(async (): Promise<string | null> => {
    if (tid) return tid
    const { data, error } = await supabase.rpc('open_thread', { p_kind: kind, p_ref: refId })
    if (error || !data) { setErr(error?.message === 'not_a_party' || /not_a_party/.test(error?.message || '') ? (zh ? '你不是这件事的当事人，不能在这里留言。' : 'You are not a party to this matter and cannot post here.') : (error?.message || 'thread unavailable')); return null }
    const id = String(data)
    setTid(id)
    return id
  }, [tid, kind, refId, zh])

  const onMessagesRef = useRef(onMessages)
  onMessagesRef.current = onMessages
  const load = useCallback(async () => {
    if (!tid) { setMsgs([]); return }
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase.from('thread_messages').select(SELECT).eq('thread_id', tid).order('id', { ascending: true }).limit(400),
      supabase.from('message_reads').select('user_id, last_delivered_id, last_opened_id, last_acknowledged_id').eq('thread_id', tid),
    ])
    setMsgs((m ?? []) as ThreadMessage[])
    onMessagesRef.current?.((m ?? []) as ThreadMessage[], tid)
    const rr = (r ?? []) as ReadMark[]
    readsRef.current = rr
    setReads(rr)
  }, [tid])
  useEffect(() => {
    if (!tid) return
    void load()
    // Realtime (消息系统 A 期): new messages and read marks arrive through Supabase
    // Realtime under the caller's RLS; a slow poll stays as the safety net, and a
    // hidden tab catches up the moment it is shown again.
    const ch = supabase.channel(`thread:${tid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thread_messages', filter: `thread_id=eq.${tid}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads', filter: `thread_id=eq.${tid}` }, () => { void load() })
      .subscribe()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 45_000)
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); void supabase.removeChannel(ch) }
  }, [tid, load])

  // Read marks: delivered when fetched, opened while the panel is open, acknowledged on click. Monotonic (the trigger also enforces it).
  const mark = useCallback(async (patch: Partial<Record<'last_delivered_id' | 'last_opened_id' | 'last_acknowledged_id', number>>) => {
    if (!tid || !me) return
    const mine = readsRef.current.find((r) => r.user_id === me)
    const row: ReadMark & { thread_id: string } = {
      thread_id: tid, user_id: me,
      last_delivered_id: Math.max(mine?.last_delivered_id ?? 0, patch.last_delivered_id ?? 0, patch.last_opened_id ?? 0, patch.last_acknowledged_id ?? 0),
      last_opened_id: Math.max(mine?.last_opened_id ?? 0, patch.last_opened_id ?? 0, patch.last_acknowledged_id ?? 0),
      last_acknowledged_id: Math.max(mine?.last_acknowledged_id ?? 0, patch.last_acknowledged_id ?? 0),
    }
    if (mine && mine.last_delivered_id === row.last_delivered_id && mine.last_opened_id === row.last_opened_id && mine.last_acknowledged_id === row.last_acknowledged_id) return
    const { error } = await supabase.from('message_reads').upsert(row, { onConflict: 'thread_id,user_id' })
    if (!error) { readsRef.current = [...readsRef.current.filter((r) => r.user_id !== me), row]; setReads(readsRef.current); if ((mine?.last_opened_id ?? 0) < row.last_opened_id) notifyMessagesChanged() }
  }, [tid, me])
  const maxId = msgs.length ? msgs[msgs.length - 1].id : 0
  useEffect(() => {
    if (!maxId || !me) return
    void mark(open ? { last_delivered_id: maxId, last_opened_id: maxId } : { last_delivered_id: maxId })
  }, [maxId, open, me, mark])
  useEffect(() => {
    const el = listRef.current
    if (open && el) el.scrollTop = el.scrollHeight
  }, [msgs.length, open])

  // The notify route announces exactly this message (it checks the id is the
  // caller's, on this thread) — not "the sender's newest", which a quick second
  // message would have replaced (sweep 2026-10-01).
  async function notify(threadId: string, messageId: number | null) {
    const token = await jwt()
    if (!token) return
    void fetch('/api/threads/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ thread_id: threadId, message_id: messageId }) }).catch(() => undefined)
  }
  // A ref, not `busy`: a second Enter in the same tick (key repeat, double tap)
  // must not insert the same line twice into an append-only record.
  const sendingRef = useRef(false)
  async function send() {
    if (sendingRef.current) return
    const body = draft.trim()
    const atts = pending
    if (!me || (!body && atts.length === 0)) return
    sendingRef.current = true
    setBusy(true); setErr(null)
    // Clear at once so nothing can be sent twice; put it back if the send fails.
    setDraft(''); setPending([])
    const restore = () => {
      setDraft((cur) => (cur.trim() ? `${body}\n${cur}` : body))
      setPending((cur) => [...atts, ...cur.filter((a) => !atts.some((x) => x.path === a.path))])
    }
    try {
      let sent: { id: string; messageId: number | null } | null = null
      try {
        const id = await ensureThreadId()
        if (!id) { restore(); return }
        const senderKind = viewer === 'admin' ? 'admin' : viewer
        const { data, error } = await supabase.from('thread_messages').insert({ thread_id: id, sender_id: me, sender_kind: senderKind, acting_role: viewer, kind: 'message', body: body || (zh ? '（附件）' : '(attachment)'), attachments: atts }).select('id').single()
        if (error) { setErr(error.message); restore(); return }
        sent = { id, messageId: data ? Number((data as { id: number }).id) : null }
      } catch (e) {
        setErr((e as Error).message || 'send failed'); restore(); return
      }
      if (!sent) return
      // Sent — from here on nothing puts the text back.
      void notify(sent.id, sent.messageId)
      notifyMessagesChanged()
      await load().catch(() => undefined)
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }
  async function retract(m: ThreadMessage) {
    if (!tid || !me) return
    if (!window.confirm(zh ? '撤回这条消息？原文会保留在记录中，对方会看到「已撤回」。' : 'Retract this message? The original stays in the record; others see "retracted".')) return
    const { error } = await supabase.from('thread_messages').insert({ thread_id: tid, sender_id: me, sender_kind: viewer === 'admin' ? 'admin' : viewer, acting_role: viewer, kind: 'retraction', body: zh ? '撤回了一条消息' : 'Retracted a message', ref_message_id: m.id })
    if (error) setErr(error.message); else await load()
  }
  async function upload(files: FileList | null) {
    if (!files) return
    setUploading(true); setErr(null)
    const id = await ensureThreadId()
    if (!id) { setUploading(false); return }
    const token = await jwt()
    for (const f of Array.from(files).slice(0, 6 - pending.length)) {
      const fd = new FormData(); fd.append('thread_id', id); fd.append('file', f)
      const res = await fetch('/api/threads/upload', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd })
      const j = (await res.json().catch(() => ({}))) as { attachment?: Attachment; error?: string }
      if (!res.ok || !j.attachment) { setErr(j.error === 'file_type' ? (zh ? '只支持图片、PDF、Word 与文本文件。' : 'Images, PDF, Word and text files only.') : j.error === 'file_size' ? (zh ? '单个文件不能超过 25 MB。' : 'Files must be under 25 MB.') : (j.error || `HTTP ${res.status}`)); break }
      setPending((p) => [...p, j.attachment!])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  async function openAttachment(a: Attachment, download = false) {
    if (!tid) return
    // Open the tab on the click (user activation), point it once the signed URL is back.
    const win = download ? null : window.open('about:blank', '_blank')
    const token = await jwt()
    const res = await fetch('/api/threads/attachment-url', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ thread_id: tid, path: a.path, download, acting_role: viewer }) })
    const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!res.ok || !j.url) { win?.close(); setErr(j.error || `HTTP ${res.status}`); return }
    if (download) window.location.assign(j.url); else if (win) win.location.href = j.url
  }

  if (denied) return null
  if (!looked) return compact ? null : <div className="text-[12.5px] text-body-3">…</div>

  const view = applyRetractions(msgs)
  const visible = view.length
  const lastFromOther = [...view].reverse().find((m) => m.sender_id !== me && m.kind === 'message' && !m.retracted)
  const mine = reads.find((r) => r.user_id === me)
  const unread = mine ? view.filter((m) => m.id > mine.last_opened_id && m.sender_id !== me).length : visible
  const when = (iso: string) => new Date(iso).toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'local' } })()
  const heading = title || (zh ? KIND_LABEL[kind].zh : KIND_LABEL[kind].en)

  return (
    <div className={fill ? 'flex h-full min-h-0 flex-col bg-white' : 'rounded-xl border border-line-divider bg-white ' + (compact ? '' : 'mt-2')} data-testid="thread-panel" data-kind={kind}>
      {!hideHeader && <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left" aria-expanded={open}>
        <span className="text-[13px] font-bold">{heading}</span>
        <span className="font-mono text-[11px] text-body-3">{visible}</span>
        {unread > 0 && !open && <span className="rounded-full bg-brand px-1.5 py-[1px] font-mono text-[10px] font-bold text-white" data-testid="thread-unread">{unread}</span>}
        {participants && <span className="min-w-0 truncate text-[11.5px] text-body-3">· {participants}</span>}
        <span className="ml-auto text-[11.5px] text-body-3">{open ? (compact ? (zh ? '收起' : 'Hide') : '') : (zh ? '展开' : 'Open')}</span>
      </button>}
      {open && (
        <div className={fill ? 'flex min-h-0 flex-1 flex-col' : 'border-t border-line-divider'}>
          <div ref={listRef} data-testid="thread-list" className={fill ? 'min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-6' : 'max-h-[420px] min-h-[120px] overflow-y-auto px-4 py-3'}>
            {visible === 0 && <p className="py-6 text-center text-[12.5px] text-body-3">{zh ? '还没有消息。这里的每一条都带服务器时间与发送身份，只能追加、不能改。' : 'No messages yet. Every line here carries server time and the sender’s hat; the record is append-only.'}</p>}
            {view.map((m) => {
              const isMine = !!me && m.sender_id === me
              const party = PARTY_LABEL[m.sender_kind] ?? PARTY_LABEL.system
              const sys = m.kind === 'system'
              const formal = m.kind === 'formal_copy'
              if (sys) return <div key={m.id} className={'my-2 text-center text-[11.5px] text-body-3 ' + (onSelectMessage ? 'cursor-pointer' : '') + (selectedId === m.id ? ' underline' : '')} onClick={onSelectMessage ? () => onSelectMessage(m.id) : undefined} data-testid="thread-message" data-kind="system"><span className="font-mono">{when(m.created_at)}</span> · {m.body}</div>
              return (
                <div key={m.id} className={`mb-3 flex ${isMine ? 'justify-end' : 'justify-start'}`} data-testid="thread-message" data-kind={m.kind}>
                  <div onClick={onSelectMessage ? () => onSelectMessage(m.id) : undefined} className={'max-w-[80%] rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ' + (formal ? 'border border-amber-200 bg-amber-50 text-amber-950' : isMine ? 'bg-brand text-white' : 'bg-surface-chip text-body') + (onSelectMessage ? ' cursor-pointer' : '') + (selectedId === m.id ? ' ring-2 ring-brand/40 ring-offset-1' : '')}>
                    <div className={'mb-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] font-bold ' + (isMine && !formal ? 'text-white/80' : 'text-body-3')}>
                      <span data-testid="bubble-sender">{formal && m.sender_label ? m.sender_label : isMine ? (zh ? '你' : 'You') : nameOf(m) ? (m.sender_kind === 'admin' || nameOf(m) === roleLabel(m.sender_kind, zh) ? nameOf(m) : `${nameOf(m)} · ${roleLabel(m.sender_kind === 'external' ? 'external' : m.sender_kind, zh)}`) : (zh ? party.zh : party.en)}{m.acting_role && m.acting_role !== m.sender_kind ? ` · ${zh ? (PARTY_LABEL[m.acting_role as keyof typeof PARTY_LABEL]?.zh ?? m.acting_role) : (PARTY_LABEL[m.acting_role as keyof typeof PARTY_LABEL]?.en ?? m.acting_role)}` : ''}</span>
                      <time dateTime={m.created_at} title={m.created_at}>{when(m.created_at)}</time>
                      {formal && <span className="rounded-full bg-amber-200/70 px-1.5 text-amber-900">{zh ? '正式通知副本' : 'FORMAL COPY'}</span>}
                      {m.channel && m.channel !== 'app' && m.channel !== 'system' && <span className={'rounded px-1.5 ' + (isMine ? 'bg-white/20' : m.channel === 'email' ? 'bg-indigo-50 text-indigo-800' : 'bg-emerald-50 text-emerald-800')} data-testid="thread-channel">{zh ? CHANNEL_LABEL[m.channel].zh : CHANNEL_LABEL[m.channel].en}</span>}
                    </div>
                    {m.retracted ? (
                      <div className="italic opacity-70" data-testid="thread-retracted">{zh ? '（已撤回 · 原文保留在记录中）' : '(retracted · the original stays in the record)'}</div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{formal ? m.body.replace(`\n\n— ${FORMAL_COPY_NOTE.zh} / ${FORMAL_COPY_NOTE.en}`, '') : m.body}</div>
                    )}
                    {formal && <div className="mt-1 text-[10.5px] text-amber-800">{zh ? FORMAL_COPY_NOTE.zh : FORMAL_COPY_NOTE.en}</div>}
                    {!m.retracted && m.attachments.length > 0 && (
                      <ul className="mt-1.5 space-y-1" data-testid="thread-attachments">
                        {m.attachments.map((a) => (
                          <li key={a.path} className={'flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-[12px] ' + (isMine && !formal ? 'bg-white/15' : 'bg-white')}>
                            <button type="button" onClick={() => void openAttachment(a)} className="font-semibold underline underline-offset-2">{a.name}</button>
                            <span className="opacity-70">{fmtSize(a.size)}</span>
                            <span className="font-mono text-[10px] opacity-60" title={a.sha256}>sha256 {a.sha256.slice(0, 12)}…</span>
                            <button type="button" onClick={() => void openAttachment(a, true)} className="text-[11px] underline underline-offset-2">{zh ? '下载' : 'Download'}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className={'mt-1 flex flex-wrap items-center gap-2 text-[10px] ' + (isMine && !formal ? 'text-white/70' : 'text-body-3')}>
                      {isMine && !m.retracted && <span data-testid="read-state">{zh ? READ_LABEL[readStateFor(m.id, reads, me)].zh : READ_LABEL[readStateFor(m.id, reads, me)].en}</span>}
                      {isMine && !m.retracted && canRetract(m, me) && <button type="button" onClick={() => void retract(m)} className="underline underline-offset-2">{zh ? '撤回' : 'Retract'}</button>}
                      {!isMine && lastFromOther?.id === m.id && (mine?.last_acknowledged_id ?? 0) < m.id && <button type="button" onClick={() => void mark({ last_acknowledged_id: m.id })} className="rounded-full border border-line-strong px-2 py-[1px] text-[10.5px] font-semibold" data-testid="acknowledge">{zh ? '确认收到' : 'Acknowledge'}</button>}
                      {!isMine && (mine?.last_acknowledged_id ?? 0) >= m.id && m.kind === 'message' && <span>✓ {zh ? '你已确认' : 'you acknowledged'}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="border-t border-line-divider p-3" data-testid="thread-composer">
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pending.map((a) => <span key={a.path} className="flex items-center gap-1 rounded-full bg-surface-chip px-2 py-[2px] text-[11.5px]">{a.name} <span className="text-body-3">{fmtSize(a.size)}</span><button type="button" onClick={() => setPending((p) => p.filter((x) => x.path !== a.path))} className="ml-1 text-body-3">×</button></span>)}
              </div>
            )}
            <div className="flex gap-2">
              <textarea ref={inputRef} data-testid="thread-input" aria-label={zh ? '输入消息' : 'Message'} className="min-h-[40px] flex-1 resize-y rounded-lg border border-line-divider bg-white px-3 py-2 text-[14px]" rows={1} value={draft} placeholder={zh ? '输入消息… Enter 发送，Shift+Enter 换行' : 'Type a message… Enter to send, Shift+Enter for a new line'}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (isSendKey(e)) { e.preventDefault(); void send() } }} />
              {allowAttachments && (
                <>
                  <input ref={fileRef} type="file" className="hidden" multiple accept="image/*,.heic,.heif,application/pdf,.txt,.doc,.docx" onChange={(e) => void upload(e.target.files)} aria-label={zh ? '添加附件' : 'Add attachment'} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || pending.length >= 6} className="rounded-lg border border-line-divider px-3 text-[13px] disabled:opacity-50" aria-label={zh ? '添加附件' : 'Add attachment'} title={zh ? '附件（服务器计算 SHA-256）' : 'Attachment (server-hashed)'}>{uploading ? '…' : '📎'}</button>
                </>
              )}
              <button type="button" onClick={() => void send()} disabled={busy || (!draft.trim() && pending.length === 0)} className="rounded-lg bg-brand px-4 text-[13px] font-bold text-white disabled:opacity-50">{zh ? '发送' : 'Send'}</button>
            </div>
            {err && <p className="mt-1.5 text-[12px] text-danger">{err}</p>}
            <p className="mt-1.5 text-[10.5px] text-body-3">{zh ? `时间按你的时区显示（${tz}），服务器记录为准 · 记录只追加：撤回不会删除原文 · 附件由服务器计算 SHA-256，查看与下载写入审计` : `Times in your time zone (${tz}); the server record is authoritative · append-only: retracting never deletes · attachments are server-hashed (SHA-256); views and downloads are audited`}</p>
          </div>
        </div>
      )}
    </div>
  )
}
