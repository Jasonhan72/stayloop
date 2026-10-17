'use client'

// /my-file/<token> step 2 — name (required), date of birth (optional, used only
// to match), delivery method. Posts to …/verify; the parent swaps in the
// returned RequestView.

import { useState } from 'react'
import type { DeliveryMode, VerifyInput } from './types'

export default function VerifyForm({ zh, emailMasked, busy, error, onSubmit }: {
  zh: boolean
  emailMasked: string
  busy: boolean
  error: string | null
  onSubmit: (input: VerifyInput) => void
}) {
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [delivery, setDelivery] = useState<DeliveryMode>('electronic')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [localErr, setLocalErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (n.length < 2) { setLocalErr(zh ? '请填写申请时用的姓名。' : 'Please enter the name you applied with.'); return }
    if (delivery === 'mail' && address.trim().length < 8) { setLocalErr(zh ? '邮寄方式需要一个完整的邮寄地址。' : 'Mail delivery needs a full postal address.'); return }
    if (delivery === 'phone' && phone.replace(/\D/g, '').length < 10) { setLocalErr(zh ? '电话方式需要一个可拨打的号码。' : 'Phone delivery needs a dialable number.'); return }
    setLocalErr(null)
    onSubmit({
      name: n,
      date_of_birth: dob || undefined,
      delivery,
      mail_address: delivery === 'mail' ? address.trim() : undefined,
      phone: delivery === 'phone' ? phone.trim() : undefined,
    })
  }

  const radio = (v: DeliveryMode, label: string, hint: string) => (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${delivery === v ? 'border-brand bg-[#F3F8FC]' : 'border-line-divider bg-white'}`}>
      <input type="radio" name="delivery" value={v} checked={delivery === v} onChange={() => setDelivery(v)} className="mt-1" />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{label}</span>
        <span className="block text-[12.5px] leading-snug text-body-3">{hint}</span>
      </span>
    </label>
  )

  return (
    <form onSubmit={submit} data-testid="my-file-verify" className="rounded-2xl border border-line-divider bg-white p-5 sm:p-6">
      <div className="text-[16px] font-bold">{zh ? '确认是你本人' : 'Confirm it is you'}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-body-3">
        {zh ? `邮箱已确认：${emailMasked}。再填姓名，我们按它与档案比对（《消费者报告法》s.12(6)）。` : `Email confirmed: ${emailMasked}. Now give your name so we can match it to the file (Consumer Reporting Act s.12(6)).`}
      </p>

      <label htmlFor="cf-name" className="mt-5 block text-[13px] font-semibold">{zh ? '姓名（申请时填的）' : 'Name (as on the application)'}</label>
      <input id="cf-name" className="sl-input mt-2 w-full" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />

      <label htmlFor="cf-dob" className="mt-4 block text-[13px] font-semibold">{zh ? '出生日期（可选）' : 'Date of birth (optional)'}</label>
      <input id="cf-dob" type="date" className="sl-input mt-2 w-full" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
      <p className="mt-1 text-[12px] text-body-3">{zh ? '只用于与档案比对，不会存进你的档案。' : 'Used only to match against the file; it is not added to your file.'}</p>

      <div className="mt-5 text-[13px] font-semibold">{zh ? '怎么拿到档案' : 'How you want the file'}</div>
      <div className="mt-2 grid gap-2">
        {radio('electronic', zh ? '电子方式（推荐）' : 'Electronic (recommended)', zh ? '确认后立即在这个页面看到，可保存 PDF。' : 'Shown on this page right after confirmation; save as PDF.')}
        {radio('mail', zh ? '邮寄' : 'By mail', zh ? '2 个工作日内寄出。' : 'Sent within 2 business days.')}
        {radio('phone', zh ? '电话' : 'By phone', zh ? '2 个工作日内来电说明。' : 'We call you within 2 business days.')}
      </div>
      {delivery === 'mail' && (
        <>
          <label htmlFor="cf-address" className="mt-4 block text-[13px] font-semibold">{zh ? '邮寄地址' : 'Postal address'}</label>
          <textarea id="cf-address" className="sl-input mt-2 w-full" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
        </>
      )}
      {delivery === 'phone' && (
        <>
          <label htmlFor="cf-phone" className="mt-4 block text-[13px] font-semibold">{zh ? '电话号码' : 'Phone number'}</label>
          <input id="cf-phone" type="tel" inputMode="tel" className="sl-input mt-2 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </>
      )}

      {(localErr || error) && <p className="mt-3 text-[12.5px] text-[#B91C1C]" role="alert">{localErr || error}</p>}
      <button type="submit" disabled={busy} className="sl-btn-primary mt-5">
        {busy ? (zh ? '比对中…' : 'Matching…') : (zh ? '确认并查看档案' : 'Confirm and view my file')}
      </button>
    </form>
  )
}
