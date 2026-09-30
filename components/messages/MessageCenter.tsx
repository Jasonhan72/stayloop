'use client'
// 消息中心 /messages (消息系统 A 期, 2026-09-29 · design/messaging-redesign-2026-09.html §4.1).
// One entry for every conversation, whatever hat the account wears: a list
// (search, 全部 / 待回复 / by type), the conversation (the same ThreadPanel the
// matter pages use — realtime, append-only, read receipts, retraction keeps the
// original), and a record panel: count, time range, the hash chain recomputed
// in this browser, the latest fingerprint, per-message detail with delivery
// receipts, and the export. "新消息" starts a conversation on any matter the
// account is a party to.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import ThreadPanel, { type ThreadViewer } from '@/components/threads/ThreadPanel'
import NewMessage from './NewMessage'
import { CHANNEL_LABEL, KIND_TAG, PARTY_LABEL, type ThreadKind, type ThreadMessage } from '@/lib/threads/shared'
import { shortHash, verifyChain, type ChainReport } from '@/lib/threads/hashChain'
import { MESSAGES_CHANGED_EVENT, notifyMessagesChanged } from '@/lib/messages/unread'
import { openHtmlFromPost } from '@/lib/export/openHtml'

export type ThreadSummary = {
  id: string; kind: ThreadKind; ref_id: string; household_id: string | null; listing_id: string | null; matter_id: string | null; title: string | null
  party: string; last_id: number; last_at: string; last_body: string; last_kind: string; last_sender_kind: string; last_sender_id: string | null; last_channel: string
  unread: number; awaiting_reply: boolean; message_count: number
}
type Filter = 'all' | 'awaiting' | 'landlord' | 'tenant' | 'agent' | 'provider' | 'support'
type Participant = { label: string; kind: string; channel: 'app' | 'email'; me: boolean }
type Delivery = { id: number; message_id: number | null; channel: string; recipient_user_id: string | null; provider_message_id: string | null; status: string; created_at: string; updated_at: string }

const TORONTO = 'America/Toronto'

export default function MessageCenter({ hat }: { hat: 'tenant' | 'landlord' | 'agent' | 'provider' }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const selected = params?.get('t') || null
  const newParam = params?.get('new') || null
  const [rows, setRows] = useState<ThreadSummary[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(!!newParam)
  const [msgs, setMsgs] = useState<ThreadMessage[]>([])
  const [chain, setChain] = useState<ChainReport | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [parts, setParts] = useState<Participant[] | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [exportErr, setExportErr] = useState<string | null>(null)

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

  const current = useMemo(() => rows?.find((r) => r.id === selected) ?? null, [rows, selected])

  // Participants and deliveries of the open conversation.
  useEffect(() => {
    setParts(null); setPick(null); setDeliveries([]); setChain(null); setExportErr(null)
    if (!selected) return
    let on = true
    ;(async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/threads/participants?thread_id=${selected}&lang=${zh ? 'zh' : 'en'}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const j = (await res.json().catch(() => ({}))) as { participants?: Participant[] }
      if (on) setParts(j.participants ?? [])
    })()
    return () => { on = false }
  }, [selected, zh])

  const onMessages = useCallback((m: ThreadMessage[], tid: string | null) => {
    if (!tid || tid !== selected) return
    setMsgs(m)
    void verifyChain(m.map((x) => ({ ...x, thread_id: x.thread_id ?? tid, attachments: x.attachments ?? [] })) as never).then(setChain)
    void supabase.from('message_deliveries').select('id, message_id, channel, recipient_user_id, provider_message_id, status, created_at, updated_at').eq('thread_id', tid).order('id', { ascending: true }).limit(500)
      .then(({ data }) => setDeliveries((data ?? []) as Delivery[]))
  }, [selected])

  const counts = useMemo(() => ({ awaiting: (rows ?? []).filter((r) => r.awaiting_reply).length }), [rows])
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows ?? []).filter((r) => {
      if (filter === 'awaiting' && !r.awaiting_reply) return false
      if (filter === 'support' && r.kind !== 'support') return false
      if (['landlord', 'tenant', 'agent', 'provider'].includes(filter) && r.party !== filter) return false
      if (needle && !`${r.title ?? ''} ${r.last_body}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [rows, filter, q])

  const open = (id: string) => router.push(`/messages?t=${id}`, { scroll: false })
  const when = (iso: string) => {
    const d = new Date(iso); const now = new Date()
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString(zh ? 'zh-CN' : 'en-CA', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric' })
  }
  const who = (r: ThreadSummary) => r.last_sender_id === auth.user?.id ? (zh ? '你' : 'You') : r.last_kind === 'system' ? (zh ? '系统' : 'System') : (zh ? PARTY_LABEL[r.last_sender_kind as keyof typeof PARTY_LABEL]?.zh : PARTY_LABEL[r.last_sender_kind as keyof typeof PARTY_LABEL]?.en) ?? r.last_sender_kind
  const viewer: ThreadViewer = current?.party === 'admin' ? 'admin' : current && ['tenant', 'landlord', 'agent', 'provider'].includes(current.party) ? current.party as ThreadViewer : hat
  const title = (r: ThreadSummary) => r.kind === 'support' ? (zh ? 'Stayloop 客服' : 'Stayloop support') : r.title || '—'

  const filters: { k: Filter; zh: string; en: string; n?: number }[] = [
    { k: 'all', zh: '全部', en: 'All' },
    { k: 'awaiting', zh: '待回复', en: 'Awaiting reply', n: counts.awaiting },
    ...(['landlord', 'tenant', 'agent', 'provider'] as const).filter((p) => (rows ?? []).some((r) => r.party === p)).map((p) => ({ k: p as Filter, zh: `作为${PARTY_LABEL[p].zh}`, en: `As ${PARTY_LABEL[p].en.toLowerCase()}` })),
    ...((rows ?? []).some((r) => r.kind === 'support') ? [{ k: 'support' as Filter, zh: 'Stayloop', en: 'Stayloop' }] : []),
  ]

  const picked = pick != null ? msgs.find((m) => m.id === pick) ?? null : null
  const range = msgs.length ? `${fmtT(msgs[0].created_at, zh)} → ${fmtT(msgs[msgs.length - 1].created_at, zh)}` : '—'
  const attCount = msgs.reduce((n, m) => n + (m.attachments?.length ?? 0), 0)

  async function exportThread(format: 'html' | 'json') {
    if (!selected) return
    setExportErr(null)
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
    a.href = URL.createObjectURL(blob); a.download = `stayloop-thread-${selected.slice(0, 8)}.json`; a.click()
  }

  return (
    <div className="flex h-[calc(100dvh-66px-64px)] min-h-[520px] overflow-hidden border-line-divider bg-white md:h-[calc(100vh-66px)] md:border-l" data-testid="message-center">
      {/* list */}
      <aside className={(selected ? 'hidden md:flex' : 'flex') + ' w-full min-w-0 flex-col border-r border-line-divider bg-[#FBFDFF] md:w-[340px] md:flex-none'}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <h1 className="text-[18px] font-bold text-ink">{zh ? '消息' : 'Messages'}</h1>
          <div className="flex-1" />
          <button type="button" onClick={() => setNewOpen(true)} className="rounded-full bg-brand px-3.5 py-2 text-[13px] font-bold text-white hover:bg-brand-strong" data-testid="new-message-open">＋ {zh ? '新消息' : 'New message'}</button>
        </div>
        <div className="px-4 pb-2">
          <input className="sl-input w-full !rounded-full !py-2 text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? '搜索地址、名字、内容' : 'Search address, name, text'} aria-label={zh ? '搜索消息' : 'Search messages'} />
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 pb-3" role="tablist">
          {filters.map((f) => (
            <button key={f.k} type="button" role="tab" aria-selected={filter === f.k} onClick={() => setFilter(f.k)}
              className={'rounded-full border px-2.5 py-[3px] text-[11.5px] ' + (filter === f.k ? 'border-ink bg-ink text-white' : 'border-line-divider bg-white text-body-2')}>
              {zh ? f.zh : f.en}{f.n ? ` ${f.n}` : ''}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="inbox-threads">
          {rows === null ? <p className="px-4 py-6 text-[13px] text-body-3">…</p> : visible.length === 0 ? (
            <div className="px-4 py-6 text-[13px] leading-relaxed text-body-3">
              {rows.length === 0 ? (zh ? '还没有对话。点「新消息」就在租约、申请、维修工单或经纪委托上发起一段；房源咨询从房源页发起。' : 'No conversations yet. Use “New message” to start one on a tenancy, application, work order or agent engagement; listing questions start from the listing page.') : (zh ? '没有符合条件的对话。' : 'No conversations match.')}
            </div>
          ) : visible.map((r) => (
            <button key={r.id} type="button" onClick={() => open(r.id)} data-testid="inbox-row"
              className={'grid w-full grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 border-t border-line-divider px-4 py-3 text-left ' + (r.id === selected ? 'bg-[#EAF6FD]' : 'hover:bg-surface-chip')}>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={'truncate text-[13.5px] text-ink ' + (r.unread ? 'font-bold' : 'font-semibold')}>{title(r)}</span>
                <span className="flex-none text-[10.5px] font-bold text-body-3">{zh ? KIND_TAG[r.kind].zh : KIND_TAG[r.kind].en}</span>
                {r.unread > 0 && <span className="flex-none rounded-full bg-brand px-1.5 font-mono text-[10px] font-bold text-white">{r.unread}</span>}
              </span>
              <span className="font-mono text-[11px] text-body-3">{when(r.last_at)}</span>
              <span className="col-span-2 truncate text-[12.5px] text-body-2">{who(r)}：{r.last_body}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* conversation */}
      <section className={(selected ? 'flex' : 'hidden md:flex') + ' min-w-0 flex-1 flex-col'}>
        {!selected || !current ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-[13.5px] text-body-3">
            {selected && rows && !current ? (zh ? '找不到这段对话，或你不是它的当事人。' : 'This conversation was not found, or you are not a party to it.') : (zh ? '选一段对话，或点「新消息」。每条消息都带服务器时间、谁发的、经哪个渠道，只能追加、谁都删不掉。' : 'Pick a conversation or start a new one. Every message carries server time, sender and channel; the record is append-only and nobody can delete it.')}
          </div>
        ) : (
          <>
            <div className="border-b border-line-divider px-4 py-3 md:px-6">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => router.push('/messages')} className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-[18px] md:hidden" aria-label={zh ? '返回列表' : 'Back to list'}>‹</button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15.5px] font-bold text-ink">{title(current)}</div>
                  <div className="text-[11.5px] text-body-3">{zh ? KIND_TAG[current.kind].zh : KIND_TAG[current.kind].en}{current.matter_id ? ` · ${zh ? '事务' : 'matter'} #${current.matter_id.slice(0, 4)}` : ''} · {current.message_count} {zh ? '条' : 'messages'}</div>
                </div>
              </div>
              {parts && parts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="thread-participants">
                  {parts.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line-divider bg-white px-2.5 py-[2px] text-[11.5px]">
                      <b className="font-semibold">{p.label}</b>
                      <span className="text-body-3">{p.channel === 'app' ? (zh ? '站内' : 'in app') : (zh ? '邮件' : 'email')}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <ThreadPanel key={current.id} kind={current.kind} refId={current.ref_id} viewer={viewer} zh={zh} fill hideHeader
                onMessages={onMessages} onSelectMessage={setPick} selectedId={pick} />
            </div>
          </>
        )}
      </section>

      {/* record */}
      {current && (
        <aside className="hidden w-[300px] flex-none overflow-y-auto border-l border-line-divider bg-[#FBFDFF] p-4 text-[12.5px] xl:block" data-testid="thread-record">
          <h4 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3">{zh ? '这段对话的记录' : 'Record of this conversation'}</h4>
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-body-3">{zh ? '消息' : 'Messages'}</dt><dd>{msgs.length}{attCount ? ` · ${attCount} ${zh ? '个附件' : 'attachments'}` : ''}</dd>
            <dt className="text-body-3">{zh ? '时间范围' : 'Range'}</dt><dd>{range}</dd>
            <dt className="text-body-3">{zh ? '哈希链' : 'Hash chain'}</dt>
            <dd data-testid="chain-status">{!chain ? '…' : chain.ok ? <span className="font-bold text-emerald-700">✓ {zh ? `完整（${chain.count}/${chain.count}）` : `intact (${chain.count}/${chain.count})`}</span> : <span className="font-bold text-danger">✗ {zh ? `第 ${chain.brokenAt} 条对不上` : `breaks at #${chain.brokenAt}`}</span>}</dd>
            <dt className="text-body-3">{zh ? '最新指纹' : 'Head'}</dt><dd className="break-all font-mono text-[11px]" title={chain?.head ?? ''}>{shortHash(chain?.head)}</dd>
          </dl>
          <p className="mb-4 text-[11px] leading-relaxed text-body-3">{zh ? '指纹在你的浏览器里重新计算：每条 = SHA-256（上一条指纹 + 本条内容）。删掉或改动任何一条，后面都会对不上。' : 'Recomputed in your browser: each fingerprint = SHA-256(previous fingerprint + this message). Removing or changing any message breaks every one after it.'}</p>
          <h4 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3">{zh ? '点一条消息看细节' : 'Click a message for detail'}</h4>
          {picked ? (
            <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" data-testid="message-detail">
              <dt className="text-body-3">{zh ? '服务器时间' : 'Server time'}</dt><dd className="font-mono text-[11px]">{picked.created_at.replace('+00:00', 'Z')}<br />{zh ? '多伦多' : 'Toronto'} {new Date(picked.created_at).toLocaleString(zh ? 'zh-CN' : 'en-CA', { timeZone: TORONTO })}</dd>
              <dt className="text-body-3">{zh ? '发送者' : 'Sender'}</dt><dd>{picked.sender_label || (zh ? PARTY_LABEL[picked.sender_kind]?.zh : PARTY_LABEL[picked.sender_kind]?.en)}{picked.channel === 'email' ? (zh ? ' · 专属回复地址 + 发件地址核对' : ' · reply token + sender address') : picked.kind === 'system' || picked.kind === 'formal_copy' ? (zh ? ' · 系统写入' : ' · written by the system') : (zh ? ' · 登录会话' : ' · signed-in session')}</dd>
              <dt className="text-body-3">{zh ? '渠道' : 'Channel'}</dt><dd>{zh ? CHANNEL_LABEL[picked.channel ?? 'app'].zh : CHANNEL_LABEL[picked.channel ?? 'app'].en}</dd>
              <dt className="text-body-3">{zh ? '回执' : 'Receipts'}</dt>
              <dd>{deliveries.filter((d) => d.message_id === picked.id).length === 0 ? '—' : deliveries.filter((d) => d.message_id === picked.id).map((d) => (
                <div key={d.id}>{d.channel === 'email' ? (zh ? '邮件' : 'Email') : (zh ? '推送' : 'Push')} · {deliveryLabel(d.status, zh)} {new Date(d.updated_at).toLocaleTimeString(zh ? 'zh-CN' : 'en-CA', { timeZone: TORONTO, hour: '2-digit', minute: '2-digit', second: '2-digit' })}{d.provider_message_id ? <span className="font-mono text-[10px] text-body-3"> ({d.provider_message_id.slice(0, 8)}…)</span> : null}</div>
              ))}</dd>
              <dt className="text-body-3">{zh ? '本条指纹' : 'Fingerprint'}</dt><dd className="break-all font-mono text-[10.5px]">{picked.hash ?? '—'}</dd>
            </dl>
          ) : <p className="mb-4 text-body-3">—</p>}
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => void exportThread('html')} className="sl-btn-secondary w-full !py-2 text-[12.5px]" data-testid="export-thread">{zh ? '导出证据包（可打印）' : 'Export evidence (printable)'}</button>
            <button type="button" onClick={() => void exportThread('json')} className="sl-btn-ghost w-full !py-2 text-[12.5px]">{zh ? '导出 JSON（供复核）' : 'Export JSON (to verify)'}</button>
            {exportErr && <p className="text-danger">{exportErr}</p>}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-body-3">{zh ? '需要 Stayloop 介入？点「新消息」→「联系 Stayloop」，写明是哪段对话。之前的记录原样保留。' : 'Need Stayloop to step in? “New message” → “Contact Stayloop” and say which conversation. The record stays as it is.'} <Link href="/privacy" className="text-brand">{zh ? '记录保留 7 年 →' : 'Kept 7 years →'}</Link></p>
        </aside>
      )}

      {newOpen && (
        <NewMessage zh={zh} hat={hat} initial={parseNew(newParam)} onClose={() => { setNewOpen(false); if (newParam) router.replace(selected ? `/messages?t=${selected}` : '/messages') }}
          onSent={(id) => { setNewOpen(false); void load(); router.push(`/messages?t=${id}`) }} />
      )}
    </div>
  )
}

function parseNew(v: string | null): { kind: string; ref: string } | null {
  if (!v) return null
  const [kind, ref] = v.split(':')
  return kind && ref && /^[0-9a-f-]{36}$/i.test(ref) ? { kind, ref } : null
}
function fmtT(iso: string, zh: boolean) {
  return new Date(iso).toLocaleString(zh ? 'zh-CN' : 'en-CA', { timeZone: TORONTO, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function deliveryLabel(s: string, zh: boolean) {
  const m: Record<string, [string, string]> = { sent: ['已发出', 'sent'], delivered: ['已送达', 'delivered'], opened: ['已打开', 'opened'], bounced: ['被退回', 'bounced'], failed: ['发送失败', 'failed'], skipped: ['未推送（对方未开通知）', 'not pushed (no subscription)'] }
  return (m[s] ?? [s, s])[zh ? 0 : 1]
}
