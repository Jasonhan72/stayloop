'use client'
// 显示名 — the name other people see in conversations and relayed email
// (找得到人 2026-09-30). Stored in the account's metadata (display_name) and
// read by person_name() in the database, which drops anything that looks
// like an address, a long number, or "Stayloop". Without one, others see the
// role word (房东 / 租客).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { cleanDisplayName } from '@/lib/displayName'


export default function DisplayNameCard({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    const md = (auth.user?.user_metadata ?? {}) as Record<string, unknown>
    const v = [md.display_name, md.full_name, md.name].find((x) => typeof x === 'string' && x.trim()) as string | undefined
    setValue(v ?? ''); setSaved(v ?? '')
  }, [auth.user])
  if (!auth.user) return null
  async function save() {
    const v = cleanDisplayName(value)
    if (v === null) { setMsg(zh ? '显示名不能包含邮箱、长串数字或「Stayloop」。' : 'A display name cannot contain an email, a long number or “Stayloop”.'); return }
    setBusy(true); setMsg(null)
    const { error } = await getSupabaseBrowser().auth.updateUser({ data: { display_name: v || null } })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setSaved(v); setMsg(zh ? '已保存。之后发出的消息会显示这个名字。' : 'Saved. Messages you send from now on show this name.')
  }
  return (
    <div className="sl-card p-5" data-testid="display-name-card">
      <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '显示名 · 对方在消息里看到的名字' : 'DISPLAY NAME · WHAT OTHERS SEE IN MESSAGES'}</h4>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-body-2">{zh ? '没有填写时，对方会看到你账号里的名字；都没有时只看到你的角色（房东 / 租客）。经纪显示 RECO 注册名，服务商显示商号。你的邮箱和电话永远不会给对方。' : 'Without one, others see the name on your account, or only your role (landlord / tenant) if there is none. Agents are shown by their RECO registered name, providers by their trade name. Your email and phone are never shown to them.'}</p>
      <div className="mt-3 flex gap-2">
        <input className="sl-input min-w-0 flex-1" value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} placeholder={zh ? '例如：王 Sarah' : 'e.g. Sarah Wang'} aria-label={zh ? '显示名' : 'Display name'} />
        <button type="button" disabled={busy || value.trim() === (saved ?? '').trim()} onClick={() => void save()} className="sl-btn-primary !px-4 !py-2 text-[13px] disabled:opacity-50">{busy ? '…' : zh ? '保存' : 'Save'}</button>
      </div>
      {msg && <p className="mt-2 text-[12px] text-body-2">{msg}</p>}
      <p className="mt-3 text-[12.5px]"><Link href={`/messages?new=support:${auth.user.id}`} className="font-semibold text-brand" data-testid="settings-contact-stayloop">{zh ? '联系 Stayloop 客服 →' : 'Contact Stayloop support →'}</Link></p>
    </div>
  )
}
