'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function ContactPage() {
  const [sent, setSent] = useState(false)
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4EEE3 100%)' }}>
        <div className="mx-auto max-w-[820px] px-5 pb-10 pt-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">CONTACT · 合作 / 投资 / 媒体</div>
          <h1 className="mt-4 text-[36px] font-extrabold leading-[1.1] tracking-tight sm:text-[46px]">
            聊聊合作。
          </h1>
          <p className="mt-4 max-w-[600px] text-[15.5px] leading-relaxed text-body-2">
            一般客服走 in-app 聊天(登录后右上角对话窗)。合作 / 投资 / 媒体请用下面的表单 —— 24h 内回复。
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[820px] px-5 pb-20 pt-8 sm:px-7 lg:px-12">
          {!sent ? (
            <form onSubmit={(e) => { e.preventDefault(); setSent(true) }} className="sl-card space-y-4 p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="sl-eyebrow">姓名</span>
                  <input required className="sl-input mt-1" placeholder="Sarah Chen" />
                </label>
                <label className="block">
                  <span className="sl-eyebrow">公司</span>
                  <input className="sl-input mt-1" placeholder="RBC Capital Markets" />
                </label>
              </div>
              <label className="block">
                <span className="sl-eyebrow">邮箱</span>
                <input required type="email" className="sl-input mt-1" placeholder="you@company.com" />
              </label>
              <label className="block">
                <span className="sl-eyebrow">询问类型</span>
                <select className="sl-input mt-1">
                  <option>Trust API · 商务合作</option>
                  <option>投资人</option>
                  <option>媒体 / PR</option>
                  <option>大客户 (Property Mgmt 100+ 套)</option>
                  <option>其他</option>
                </select>
              </label>
              <label className="block">
                <span className="sl-eyebrow">详情</span>
                <textarea required className="sl-input mt-1 h-32 py-2" placeholder="…" />
              </label>
              <button type="submit" className="sl-btn-primary w-full !py-[14px]">提交</button>
            </form>
          ) : (
            <div className="sl-card p-10 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-[20px] text-brand">✓</span>
              <h2 className="mt-4 text-[20px] font-bold">谢谢,我们已收到</h2>
              <p className="mt-2 text-[13.5px] text-body-2">24h 内会有人回复你。</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
