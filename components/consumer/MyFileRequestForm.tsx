'use client'

// /my-file step 1 — the applicant types the email they applied with and we
// send a one-time confirmation link. The answer is the same sentence whether
// or not that email has ever applied (the API never says; neither do we).

import { useState } from 'react'
import { useT } from '@/lib/i18n'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function MyFileRequestForm() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = email.trim().toLowerCase()
    if (!EMAIL_RE.test(v)) { setErr(zh ? '请填写一个完整的邮箱地址。' : 'Please enter a complete email address.'); return }
    setErr(null)
    setBusy(true)
    try {
      await fetch('/api/consumer/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v, lang }) })
    } catch { /* same answer either way */ }
    setBusy(false)
    setSent(true)
  }

  if (sent) {
    return (
      <div data-testid="my-file-sent" className="rounded-2xl border border-line-divider bg-white p-5 sm:p-6">
        <div className="text-[16px] font-bold">{zh ? '如果这个邮箱申请过房源，你会收到一封邮件。' : 'If this email has applied for a home, you will get an email.'}</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          {zh
            ? '邮件里的链接 24 小时内有效。没收到的话先看垃圾邮件；也可以换一个申请时用过的邮箱再试。'
            : 'The link in the email works for 24 hours. If nothing arrives, check your spam folder, or try another email you applied with.'}
        </p>
        <button type="button" onClick={() => { setSent(false); setEmail('') }} className="mt-4 text-[13px] font-semibold text-brand hover:underline">
          {zh ? '换一个邮箱' : 'Use a different email'}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line-divider bg-white p-5 sm:p-6" data-testid="my-file-form">
      <label htmlFor="my-file-email" className="block text-[13px] font-semibold">{zh ? '申请时用的邮箱' : 'The email you applied with'}</label>
      <input
        id="my-file-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        className="sl-input mt-2 w-full"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label={zh ? '申请时用的邮箱' : 'The email you applied with'}
      />
      {err && <p className="mt-2 text-[12.5px] text-[#B91C1C]" role="alert">{err}</p>}
      <button type="submit" disabled={busy} className="sl-btn-primary mt-4">
        {busy ? (zh ? '发送中…' : 'Sending…') : (zh ? '发送确认邮件' : 'Send confirmation email')}
      </button>
      <p className="mt-3 text-[12px] leading-relaxed text-body-3">
        {zh ? '我们只会把链接发到这个邮箱，不会在这里告诉你它有没有申请过。' : 'We only send the link to this address; this page never says whether it has applied.'}
      </p>
    </form>
  )
}
