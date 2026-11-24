'use client'

// 「发消息」 to a service provider (维修服务 / 专业服务) — V0.9, 2026-11-22.
// The first message goes through POST /api/providers/<id>/contact, which opens the one conversation
// between this person and that provider; everything after that happens in /messages.
// It lives in the contact panel of the provider's page (/providers/<id>#contact) — the directory
// cards link there, the way the agent cards link to the agent's page. It began the same day as a
// button on the card itself; the cards were then made to match the agent directory.
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { CONTACT_MAX, CONTACT_MIN } from '@/lib/agentPublic'

export function providerContactErrorText(code: string | null | undefined, zh: boolean): string {
  switch (code) {
    case 'sign_in_required': return zh ? '请先登录。' : 'Sign in first.'
    case 'message_length': return zh ? `消息要写 ${CONTACT_MIN} 到 ${CONTACT_MAX} 个字。` : `A message is ${CONTACT_MIN} to ${CONTACT_MAX} characters.`
    case 'rate_limited': return zh ? '发得太频繁了，过一会儿再试。' : 'Too many messages just now — try again in a little while.'
    case 'own_profile': return zh ? '这是你自己的服务商档案。' : 'This is your own provider profile.'
    case 'not_found': return zh ? '这家服务商现在不在目录里。' : 'This provider is not in the directory right now.'
    default: return zh ? '消息没有发出去，请稍后再试。' : 'The message did not go through — try again shortly.'
  }
}

export default function ProviderContact({ providerId, providerName, zh, as, professional = false }: {
  providerId: string
  providerName: string
  zh: boolean
  /** the hat the person is wearing; the server keeps it only if the account holds it */
  as?: 'tenant' | 'landlord' | 'agent' | null
  /** a licensed professional or a photographer, not a repair trade: the prompt in the box asks for different things */
  professional?: boolean
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const body = text.trim()
  const ready = body.length >= CONTACT_MIN && body.length <= CONTACT_MAX

  async function send() {
    if (busy || !ready) return
    setBusy(true); setErr(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) { setErr(providerContactErrorText('sign_in_required', zh)); return }
      const res = await fetch(`/api/providers/${providerId}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: body, ...(as ? { as } : {}) }) })
      const j = (await res.json().catch(() => ({}))) as { thread_id?: string; error?: string }
      if (!res.ok || !j.thread_id) { setErr(providerContactErrorText(j.error, zh)); return }
      setSent(j.thread_id); setText('')
    } catch {
      setErr(providerContactErrorText(null, zh))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-3 text-[13.5px] text-emerald-800" data-testid="provider-contact-sent">
        {zh ? `已发给 ${providerName}。对方回复后会出现在你的消息里。` : `Sent to ${providerName}. Their reply will appear in your messages.`}
        <Link href={`/messages?t=${sent}`} className="mt-2 block font-semibold underline">{zh ? '打开这段对话' : 'Open the conversation'}</Link>
      </div>
    )
  }
  return (
    <div className="mt-3 space-y-3" data-testid="provider-contact-form">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={CONTACT_MAX}
        aria-label={zh ? `给 ${providerName} 的消息` : `Message to ${providerName}`}
        placeholder={professional
          ? (zh ? '说说是哪一类事、有没有期限、在哪个城市。先不要写证件号码。' : 'What kind of matter, any deadline, and which city. Leave ID numbers out for now.')
          : (zh ? '说说要做什么、在哪个城市、大概什么时候方便。' : 'What needs doing, in which city, and roughly when works for you.')}
        className="min-h-[120px] w-full rounded-xl border border-line-divider bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-body-3 focus:border-brand focus:bg-[#F7FBFE]"
        data-testid="provider-contact-input"
      />
      <p className="text-[11.5px] leading-relaxed text-body-3">
        {zh ? '消息进入站内对话并留有记录；对方回复后你会在「消息」里看到。费用由你和对方直接谈，Stayloop 不经手。' : 'The message opens an in-app conversation that is kept on record; the reply appears in Messages. Fees are between you and them — nothing goes through Stayloop.'}
      </p>
      {err && <p className="text-[12.5px] font-semibold text-red-700" role="alert" data-testid="provider-contact-error">{err}</p>}
      <button type="button" onClick={() => void send()} disabled={busy || !ready} data-testid="provider-contact-send" className="sl-btn-primary w-full !py-[10px] disabled:opacity-50">{busy ? '…' : zh ? '发送消息' : 'Send message'}</button>
    </div>
  )
}
