'use client'

// The first message to an agent (2026-10-21) — taken out of the agent's public page on 2026-11-24,
// unchanged, so the AI conversation's directory card can open the same form beside an agent's card
// (components/agent/DirectoryChatCard). It posts to /api/agents/<slug>/contact, which adds the
// person to that agent's client list and opens their conversation; everything after that happens in
// /messages. The line above the button says what the agent receives — it is shown wherever the form is.
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { CONTACT_MAX, CONTACT_MIN } from '@/lib/agentPublic'

export default function AgentContact({ slug, agentName, zh, initialRole = 'tenant' }: {
  slug: string; agentName: string; zh: boolean
  /** which of the two the form starts on — a landlord's conversation starts on 「我有房要出租」 */
  initialRole?: 'tenant' | 'landlord'
}) {
  const [role, setRole] = useState<'tenant' | 'landlord'>(initialRole)
  const [area, setArea] = useState('')
  const [budget, setBudget] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sentThread, setSentThread] = useState<string | null>(null)

  async function send() {
    setErr(null)
    if (message.trim().length < CONTACT_MIN) return setErr(zh ? `多写几句，至少 ${CONTACT_MIN} 个字。` : `Please write at least ${CONTACT_MIN} characters.`)
    setBusy(true)
    const { data: s } = await supabase.auth.getSession()
    const token = s.session?.access_token
    if (!token) { setBusy(false); return setErr(zh ? '请先登录。' : 'Please sign in first.') }
    const res = await fetch(`/api/agents/${encodeURIComponent(slug)}/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role, area, budget, message }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok && data?.thread_id) { setSentThread(String(data.thread_id)); return }
    const e = String(data?.error || res.status)
    setErr(e === 'rate_limited' ? (zh ? '发得太频繁了，请过一会儿再试。' : 'Too many messages. Please try again a little later.')
      : e === 'own_profile' ? (zh ? '不能给自己发消息。' : 'You cannot message yourself.')
      : e === 'message_length' ? (zh ? `消息长度要在 ${CONTACT_MIN}–${CONTACT_MAX} 字之间。` : `Messages must be ${CONTACT_MIN}–${CONTACT_MAX} characters.`)
      : (zh ? '没发出去，请稍后再试。' : 'Could not send — please try again shortly.'))
  }

  if (sentThread) {
    return (
      <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-3 text-[13.5px] text-emerald-800" data-testid="agent-contact-sent">
        {zh ? `已发给 ${agentName}。TA 的回复会出现在你的消息中心。` : `Sent to ${agentName}. Their reply will arrive in your message centre.`}
        <Link href={`/messages?t=${sentThread}`} className="mt-2 block font-semibold underline">{zh ? '打开这段对话' : 'Open the conversation'}</Link>
      </div>
    )
  }
  const input = 'w-full rounded-xl border border-line-divider bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-body-3 focus:border-brand focus:bg-[#F7FBFE]'
  return (
    <div className="mt-3 space-y-3" data-testid="agent-contact-form">
      <div className="flex gap-2">
        {(['tenant', 'landlord'] as const).map((r) => (
          <button key={r} type="button" onClick={() => setRole(r)}
            className={'min-h-[44px] flex-1 rounded-full border px-3 text-[13px] transition ' + (role === r ? 'border-[#2563EB] bg-[#EAF1FF] font-semibold text-[#1D4ED8]' : 'border-line-divider bg-white text-body-2 hover:border-brand')}>
            {r === 'tenant' ? (zh ? '我想租房' : 'I want to rent') : (zh ? '我有房要出租' : 'I have a place to rent out')}
          </button>
        ))}
      </div>
      <input className={input} value={area} maxLength={160} onChange={(e) => setArea(e.target.value)} placeholder={zh ? '区域（可选）' : 'Area (optional)'} />
      <input className={input} value={budget} maxLength={80} onChange={(e) => setBudget(e.target.value)} placeholder={role === 'tenant' ? (zh ? '预算（可选），例如 $2,500/月' : 'Budget (optional), e.g. $2,500/mo') : (zh ? '期望租金（可选）' : 'Expected rent (optional)')} />
      <textarea className={`${input} min-h-[120px]`} value={message} maxLength={CONTACT_MAX} onChange={(e) => setMessage(e.target.value)}
        placeholder={zh ? '说说你的情况：什么时候、几个人、有什么要求。' : 'Tell them about your situation: when, how many people, what you need.'} />
      <p className="text-[11.5px] leading-relaxed text-body-3">
        {zh
          ? '发送后，这位经纪会收到你的显示名和登录邮箱，并把你记进 TA 的客户表，在 Stayloop 站内回复你。'
          : 'When you send, this agent receives your display name and sign-in email, adds you to their client list and replies on Stayloop.'}
      </p>
      {err && <div className="text-[12.5px] font-semibold text-red-700" data-testid="agent-contact-error">⚠ {err}</div>}
      <button onClick={send} disabled={busy} className="sl-btn-primary w-full !py-[10px] disabled:opacity-50" data-testid="agent-contact-send">{busy ? '…' : (zh ? '发送消息' : 'Send message')}</button>
    </div>
  )
}
