'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'

export default function ContactPage() {
  const [sent, setSent] = useState(false)
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#F4F6F9 0%,#E4EEE3 100%)' }}>
        <div className="mx-auto max-w-[820px] px-5 pb-10 pt-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? 'CONTACT · 合作 / 投资 / 媒体' : 'CONTACT · Partnerships / Investors / Press'}</div>
          <h1 className="mt-4 text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-[46px]">
            {zh ? '聊聊合作。' : 'Let’s talk.'}
          </h1>
          <p className="mt-4 max-w-[600px] text-[15.5px] leading-relaxed text-body-2">
            {zh
              ? '一般客服走 in-app 聊天(登录后右上角对话窗)。合作 / 投资 / 媒体请用下面的表单 —— 24h 内回复。'
              : 'For general support, use the in-app chat (the conversation window at the top right after signing in). For partnerships, investors or press, use the form below — we reply within 24h.'}
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[820px] px-5 pb-20 pt-8 sm:px-7 lg:px-12">
          {!sent ? (
            <form onSubmit={(e) => { e.preventDefault(); setSent(true) }} className="sl-card space-y-4 p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="sl-eyebrow">{zh ? '姓名' : 'Name'}</span>
                  <input required className="sl-input mt-1" placeholder="Sarah Chen" />
                </label>
                <label className="block">
                  <span className="sl-eyebrow">{zh ? '公司' : 'Company'}</span>
                  <input className="sl-input mt-1" placeholder="RBC Capital Markets" />
                </label>
              </div>
              <label className="block">
                <span className="sl-eyebrow">{zh ? '邮箱' : 'Email'}</span>
                <input required type="email" className="sl-input mt-1" placeholder="you@company.com" />
              </label>
              <label className="block">
                <span className="sl-eyebrow">{zh ? '询问类型' : 'Inquiry type'}</span>
                <select className="sl-input mt-1">
                  <option>{zh ? 'Trust API · 商务合作' : 'Trust API · business partnership'}</option>
                  <option>{zh ? '投资人' : 'Investor'}</option>
                  <option>{zh ? '媒体 / PR' : 'Press / PR'}</option>
                  <option>{zh ? '大客户 (Property Mgmt 100+ 套)' : 'Enterprise (property mgmt, 100+ units)'}</option>
                  <option>{zh ? '其他' : 'Other'}</option>
                </select>
              </label>
              <label className="block">
                <span className="sl-eyebrow">{zh ? '详情' : 'Details'}</span>
                <textarea required className="sl-input mt-1 h-32 py-2" placeholder="…" />
              </label>
              <button type="submit" className="sl-btn-primary w-full !py-[14px]">{zh ? '提交' : 'Submit'}</button>
            </form>
          ) : (
            <div className="sl-card p-10 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-[20px] text-brand">✓</span>
              <h2 className="mt-4 text-[20px] font-bold">{zh ? '谢谢,我们已收到' : 'Thanks — we’ve got it'}</h2>
              <p className="mt-2 text-[13.5px] text-body-2">{zh ? '24h 内会有人回复你。' : 'Someone will get back to you within 24h.'}</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
