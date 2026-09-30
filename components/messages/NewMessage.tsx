'use client'
// 新消息 · three steps (消息系统 A 期, 2026-09-29).
//   1. 关于哪件事 — only matters the caller is a party to (my_message_targets).
//   2. 发给谁     — who will see it, from the matter's own relationships
//                   (/api/threads/participants). Nobody can add a stranger, and
//                   nobody sees anybody's personal address.
//   3. 写消息     — text + attachments (server-hashed). Sending opens the thread
//                   (open_thread refuses non-parties) and writes the first message.
// Listing inquiries start from the listing page (the prospect is the subject),
// so step 1 lists existing ones only.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { fmtSize, KIND_TAG, type Attachment, type ThreadKind } from '@/lib/threads/shared'
import { notifyMessagesChanged } from '@/lib/messages/unread'

export type Target = { kind: ThreadKind; ref_id: string; title: string; subtitle: string | null; party: string; thread_id: string | null; at: string }
type Participant = { label: string; kind: string; channel: 'app' | 'email'; me: boolean }

const ICON: Record<ThreadKind, string> = { tenancy: '🏠', application: '📝', work_order: '🔧', dispute: '⚖️', listing_inquiry: '🔑', agent_client: '💼', support: '💬' }
const ORDER: ThreadKind[] = ['tenancy', 'work_order', 'application', 'listing_inquiry', 'agent_client', 'support']

async function jwt() { return (await supabase.auth.getSession()).data.session?.access_token ?? null }

export default function NewMessage({ zh, hat, initial, onClose, onSent }: {
  zh: boolean
  hat: 'tenant' | 'landlord' | 'agent' | 'provider'
  /** Deep link "?new=agent_client:<id>" pre-selects the matter. */
  initial?: { kind: string; ref: string } | null
  onClose: () => void
  onSent: (threadId: string) => void
}) {
  const auth = useAuth()
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [parts, setParts] = useState<Participant[] | null>(null)
  const [partsErr, setPartsErr] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (auth.loading || !auth.user) return
    let on = true
    supabase.rpc('my_message_targets').then(({ data }) => {
      if (!on) return
      const rows = ((data ?? []) as Target[]).filter((t) => t.party)
      setTargets(rows)
      if (initial) {
        const hit = rows.find((r) => r.kind === initial.kind && r.ref_id === initial.ref)
        if (hit) { setTarget(hit); setStep(2) }
      }
    })
    return () => { on = false }
  }, [auth.loading, auth.user, initial])

  useEffect(() => {
    if (!target) return
    let on = true
    setParts(null); setPartsErr(null)
    ;(async () => {
      const token = await jwt()
      const qs = target.thread_id ? `thread_id=${target.thread_id}` : `kind=${target.kind}&ref=${target.ref_id}`
      const res = await fetch(`/api/threads/participants?${qs}&lang=${zh ? 'zh' : 'en'}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const j = (await res.json().catch(() => ({}))) as { participants?: Participant[]; error?: string }
      if (!on) return
      if (!res.ok) setPartsErr(j.error || `HTTP ${res.status}`); else setParts(j.participants ?? [])
    })()
    return () => { on = false }
  }, [target, zh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const grouped = useMemo(() => {
    const list = (targets ?? []).filter((t) => !q.trim() || `${t.title} ${t.subtitle ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    return ORDER.map((k) => ({ k, rows: list.filter((t) => t.kind === k) })).filter((g) => g.rows.length)
  }, [targets, q])

  async function ensureThread(): Promise<string | null> {
    if (threadId) return threadId
    if (target?.thread_id) { setThreadId(target.thread_id); return target.thread_id }
    if (!target) return null
    const { data, error } = await supabase.rpc('open_thread', { p_kind: target.kind, p_ref: target.ref_id })
    if (error || !data) { setErr(/not_a_party/.test(error?.message || '') ? (zh ? '你不是这件事的当事人。' : 'You are not a party to this matter.') : (error?.message || 'thread unavailable')); return null }
    setThreadId(String(data))
    return String(data)
  }

  async function upload(list: FileList | null) {
    if (!list) return
    setErr(null); setBusy(true)
    const id = await ensureThread()
    const token = await jwt()
    if (id) for (const f of Array.from(list).slice(0, 6 - files.length)) {
      const fd = new FormData(); fd.append('thread_id', id); fd.append('file', f)
      const res = await fetch('/api/threads/upload', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd })
      const j = (await res.json().catch(() => ({}))) as { attachment?: Attachment; error?: string }
      if (!res.ok || !j.attachment) { setErr(j.error === 'file_type' ? (zh ? '只支持图片、PDF、Word 与文本文件。' : 'Images, PDF, Word and text files only.') : j.error === 'file_size' ? (zh ? '单个文件不能超过 25 MB。' : 'Files must be under 25 MB.') : (j.error || `HTTP ${res.status}`)); break }
      setFiles((p) => [...p, j.attachment!])
    }
    setBusy(false)
  }

  async function send() {
    const body = draft.trim()
    if (!auth.user || (!body && !files.length)) return
    setBusy(true); setErr(null)
    const id = await ensureThread()
    if (!id) { setBusy(false); return }
    const acting = hat === 'provider' ? 'provider' : hat
    const { error } = await supabase.from('thread_messages').insert({ thread_id: id, sender_id: auth.user.id, sender_kind: 'tenant', acting_role: acting, kind: 'message', body: body || (zh ? '（附件）' : '(attachment)'), attachments: files })
    if (error) { setErr(error.message); setBusy(false); return }
    const token = await jwt()
    if (token) void fetch('/api/threads/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ thread_id: id }) }).catch(() => undefined)
    notifyMessagesChanged()
    setBusy(false)
    onSent(id)
  }

  const stepTitle = step === 1 ? (zh ? '这是关于哪件事？' : 'What is this about?') : step === 2 ? (zh ? '发给谁？' : 'Who will see it?') : (zh ? '写消息' : 'Write your message')
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={zh ? '新消息' : 'New message'} data-testid="new-message" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-line-divider px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10.5px] font-bold tracking-[0.12em] text-brand">STEP {step} / 3</div>
            <div className="text-[16px] font-bold text-ink">{stepTitle}</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-body-3 hover:bg-surface-chip" aria-label={zh ? '关闭' : 'Close'}>×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <>
              <input className="sl-input mb-3 w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? '搜索地址、名字' : 'Search address or name'} aria-label={zh ? '搜索' : 'Search'} />
              {targets === null ? <p className="text-[13px] text-body-3">…</p> : grouped.length === 0 ? <p className="text-[13px] text-body-3">{zh ? '没有找到。' : 'Nothing found.'}</p> : grouped.map((g) => (
                <div key={g.k} className="mb-3">
                  <div className="mb-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-body-3">{zh ? KIND_TAG[g.k].zh : KIND_TAG[g.k].en}</div>
                  {g.rows.map((t) => (
                    <button key={`${t.kind}:${t.ref_id}`} type="button" data-testid="target" onClick={() => { setTarget(t); setThreadId(t.thread_id); setStep(2) }}
                      className="mb-1.5 flex w-full items-start gap-3 rounded-xl border border-line-divider px-3 py-2.5 text-left hover:border-brand hover:bg-[#F0FAFE]">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-surface-chip text-[15px]" aria-hidden="true">{ICON[t.kind]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{t.kind === 'support' ? (zh ? '联系 Stayloop' : 'Contact Stayloop') : t.title}</span>
                        <span className="block truncate text-[12px] text-body-3">{t.kind === 'support' ? (zh ? '账号、付款、争议，或任何问题' : 'Account, billing, disputes, anything') : [partyRole(t.party, zh), t.subtitle].filter(Boolean).join(' · ')}{t.thread_id ? (zh ? ' · 已有对话' : ' · existing conversation') : ''}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              <p className="mt-2 text-[11.5px] text-body-3">{zh ? '只列出你参与的事务。向房东咨询房源，请在房源页点「向房东提问」或「预约看房」。' : 'Only matters you are part of. To ask about a listing, use “Ask the landlord” or “Book a showing” on the listing page.'}</p>
            </>
          )}
          {step === 2 && target && (
            <>
              <div className="mb-3 rounded-xl bg-surface-chip px-3 py-2 text-[13px]"><span className="mr-1.5" aria-hidden="true">{ICON[target.kind]}</span><b>{target.kind === 'support' ? (zh ? '联系 Stayloop' : 'Contact Stayloop') : target.title}</b> <span className="text-body-3">· {zh ? KIND_TAG[target.kind].zh : KIND_TAG[target.kind].en}</span></div>
              {partsErr ? <p className="text-[13px] text-danger">{partsErr === 'not_a_party' ? (zh ? '你不是这件事的当事人。' : 'You are not a party to this matter.') : partsErr}</p> : parts === null ? <p className="text-[13px] text-body-3">…</p> : (
                <ul className="space-y-1.5" data-testid="participants">
                  {parts.map((p, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-xl border border-line-divider px-3 py-2 text-[13px]">
                      <span className="text-brand" aria-hidden="true">{p.me ? '•' : '☑'}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.label}</span>
                      <span className="flex-none text-[11.5px] text-body-3">{p.me ? (zh ? '发送者' : 'sender') : p.channel === 'app' ? (zh ? '站内（没开 App 时收邮件）' : 'in app (email if not online)') : (zh ? '邮件 · 可直接回复' : 'email · can reply')}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11.5px] leading-relaxed text-body-3">{zh ? '名单来自这件事里的关系，不能随便加陌生人。对方看不到你的私人邮箱和电话：邮件经 Stayloop 转发，回复会进同一份记录。' : 'The list comes from the matter itself; no strangers can be added. Nobody sees your personal email or phone: email is relayed by Stayloop and replies land in the same record.'}</p>
            </>
          )}
          {step === 3 && target && (
            <>
              <textarea className="sl-input min-h-[140px] w-full resize-y" value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 4000))} placeholder={zh ? '写消息…' : 'Write a message…'} aria-label={zh ? '消息内容' : 'Message'} autoFocus />
              {files.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{files.map((a) => <span key={a.path} className="rounded-full bg-surface-chip px-2 py-[2px] text-[11.5px]">{a.name} <span className="text-body-3">{fmtSize(a.size)}</span></span>)}</div>}
              <div className="mt-3 grid gap-2 text-[12px] text-body-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line-divider px-3 py-2">
                  <span aria-hidden="true">📎</span> <span>{busy ? '…' : zh ? '附件 · 照片、PDF · 服务器算指纹' : 'Attach · photos, PDF · server-hashed'}</span>
                  <input type="file" className="hidden" multiple accept="image/*,.heic,.heif,application/pdf,.txt,.doc,.docx" onChange={(e) => void upload(e.target.files)} disabled={busy || files.length >= 6} />
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-line-divider px-3 py-2"><span aria-hidden="true">⏱</span><span>{zh ? '发出后记录不可删改；10 分钟内可撤回（原文保留）' : 'Once sent the record cannot be edited; retract within 10 min (original kept)'}</span></div>
              </div>
            </>
          )}
          {err && <p className="mt-2 text-[12.5px] text-danger">{err}</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-line-divider px-5 py-3">
          {step > 1 && <button type="button" onClick={() => { setStep((s) => (s === 3 ? 2 : 1)); setErr(null) }} className="sl-btn-ghost">{zh ? '上一步' : 'Back'}</button>}
          <div className="flex-1" />
          {step === 2 && <button type="button" disabled={!parts || !!partsErr} onClick={() => setStep(3)} className="sl-btn-primary disabled:opacity-50">{zh ? '下一步' : 'Next'}</button>}
          {step === 3 && <button type="button" data-testid="new-message-send" disabled={busy || (!draft.trim() && !files.length)} onClick={() => void send()} className="sl-btn-primary disabled:opacity-50">{busy ? '…' : zh ? '发送' : 'Send'}</button>}
        </div>
      </div>
    </div>
  )
}

export function partyRole(p: string | null, zh: boolean): string {
  const m: Record<string, [string, string]> = { tenant: ['你是租客', 'You: tenant'], landlord: ['你是房东', 'You: landlord'], agent: ['你是经纪', 'You: agent'], provider: ['你是服务商', 'You: provider'], admin: ['管理员', 'Admin'], member: ['', ''] }
  const v = m[p || ''] ?? ['', '']
  return zh ? v[0] : v[1]
}
