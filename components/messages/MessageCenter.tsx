'use client'
// 消息中心 /messages (消息系统 A 期; people-first since 找得到人 2026-09-30).
// One entry for every conversation, whatever hat the account wears. The list
// leads with the PEOPLE on the other side (name + role, never an address), the
// matter second, the last line third; search matches names; filters are by who
// you are talking to. Deep links from any 「发消息」 button land here:
//   ?t=<thread>&compose=1  — open that conversation, composer focused
//   ?new=<kind>:<ref>      — an existing thread opens directly; otherwise the
//                            compose sheet bound to that matter
//   ?matter=<id>           — only the conversations of one rental matter
// The record panel (xl) and the ⋯ menu (every width) carry the chain check and
// 导出聊天记录.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import ThreadPanel, { type ThreadViewer } from '@/components/threads/ThreadPanel'
import NewMessage, { PersonAvatar } from './NewMessage'
import {
  CHANNEL_LABEL, counterpartGroup, counterpartLine, COUNTERPART_GROUP_LABEL, KIND_TAG, PARTY_LABEL, roleLabel, threadHref,
  type Person, type ThreadKind, type ThreadMessage,
} from '@/lib/threads/shared'
import { shortHash, verifyChain, type ChainReport } from '@/lib/threads/hashChain'
import { MESSAGES_CHANGED_EVENT, notifyMessagesChanged } from '@/lib/messages/unread'
import { openHtmlFromPost } from '@/lib/export/openHtml'

export type ThreadSummary = {
  id: string; kind: ThreadKind; ref_id: string; household_id: string | null; listing_id: string | null; matter_id: string | null; title: string | null
  party: string; last_id: number; last_at: string; last_body: string; last_kind: string; last_sender_kind: string; last_sender_id: string | null
  last_sender_label: string | null; last_channel: string; unread: number; awaiting_reply: boolean; message_count: number
  counterpart_names: string[]; counterpart_roles: string[]
}
type Filter = 'all' | 'awaiting' | 'landlord' | 'tenant' | 'applicant' | 'provider' | 'agent' | 'stayloop'
type Delivery = { id: number; message_id: number | null; channel: string; recipient_user_id: string | null; provider_message_id: string | null; status: string; created_at: string; updated_at: string }

const TORONTO = 'America/Toronto'

export default function MessageCenter({ hat }: { hat: 'tenant' | 'landlord' | 'agent' | 'provider' }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const selected = params?.get('t') || null
  const compose = params?.get('compose') === '1'
  const newParam = params?.get('new') || null
  const matterFilter = params?.get('matter') || null
  const [rows, setRows] = useState<ThreadSummary[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [newTarget, setNewTarget] = useState<{ kind: string; ref: string } | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [msgs, setMsgs] = useState<ThreadMessage[]>([])
  const [chain, setChain] = useState<ChainReport | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [exportErr, setExportErr] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [recordSheet, setRecordSheet] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_threads')
    setRows(((data ?? []) as ThreadSummary[]))
  }, [])
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setRows([]); return }
    void load()
    const ch = supabase.channel('inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thread_messages' }, () => { void load(); notifyMessagesChanged() })
      .subscribe()
    const onEvt = () => void load()
    window.addEventListener(MESSAGES_CHANGED_EVENT, onEvt)
    return () => { void supabase.removeChannel(ch); window.removeEventListener(MESSAGES_CHANGED_EVENT, onEvt) }
  }, [auth.loading, auth.user, load])

  // ?new=<kind>:<ref> — an existing conversation opens directly; otherwise compose bound to that matter.
  useEffect(() => {
    const parsed = parseNew(newParam)
    if (!parsed || auth.loading || !auth.user) return
    let on = true
    ;(async () => {
      const { data } = await supabase.rpc('find_thread', { p_kind: parsed.kind, p_ref: parsed.ref })
      if (!on) return
      if (data) router.replace(`/messages?t=${String(data)}&compose=1`)
      else { setNewTarget(parsed); setNewOpen(true) }
    })()
    return () => { on = false }
  }, [newParam, auth.loading, auth.user, router])

  // A conversation with no message yet (opened from a 「发消息」 button) is not in my_threads — the
  // inbox lists conversations, not empty shells — but it must still open (review 2026-09-30).
  // The shell is kept across inbox reloads: clearing it on every reload unmounted the
  // conversation for a render and wiped a half-written first message (sweep 2026-10-01).
  // It only matters while `selected` is not in rows; `current` ignores a shell for another id.
  const [extra, setExtra] = useState<ThreadSummary | null>(null)
  const extraIdRef = useRef<string | null>(null)
  extraIdRef.current = extra?.id ?? null
  useEffect(() => {
    if (!selected || !rows || rows.some((r) => r.id === selected)) return
    if (extraIdRef.current === selected) return
    let on = true
    ;(async () => {
      const [{ data: t }, { data: party }, { data: ppl }] = await Promise.all([
        supabase.from('threads').select('id, kind, ref_id, household_id, listing_id, matter_id, title, created_at').eq('id', selected).maybeSingle(),
        supabase.rpc('thread_party', { p_thread: selected }),
        supabase.rpc('thread_people', { p_thread: selected }),
      ])
      if (!on || !t || !party) return
      const others = ((ppl ?? []) as Person[]).filter((p) => !p.is_me)
      const row = t as { id: string; kind: ThreadKind; ref_id: string; household_id: string | null; listing_id: string | null; matter_id: string | null; title: string | null; created_at: string }
      setExtra({
        ...row, party: String(party), last_id: 0, last_at: row.created_at, last_body: '', last_kind: 'system', last_sender_kind: 'system', last_sender_id: null,
        last_sender_label: null, last_channel: 'app', unread: 0, awaiting_reply: false, message_count: 0,
        counterpart_names: others.map((p) => p.name ?? ''), counterpart_roles: others.map((p) => p.role),
      })
    })()
    return () => { on = false }
  }, [selected, rows])
  const current = useMemo(() => rows?.find((r) => r.id === selected) ?? (extra && extra.id === selected ? extra : null), [rows, selected, extra])

  useEffect(() => {
    setPeople(null); setPick(null); setDeliveries([]); setChain(null); setExportErr(null); setMenu(false); setRecordSheet(false)
    if (!selected) return
    let on = true
    ;(async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/threads/participants?thread_id=${selected}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const j = (await res.json().catch(() => ({}))) as { people?: Person[] }
      if (on) setPeople(j.people ?? [])
    })()
    return () => { on = false }
  }, [selected])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [menu])

  const onMessages = useCallback((m: ThreadMessage[], tid: string | null) => {
    if (!tid || tid !== selected) return
    setMsgs(m)
    void verifyChain(m.map((x) => ({ ...x, thread_id: x.thread_id ?? tid, attachments: x.attachments ?? [] })) as never).then(setChain)
    void supabase.from('message_deliveries').select('id, message_id, channel, recipient_user_id, provider_message_id, status, created_at, updated_at').eq('thread_id', tid).order('id', { ascending: true }).limit(500)
      .then(({ data }) => setDeliveries((data ?? []) as Delivery[]))
  }, [selected])

  const groupOf = (r: ThreadSummary) => counterpartGroup(r.kind, r.counterpart_roles ?? [])
  const scoped = useMemo(() => (rows ?? []).filter((r) => !matterFilter || r.matter_id === matterFilter), [rows, matterFilter])
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scoped.filter((r) => {
      if (filter === 'awaiting' && !r.awaiting_reply) return false
      if (!['all', 'awaiting'].includes(filter) && groupOf(r) !== filter) return false
      if (needle) {
        const hay = [r.title ?? '', r.last_body, ...(r.counterpart_names ?? []), ...(r.counterpart_roles ?? []).map((x) => `${roleLabel(x, true)} ${roleLabel(x, false)}`), KIND_TAG[r.kind].zh, KIND_TAG[r.kind].en].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [scoped, filter, q])

  const filters: { k: Filter; label: string; n?: number }[] = [
    { k: 'all', label: zh ? '全部' : 'All' },
    { k: 'awaiting', label: zh ? '待回复' : 'Awaiting reply', n: scoped.filter((r) => r.awaiting_reply).length },
    ...(['landlord', 'tenant', 'applicant', 'provider', 'agent', 'stayloop'] as const)
      .filter((g) => scoped.some((r) => groupOf(r) === g))
      .map((g) => ({ k: g as Filter, label: zh ? COUNTERPART_GROUP_LABEL[g].zh : COUNTERPART_GROUP_LABEL[g].en })),
  ]

  const open = (id: string) => router.push(`/messages?t=${id}${matterFilter ? `&matter=${matterFilter}` : ''}`, { scroll: false })
  const when = (iso: string) => {
    const d = new Date(iso); const now = new Date()
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString(zh ? 'zh-CN' : 'en-CA', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric' })
  }
  const who = (r: ThreadSummary) => r.last_sender_id === auth.user?.id ? (zh ? '你' : 'You')
    : r.last_kind === 'system' ? (zh ? '系统' : 'System')
    : r.last_sender_label ? r.last_sender_label.split(' · ')[0]
    : (zh ? PARTY_LABEL[r.last_sender_kind as keyof typeof PARTY_LABEL]?.zh : PARTY_LABEL[r.last_sender_kind as keyof typeof PARTY_LABEL]?.en) ?? r.last_sender_kind
  const viewer: ThreadViewer = current?.party === 'admin' ? 'admin' : current && ['tenant', 'landlord', 'agent', 'provider'].includes(current.party) ? current.party as ThreadViewer : hat
  const nameLine = (r: ThreadSummary) => r.kind === 'support' && r.party !== 'admin' ? (zh ? 'Stayloop 客服' : 'Stayloop support') : counterpartLine(r.counterpart_names ?? [], r.counterpart_roles ?? [], zh)
  const matterOf = (r: ThreadSummary) => r.kind === 'support' ? (zh ? '联系 Stayloop' : 'Contact Stayloop') : [r.kind === 'agent_client' ? null : r.title, zh ? KIND_TAG[r.kind].zh : KIND_TAG[r.kind].en].filter(Boolean).join(' · ')
  const firstRole = (r: ThreadSummary) => r.kind === 'support' && r.party !== 'admin' ? 'admin' : (r.counterpart_roles ?? [])[0] ?? 'member'
  const firstName = (r: ThreadSummary) => r.kind === 'support' && r.party !== 'admin' ? 'Stayloop' : (r.counterpart_names ?? [])[0]

  // Quick start: the most recent people you have conversations with, plus Stayloop.
  const quick = useMemo(() => {
    const seen = new Set<string>()
    const out: ThreadSummary[] = []
    for (const r of rows ?? []) {
      const key = `${nameLine(r)}|${groupOf(r)}`
      if (seen.has(key)) continue
      seen.add(key); out.push(r)
      if (out.length >= 6) break
    }
    return out
  }, [rows, zh]) // eslint-disable-line react-hooks/exhaustive-deps

  const picked = pick != null ? msgs.find((m) => m.id === pick) ?? null : null
  const range = msgs.length ? `${fmtT(msgs[0].created_at, zh)} → ${fmtT(msgs[msgs.length - 1].created_at, zh)}` : '—'
  const attCount = msgs.reduce((n, m) => n + (m.attachments?.length ?? 0), 0)
  const supportHref = auth.user ? `/messages?new=support:${auth.user.id}` : '/messages'
  const others = (people ?? []).filter((p) => !p.is_me)

  async function exportThread(format: 'html' | 'json') {
    if (!selected) return
    setExportErr(null); setMenu(false)
    if (format === 'html') {
      const r = await openHtmlFromPost('/api/threads/export', { thread_id: selected, format: 'html', lang: zh ? 'zh' : 'en', acting_role: viewer })
      if (!r.ok) setExportErr(r.error || 'export failed')
      return
    }
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch('/api/threads/export', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ thread_id: selected, format: 'json', acting_role: viewer }) })
    if (!res.ok) { setExportErr(`HTTP ${res.status}`); return }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `stayloop-chat-${selected.slice(0, 8)}.json`; a.click()
  }

  const record = (
    <div data-testid="thread-record">
      <h4 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3">{zh ? '这段对话的记录' : 'Record of this conversation'}</h4>
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-body-3">{zh ? '消息' : 'Messages'}</dt><dd>{msgs.length}{attCount ? ` · ${attCount} ${zh ? '个附件' : 'attachments'}` : ''}</dd>
        <dt className="text-body-3">{zh ? '时间范围' : 'Range'}</dt><dd>{range}</dd>
        <dt className="text-body-3">{zh ? '完整性' : 'Integrity'}</dt>
        <dd data-testid="chain-status">{!chain ? '…' : chain.ok ? <span className="font-bold text-emerald-700">✓ {zh ? `未被改动（${chain.count}/${chain.count}）` : `untouched (${chain.count}/${chain.count})`}</span> : <span className="font-bold text-danger">✗ {zh ? `第 ${chain.brokenAt} 条对不上` : `breaks at #${chain.brokenAt}`}</span>}</dd>
        <dt className="text-body-3">{zh ? '最新指纹' : 'Head'}</dt><dd className="break-all font-mono text-[11px]" title={chain?.head ?? ''}>{shortHash(chain?.head)}</dd>
      </dl>
      <p className="mb-4 text-[11px] leading-relaxed text-body-3">{zh ? '指纹在你的浏览器里重新计算：每条 = SHA-256（上一条指纹 + 本条内容）。删掉或改动任何一条，后面都会对不上。' : 'Recomputed in your browser: each fingerprint = SHA-256(previous fingerprint + this message). Removing or changing any message breaks every one after it.'}</p>
      <h4 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3">{zh ? '点一条消息看细节' : 'Click a message for detail'}</h4>
      {picked ? (
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" data-testid="message-detail">
          <dt className="text-body-3">{zh ? '服务器时间' : 'Server time'}</dt><dd className="font-mono text-[11px]">{picked.created_at.replace('+00:00', 'Z')}<br />{zh ? '多伦多' : 'Toronto'} {new Date(picked.created_at).toLocaleString(zh ? 'zh-CN' : 'en-CA', { timeZone: TORONTO })}</dd>
          <dt className="text-body-3">{zh ? '发送者' : 'Sender'}</dt><dd>{picked.sender_label || (zh ? PARTY_LABEL[picked.sender_kind]?.zh : PARTY_LABEL[picked.sender_kind]?.en)}{picked.sender_label && picked.kind === 'message' ? `（${roleLabel(picked.sender_kind, zh)}）` : ''}{picked.channel === 'email' ? (zh ? ' · 专属回复地址 + 发件地址核对' : ' · reply token + sender address') : picked.kind === 'system' || picked.kind === 'formal_copy' ? (zh ? ' · 系统写入' : ' · written by the system') : (zh ? ' · 登录会话' : ' · signed-in session')}</dd>
          <dt className="text-body-3">{zh ? '渠道' : 'Channel'}</dt><dd>{zh ? CHANNEL_LABEL[picked.channel ?? 'app'].zh : CHANNEL_LABEL[picked.channel ?? 'app'].en}</dd>
          <dt className="text-body-3">{zh ? '回执' : 'Receipts'}</dt>
          <dd>{deliveries.filter((d) => d.message_id === picked.id).length === 0 ? '—' : deliveries.filter((d) => d.message_id === picked.id).map((d) => (
            <div key={d.id}>{d.channel === 'email' ? (zh ? '邮件' : 'Email') : (zh ? '推送' : 'Push')} · {deliveryLabel(d.status, zh)} {new Date(d.updated_at).toLocaleTimeString(zh ? 'zh-CN' : 'en-CA', { timeZone: TORONTO, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          ))}</dd>
          <dt className="text-body-3">{zh ? '本条指纹' : 'Fingerprint'}</dt><dd className="break-all font-mono text-[10.5px]">{picked.hash ?? '—'}</dd>
        </dl>
      ) : <p className="mb-4 text-body-3">—</p>}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => void exportThread('html')} className="sl-btn-secondary w-full !py-2 text-[12.5px]" data-testid="export-thread">{zh ? '导出聊天记录（可打印）' : 'Export chat history (printable)'}</button>
        <button type="button" onClick={() => void exportThread('json')} className="sl-btn-ghost w-full !py-2 text-[12.5px]">{zh ? '导出聊天记录 JSON（供复核）' : 'Export chat history as JSON (to verify)'}</button>
        {exportErr && <p className="text-danger">{exportErr}</p>}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-body-3">{zh ? '需要 Stayloop 介入？' : 'Need Stayloop to step in?'} <Link href={supportHref} className="text-brand">{zh ? '联系 Stayloop →' : 'Contact Stayloop →'}</Link> <Link href="/privacy" className="text-brand">{zh ? '记录保留 7 年 →' : 'Kept 7 years →'}</Link></p>
    </div>
  )

  return (
    <div className="sl-msg-col flex min-h-[520px] overflow-hidden border-line-divider bg-white md:border-l" data-testid="message-center">
      {/* list */}
      <aside className={(selected ? 'hidden md:flex' : 'flex') + ' w-full min-w-0 flex-col border-r border-line-divider bg-[#FBFDFF] md:w-[340px] md:flex-none'}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <h1 className="text-[18px] font-bold text-ink">{zh ? '消息' : 'Messages'}</h1>
          <div className="flex-1" />
          <Link href={supportHref} className="text-[12.5px] font-semibold text-body-2 hover:text-brand" data-testid="contact-stayloop">{zh ? '联系 Stayloop' : 'Contact Stayloop'}</Link>
          <button type="button" onClick={() => { setNewTarget(null); setNewOpen(true) }} className="rounded-full bg-brand px-3.5 py-2 text-[13px] font-bold text-white hover:bg-brand-strong" data-testid="new-message-open">＋ {zh ? '新消息' : 'New'}</button>
        </div>
        <div className="px-4 pb-2">
          <input className="sl-input w-full !rounded-full !py-2 text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? '搜索名字、地址、内容' : 'Search names, addresses, text'} aria-label={zh ? '搜索消息' : 'Search messages'} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3" role="tablist">
          {matterFilter && (
            <Link href="/messages" className="flex-none rounded-full border border-brand bg-[#EAF6FD] px-2.5 py-[3px] text-[11.5px] font-semibold text-brand-strong" data-testid="matter-filter">{zh ? '这件事的对话 ×' : 'This matter ×'}</Link>
          )}
          {filters.map((f) => (
            <button key={f.k} type="button" role="tab" aria-selected={filter === f.k} onClick={() => setFilter(f.k)}
              className={'flex-none rounded-full border px-2.5 py-[3px] text-[11.5px] ' + (filter === f.k ? 'border-ink bg-ink text-white' : 'border-line-divider bg-white text-body-2')}>
              {f.label}{f.n ? ` ${f.n}` : ''}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="inbox-threads">
          {rows === null ? <p className="px-4 py-6 text-[13px] text-body-3">…</p> : visible.length === 0 ? (
            <div className="px-4 py-6 text-[13px] leading-relaxed text-body-3">
              {scoped.length === 0 ? (zh ? '还没有对话。在租约、申请人、报修单、客户表上点「发消息」，或点「新消息」选人。' : 'No conversations yet. Tap “Message” on a lease, an applicant, a repair or a client — or “New” to pick someone.') : (zh ? '没有符合条件的对话。' : 'No conversations match.')}
            </div>
          ) : visible.map((r) => (
            <button key={r.id} type="button" onClick={() => open(r.id)} data-testid="inbox-row"
              className={'flex w-full items-start gap-3 border-t border-line-divider px-4 py-3 text-left ' + (r.id === selected ? 'bg-[#EAF6FD]' : 'hover:bg-surface-chip')}>
              <PersonAvatar name={firstName(r)} role={firstRole(r)} zh={zh} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={'min-w-0 truncate text-[13.5px] text-ink ' + (r.unread ? 'font-bold' : 'font-semibold')} data-testid="inbox-row-name">{nameLine(r)}</span>
                  {firstRole(r) !== 'admin' && (r.counterpart_names ?? [])[0] ? <span className="flex-none rounded-full bg-surface-chip px-1.5 text-[10px] font-bold text-body-2">{roleLabel(firstRole(r), zh)}</span> : null}
                  <span className="ml-auto flex-none font-mono text-[11px] text-body-3">{when(r.last_at)}</span>
                </span>
                <span className="block truncate text-[11.5px] text-body-3">{matterOf(r)}</span>
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-body-2">{who(r)}{zh ? '：' : ': '}{r.last_body}</span>
                  {r.unread > 0 && <span className="flex-none rounded-full bg-brand px-1.5 font-mono text-[10px] font-bold text-white">{r.unread}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* conversation */}
      <section className={(selected ? 'flex' : 'hidden md:flex') + ' min-w-0 flex-1 flex-col'}>
        {!selected || !current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="max-w-[440px] text-[13.5px] text-body-3">
              {selected && rows && !current ? (zh ? '正在打开这段对话…（如果一直打不开，你可能不是它的当事人）' : 'Opening this conversation… (if it never opens, you may not be a party to it)') : (zh ? '选一段对话，或者直接选人发消息。每条消息都带服务器时间、谁发的、经哪个渠道，只能追加、谁都删不掉。' : 'Pick a conversation or someone to message. Every message carries server time, sender and channel; the record is append-only and nobody can delete it.')}
            </p>
            {quick.length > 0 && !selected && (
              <div className="flex max-w-[520px] flex-wrap justify-center gap-2" data-testid="quick-people">
                {quick.map((r) => (
                  <button key={r.id} type="button" onClick={() => router.push(`/messages?t=${r.id}&compose=1`)} className="flex items-center gap-2 rounded-full border border-line-divider bg-white py-1 pl-1 pr-3 text-[12.5px] font-semibold hover:border-brand">
                    <PersonAvatar name={firstName(r)} role={firstRole(r)} zh={zh} size={24} />
                    <span className="max-w-[180px] truncate">{nameLine(r)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setNewTarget(null); setNewOpen(true) }} className="sl-btn-primary !py-2 text-[13px]">{zh ? '选人发消息' : 'Message someone'}</button>
              <Link href={supportHref} className="sl-btn-ghost !py-2 text-[13px]">{zh ? '联系 Stayloop' : 'Contact Stayloop'}</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-line-divider px-4 py-3 md:px-6">
              <div className="flex items-center gap-2.5">
                <button type="button" onClick={() => router.push(matterFilter ? `/messages?matter=${matterFilter}` : '/messages')} className="-ml-1 flex h-8 w-8 flex-none items-center justify-center rounded-full text-[18px] md:hidden" aria-label={zh ? '返回列表' : 'Back to list'}>‹</button>
                <PersonAvatar name={firstName(current)} role={firstRole(current)} zh={zh} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15.5px] font-bold text-ink" data-testid="conversation-name">{nameLine(current)}</div>
                  {/* Only the subject truncates; the link never does (site test 2026-10-02 · L6 D6: at 390 it was clipped off the line). */}
                  <div className="flex min-w-0 items-baseline gap-1 text-[11.5px] text-body-3" data-testid="conversation-subject">
                    <span className="min-w-0 truncate">{zh ? '关于 ' : 'About '}{matterOf(current)}</span>
                    {current.kind !== 'support' ? <><span aria-hidden className="flex-none">·</span><Link href={threadHref(current.kind, current.ref_id, current.household_id, viewer)} className="flex-none whitespace-nowrap text-brand" data-testid="open-matter">{zh ? '查看这件事 →' : 'Open the matter →'}</Link></> : null}
                  </div>
                </div>
                <div className="relative" ref={menuRef}>
                  <button type="button" onClick={() => setMenu((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-body-2 hover:bg-surface-chip" aria-label={zh ? '更多' : 'More'} aria-expanded={menu} data-testid="conversation-menu">⋯</button>
                  {menu && (
                    <div className="absolute right-0 z-20 mt-1 w-[230px] rounded-xl border border-line-divider bg-white py-1.5 text-[13px] shadow-lg" role="menu">
                      <button type="button" role="menuitem" onClick={() => void exportThread('html')} className="block w-full px-4 py-2 text-left hover:bg-surface-chip">{zh ? '导出聊天记录（可打印）' : 'Export chat history (printable)'}</button>
                      <button type="button" role="menuitem" onClick={() => void exportThread('json')} className="block w-full px-4 py-2 text-left hover:bg-surface-chip">{zh ? '导出聊天记录 JSON（供复核）' : 'Export chat history as JSON'}</button>
                      <button type="button" role="menuitem" onClick={() => { setMenu(false); setRecordSheet(true) }} className="block w-full px-4 py-2 text-left hover:bg-surface-chip xl:hidden">{zh ? '记录与指纹' : 'Record & fingerprints'}</button>
                      {current.kind !== 'support' && <Link role="menuitem" href={threadHref(current.kind, current.ref_id, current.household_id, viewer)} className="block px-4 py-2 hover:bg-surface-chip">{zh ? '查看这件事' : 'Open the matter'}</Link>}
                    </div>
                  )}
                </div>
              </div>
              {people && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="thread-participants">
                  {others.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line-divider bg-white px-2.5 py-[2px] text-[11.5px]">
                      <b className="font-semibold">{p.role === 'admin' ? 'Stayloop' : p.name || roleLabel(p.role, zh)}</b>
                      {p.role !== 'admin' && p.name ? <span className="text-body-3">{roleLabel(p.role, zh)}</span> : null}
                      <span className="text-body-3">· {p.pending ? (zh ? '邀请中 · 邮件' : 'invited · email') : p.channel === 'app' ? (zh ? '站内' : 'in app') : (zh ? '邮件' : 'email')}</span>
                    </span>
                  ))}
                  <span className="text-[11px] text-body-3">{zh ? '· 每个人都能看到每条消息' : '· everyone sees every message'}</span>
                </div>
              )}
              {exportErr && <p className="mt-1 text-[12px] text-danger">{exportErr}</p>}
            </div>
            <div className="min-h-0 flex-1">
              <ThreadPanel key={current.id} kind={current.kind} refId={current.ref_id} viewer={viewer} zh={zh} fill hideHeader
                onMessages={onMessages} onSelectMessage={setPick} selectedId={pick} people={people} focusComposer={compose} />
            </div>
          </>
        )}
      </section>

      {current && (
        <aside className="hidden w-[300px] flex-none overflow-y-auto border-l border-line-divider bg-[#FBFDFF] p-4 text-[12.5px] xl:block">{record}</aside>
      )}
      {current && recordSheet && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 xl:hidden" onClick={(e) => { if (e.target === e.currentTarget) setRecordSheet(false) }} role="dialog" aria-modal="true" aria-label={zh ? '记录与指纹' : 'Record & fingerprints'}>
          <div className="max-h-[85dvh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl bg-white p-5 text-[12.5px]">
            <div className="mb-2 flex justify-end"><button type="button" onClick={() => setRecordSheet(false)} className="h-9 w-9 rounded-full text-[18px] text-body-3 hover:bg-surface-chip" aria-label={zh ? '关闭' : 'Close'}>×</button></div>
            {record}
          </div>
        </div>
      )}

      {newOpen && (
        <NewMessage zh={zh} hat={hat} initial={newTarget}
          onClose={() => { setNewOpen(false); setNewTarget(null); if (newParam) router.replace(selected ? `/messages?t=${selected}` : '/messages') }}
          onOpenThread={(id) => { setNewOpen(false); setNewTarget(null); router.push(`/messages?t=${id}&compose=1`) }}
          onSent={(id) => { setNewOpen(false); setNewTarget(null); void load(); router.push(`/messages?t=${id}`) }} />
      )}
    </div>
  )
}

function parseNew(v: string | null): { kind: string; ref: string } | null {
  if (!v) return null
  const [kind, ref] = v.split(':')
  const KINDS = ['work_order', 'application', 'tenancy', 'dispute', 'agent_client', 'support']
  return kind && KINDS.includes(kind) && ref && /^[0-9a-f-]{36}$/i.test(ref) ? { kind, ref } : null
}
function fmtT(iso: string, zh: boolean) {
  return new Date(iso).toLocaleString(zh ? 'zh-CN' : 'en-CA', { timeZone: TORONTO, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function deliveryLabel(s: string, zh: boolean) {
  const m: Record<string, [string, string]> = { sent: ['已发出', 'sent'], delivered: ['已送达', 'delivered'], opened: ['已打开', 'opened'], bounced: ['被退回', 'bounced'], failed: ['发送失败', 'failed'], skipped: ['未推送（对方未开通知）', 'not pushed (no subscription)'] }
  return (m[s] ?? [s, s])[zh ? 0 : 1]
}
