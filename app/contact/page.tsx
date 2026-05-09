'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function ContactPage() {
  const [sent, setSent] = useState(false)
  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-[760px] px-5 py-16 sm:px-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">CONTACT</div>
          <h1 className="mt-3 text-[40px] font-extrabold leading-tight tracking-tight sm:text-[48px]">
            合作 / 投资 / 媒体询问
          </h1>
          <p className="mt-3 text-[15px] text-body-2">
            一般客服走 in-app 聊天 (登录后右上角铃铛旁的对话窗)。
            合作 / 投资 / 媒体请使用下面的表单 — 24h 内回复。
          </p>

          {!sent ? (
            <form onSubmit={(e) => { e.preventDefault(); setSent(true) }} className="sl-card mt-10 space-y-4 p-7">
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
              <button type="submit" className="sl-btn-primary w-full !py-[14px]">
                提交
              </button>
            </form>
          ) : (
            <div className="sl-card mt-10 p-10 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-[20px] text-brand">✓</span>
              <h2 className="mt-4 text-[20px] font-bold">谢谢，我们已收到</h2>
              <p className="mt-2 text-[13.5px] text-body-2">24h 内会有人回复你。</p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
