'use client'

// The work-order thread as the external contractor (no account) sees it on
// /w/[token] (节点 4 2026-09-26): read and reply through the token door. No
// attachments and no read marks from this side — the token is a capability
// URL, not an identity; landlord and tenant see these messages as
// "服务商（邮件链接）".
import { useRef, useState } from 'react'
import { PARTY_LABEL, type ThreadMessage } from '@/lib/threads/shared'
import { isSendKey } from '@/components/messages/composerKeys'

export type ExternalMessage = Pick<ThreadMessage, 'id' | 'sender_kind' | 'sender_label' | 'kind' | 'body' | 'created_at'>

export default function ExternalThread({ token, messages, zh, onSent }: { token: string; messages: ExternalMessage[]; zh: boolean; onSent: () => void | Promise<void> }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const when = (iso: string) => new Date(iso).toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  // Same guards as ThreadPanel (sweep 2026-10-01): a ref blocks a second Enter in
  // the same tick, the draft clears at once and comes back if the send fails.
  const sendingRef = useRef(false)
  async function send() {
    if (sendingRef.current) return
    const body = draft.trim()
    if (!body) return
    sendingRef.current = true
    setBusy(true); setErr(null)
    setDraft('')
    const restore = () => setDraft((cur) => (cur.trim() ? `${body}\n${cur}` : body))
    try {
      let res: Response
      try {
        res = await fetch(`/api/w/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message', payload: { body } }) })
      } catch (e) {
        setErr((e as Error).message || 'send failed'); restore(); return
      }
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setErr(j.error || `HTTP ${res.status}`); restore(); return }
      // Sent: a failed refresh must not put the text back as if it were unsent.
      await Promise.resolve(onSent()).catch(() => undefined)
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }
  const visible = messages.filter((m) => m.kind !== 'retraction')
  return (
    <div className="mt-6 rounded-2xl border border-line-divider bg-white" data-testid="external-thread">
      <div className="flex items-center gap-2 border-b border-line-divider px-4 py-2.5"><span className="text-[13px] font-bold">{zh ? '工单对话（房东 · 租客 · 你）' : 'Work-order thread (landlord · tenant · you)'}</span><span className="font-mono text-[11px] text-body-3">{visible.length}</span></div>
      <div className="max-h-[360px] overflow-y-auto px-4 py-3">
        {visible.length === 0 && <p className="py-5 text-center text-[12.5px] text-body-3">{zh ? '还没有消息。' : 'No messages yet.'}</p>}
        {visible.map((m) => {
          const mine = m.sender_kind === 'external'
          const party = PARTY_LABEL[m.sender_kind] ?? PARTY_LABEL.system
          if (m.kind === 'system') return <div key={m.id} className="my-2 text-center text-[11.5px] text-body-3"><span className="font-mono">{when(m.created_at)}</span> · {m.body}</div>
          return (
            <div key={m.id} className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={'max-w-[82%] rounded-xl px-3.5 py-2 text-[13.5px] leading-relaxed ' + (m.kind === 'formal_copy' ? 'border border-amber-200 bg-amber-50 text-amber-950' : mine ? 'bg-brand text-white' : 'bg-surface-chip text-body')}>
                <div className={'mb-0.5 font-mono text-[10px] font-bold ' + (mine && m.kind !== 'formal_copy' ? 'text-white/80' : 'text-body-3')}>{m.sender_label || (zh ? party.zh : party.en)} · <time dateTime={m.created_at}>{when(m.created_at)}</time></div>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 border-t border-line-divider p-3">
        <textarea className="min-h-[44px] flex-1 resize-y rounded-lg border border-line-divider bg-white px-3 py-2 text-[15px]" rows={1} value={draft} placeholder={zh ? '给房东 / 租客留言…' : 'Message the landlord / tenant…'} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (isSendKey(e)) { e.preventDefault(); void send() } }} />
        <button type="button" onClick={() => void send()} disabled={busy || !draft.trim()} className="rounded-lg bg-brand px-4 text-[14px] font-bold text-white disabled:opacity-50">{zh ? '发送' : 'Send'}</button>
      </div>
      {err && <p className="px-4 pb-3 text-[12px] text-danger">{err}</p>}
      <p className="px-4 pb-3 text-[10.5px] text-body-3">{zh ? '你的消息以「服务商（邮件链接）」身份记录，服务器时间，不可修改。' : 'Your messages are recorded as "Contractor (email link)", with server time, and cannot be edited.'}</p>
    </div>
  )
}
