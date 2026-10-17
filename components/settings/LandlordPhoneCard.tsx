'use client'
// 联系电话 — the landlord's phone for Consumer Reporting Act disclosures (V0.8 · 2026-10-17).
// s.12(3): an applicant who requests their own screening file is told the name and phone of
// everyone who viewed it on a landlord's behalf. Stored on landlords.phone; the row is found
// under the dual-ID invariant (id or auth_id) and updated by auth_id.
import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'
import { pickLandlordRow } from '@/lib/billing/subscriptionState'

type Row = { id: string; auth_id: string | null; phone: string | null }

/** Keep digits, +, spaces, dashes, parentheses and an extension marker; cap the length. */
export function cleanPhone(raw: string): string | null {
  const v = raw.replace(/[^\d+()\-\s.xX#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!v) return ''
  const digits = v.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  return v
}

export default function LandlordPhoneCard({ userId, zh }: { userId: string; zh: boolean }) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [hasRow, setHasRow] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    const { data } = await getSupabaseBrowser().from('landlords').select('id, auth_id, phone').or(`id.eq.${userId},auth_id.eq.${userId}`)
    const row = pickLandlordRow((data ?? []) as Row[], userId)
    setHasRow(!!row)
    setValue(row?.phone ?? ''); setSaved(row?.phone ?? '')
  }, [userId])
  useEffect(() => { void load() }, [load])

  async function save() {
    const v = cleanPhone(value)
    if (v === null) { setMsg(zh ? '电话格式不对：7–15 位数字，可带国家码、区号与分机。' : 'Phone looks wrong: 7–15 digits, country / area code and extension allowed.'); return }
    setBusy(true); setMsg(null)
    const { error } = await getSupabaseBrowser().from('landlords').update({ phone: v || null }).eq('auth_id', userId)
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setSaved(v); setValue(v)
    setMsg(v ? (zh ? '已保存。' : 'Saved.') : (zh ? '已清空：披露里只列你的姓名与邮箱。' : 'Cleared: disclosures list only your name and email.'))
  }

  if (hasRow === false) return null
  return (
    <div className="sl-card p-5" data-testid="landlord-phone-card">
      <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '联系电话 · 《消费者报告法》披露' : 'CONTACT PHONE · CONSUMER REPORTING ACT DISCLOSURE'}</h4>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-body-2">{zh ? '《消费者报告法》披露会把查阅过申请人档案的人的姓名与电话列给申请人；留空则只列姓名与邮箱。这个电话不会出现在消息或房源页上。' : 'A Consumer Reporting Act disclosure lists, to the applicant, the name and phone of everyone who viewed their file; leave it blank and only your name and email are listed. It never appears in messages or on listings.'}</p>
      <div className="mt-3 flex gap-2">
        <input className="sl-input min-w-0 flex-1" type="tel" inputMode="tel" value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} placeholder={zh ? '例如：416-555-0100' : 'e.g. 416-555-0100'} aria-label={zh ? '联系电话' : 'Contact phone'} />
        <button type="button" disabled={busy || hasRow !== true || value.trim() === (saved ?? '').trim()} onClick={() => void save()} className="sl-btn-primary !px-4 !py-2 text-[13px] disabled:opacity-50">{busy ? '…' : zh ? '保存' : 'Save'}</button>
      </div>
      {msg && <p className="mt-2 text-[12px] text-body-2">{msg}</p>}
    </div>
  )
}
