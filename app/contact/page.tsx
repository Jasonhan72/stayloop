'use client'

import { useState, type FormEvent } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'

const CONTACT_EMAIL = 'privacy@stayloop.ai'

type SendState = 'idle' | 'sending' | 'sent' | 'error'
type ErrorKind = 'invalid' | 'rate_limited' | 'failed'

export default function ContactPage() {
  const [state, setState] = useState<SendState>('idle')
  const [errorKind, setErrorKind] = useState<ErrorKind>('failed')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState('trust_api')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot — real visitors never see it
  const { lang } = useT()
  const zh = lang === 'zh'

  // The value sent to the inbox is always the English label, whatever the UI language.
  const TOPICS: Array<{ key: string; zh: string; en: string }> = [
    { key: 'stayloop_api', zh: 'Stayloop API · 合作接入', en: 'Stayloop API · partner integration' },
    { key: 'investor', zh: '投资人', en: 'Investor' },
    { key: 'press', zh: '媒体 / PR', en: 'Press / PR' },
    { key: 'enterprise', zh: '大客户 (Property Mgmt 100+ 套)', en: 'Enterprise (property mgmt, 100+ units)' },
    { key: 'other', zh: '其他', en: 'Other' },
  ]

  const sending = state === 'sending'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (sending) return
    setState('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          company,
          email,
          topic: TOPICS.find((t) => t.key === topic)?.en ?? 'Other',
          message,
          website,
        }),
      })
      if (res.ok) {
        setState('sent')
        return
      }
      setErrorKind(res.status === 400 ? 'invalid' : res.status === 429 ? 'rate_limited' : 'failed')
      setState('error')
    } catch {
      setErrorKind('failed')
      setState('error')
    }
  }

  const errorText =
    errorKind === 'invalid'
      ? (zh ? '请检查邮箱格式，详情需 10–5000 字。' : 'Please check the email address; details must be 10–5000 characters.')
      : errorKind === 'rate_limited'
        ? (zh ? '提交过于频繁，请稍后再试。' : 'Too many submissions — please try again later.')
        : (zh ? '发送失败，你的消息没有送达。' : 'Sending failed — your message was not delivered.')

  return (
    <div style={{ background: '#FFFFFF', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: '#F3F8FC', borderBottom: '1px solid #E4EEF6' }}>
        <div className="mx-auto max-w-[820px] px-5 pb-10 pt-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? 'CONTACT · 合作 / 投资 / 媒体' : 'CONTACT · Partnerships / Investors / Press'}</div>
          <h1 className="mt-4 text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-[46px]">
            {zh ? '聊聊合作。' : 'Let’s talk.'}
          </h1>
          <p className="mt-4 max-w-[600px] text-[15.5px] leading-relaxed text-body-2">
            {zh ? (
              <>合作 / 投资 / 媒体及一般问题请用下面的表单，或直接发邮件到 <a className="text-brand underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> —— 我们尽量在 24 小时内回复。</>
            ) : (
              <>For partnerships, investors, press or general questions, use the form below or email <a className="text-brand underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — we aim to reply within 24 hours.</>
            )}
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[820px] px-5 pb-20 pt-8 sm:px-7 lg:px-12">
          {state !== 'sent' ? (
            <form onSubmit={onSubmit} className="sl-card space-y-4 p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="sl-eyebrow">{zh ? '姓名' : 'Name'}</span>
                  <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="sl-input mt-1" placeholder="Sarah Chen" />
                </label>
                <label className="block">
                  <span className="sl-eyebrow">{zh ? '公司' : 'Company'}</span>
                  <input maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} className="sl-input mt-1" placeholder={zh ? '公司名称（选填）' : 'Company (optional)'} />
                </label>
              </div>
              <label className="block">
                <span className="sl-eyebrow">{zh ? '邮箱' : 'Email'}</span>
                <input required type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className="sl-input mt-1" placeholder="you@company.com" />
              </label>
              <label className="block">
                <span className="sl-eyebrow">{zh ? '询问类型' : 'Inquiry type'}</span>
                <select value={topic} onChange={(e) => setTopic(e.target.value)} className="sl-input mt-1">
                  {TOPICS.map((t) => (
                    <option key={t.key} value={t.key}>{zh ? t.zh : t.en}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sl-eyebrow">{zh ? '详情' : 'Details'}</span>
                <textarea required minLength={10} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} className="sl-input mt-1 h-32 py-2" placeholder="…" />
              </label>
              {/* Honeypot: off-screen, skipped by keyboard and screen readers. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label>
                  Website
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>
              {state === 'error' && (
                <div role="alert" className="rounded-xl px-4 py-3 text-[13px] font-semibold leading-relaxed" style={{ background: '#FEF2F2', border: '1px solid rgba(185,28,28,0.3)', color: '#991B1B' }}>
                  {errorText}{' '}
                  {zh ? '也可以直接发邮件到 ' : 'You can also email us directly at '}
                  <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                  {zh ? '。' : '.'}
                </div>
              )}
              <button type="submit" disabled={sending} className="sl-btn-primary w-full !py-[14px] disabled:cursor-not-allowed disabled:opacity-60">
                {sending ? (zh ? '发送中…' : 'Sending…') : (zh ? '提交' : 'Submit')}
              </button>
            </form>
          ) : (
            <div className="sl-card p-10 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-[20px] text-brand">✓</span>
              <h2 className="mt-4 text-[20px] font-bold">{zh ? '谢谢,我们已收到' : 'Thanks — we’ve got it'}</h2>
              <p className="mt-2 text-[13.5px] text-body-2">{zh ? '我们会尽量在 24 小时内通过邮件回复你。' : 'We aim to reply by email within 24 hours.'}</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
