'use client'
// The agent's side of the MLS® hand-off (V0.8 第二项 · 第 3 步, 2026-10-22), on /agent/clients.
// A landlord asked this agent to list a unit; the agent does that in their own brokerage system
// and writes back ONLY the MLS® number and the public link (nothing is read from MLS). Decline
// and take-down are two-step in page. Shown only when the agent has rows.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import MessageButton from '@/components/messages/MessageButton'
import { SectionCard, StatusPill } from '@/components/workspace'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { HANDOFF_NOTE_MAX, STATUS_LABEL, STATUS_TONE, isMlsNumber, isPublicListingUrl, type HandoffItem } from '@/lib/listings/syndication'

async function token(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export default function MlsHandoffBoard({ zh }: { zh: boolean }) {
  const [items, setItems] = useState<HandoffItem[] | null>(null)
  // Reload when the session resolves (the page can mount before supabase-js has read the URL hash / storage).
  const auth = useAuth()
  const load = useCallback(async () => {
    const tk = await token()
    if (!tk) { setItems([]); return }
    const r = await fetch('/api/listings/mls-handoff', { headers: { Authorization: `Bearer ${tk}` } })
    const j = (await r.json().catch(() => ({}))) as { items?: HandoffItem[] }
    setItems((j.items ?? []).filter((i) => i.mine === 'agent'))
  }, [])
  useEffect(() => { if (!auth.loading) load() }, [load, auth.loading, auth.user])
  const open = (items ?? []).filter((i) => i.status === 'requested' || i.status === 'posted')
  if (!items || open.length === 0) return null
  return (
    <div data-testid="mls-handoff-board"><SectionCard className="mb-4" title={zh ? 'MLS® 挂牌交接' : 'MLS® listing hand-offs'}>
      <p className="mb-3 text-[12.5px] leading-relaxed text-body-2">
        {zh
          ? '房东请你把房源挂到 MLS®。你在自己经纪公司的系统里挂牌后，把 MLS® 挂牌号和公开链接填回来即可；Stayloop 不读取 MLS® 数据，服务与报酬由你和房东约定。'
          : 'Landlords asking you to list their unit on MLS®. List it through your own brokerage, then record the MLS® number and public link here; Stayloop reads no MLS® data and you agree the service and fee with the landlord.'}
      </p>
      <div className="space-y-3">
        {open.map((i) => <Row key={i.id} zh={zh} item={i} onChanged={load} />)}
      </div>
    </SectionCard></div>
  )
}

function Row({ zh, item, onChanged }: { zh: boolean; item: HandoffItem; onChanged: () => void }) {
  const [num, setNum] = useState(item.external_id ?? '')
  const [url, setUrl] = useState(item.external_url ?? '')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState<null | 'declined' | 'removed'>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cityNamed = !!item.listing?.city && item.listing.address.toLowerCase().includes(item.listing.city.toLowerCase())
  const addr = item.listing ? `${item.listing.address}${item.listing.unit ? ` #${item.listing.unit}` : ''}${item.listing.city && !cityNamed ? `${zh ? '，' : ', '}${item.listing.city}` : ''}` : '—'
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null)
    const tk = await token()
    const r = await fetch('/api/listings/mls-handoff', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk ?? ''}` }, body: JSON.stringify({ id: item.id, ...body }) })
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    setBusy(false); setConfirm(null)
    if (!r.ok) {
      setErr(j.error === 'mls_number_invalid' ? (zh ? 'MLS® 挂牌号只能是 3–40 位字母、数字或连字符。' : 'An MLS® number is 3–40 letters, digits or dashes.')
        : j.error === 'url_invalid' ? (zh ? '链接要以 https:// 开头。' : 'The link must start with https://.')
        : (zh ? '没成功，请稍后再试。' : 'That did not go through; try again.'))
      return
    }
    onChanged()
  }
  const numOk = isMlsNumber(num.trim())
  const urlOk = !url.trim() || isPublicListingUrl(url.trim())
  return (
    <div data-testid="mls-handoff-row" className="rounded-xl border border-line-divider p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[item.status]}>{zh ? STATUS_LABEL[item.status].zh : STATUS_LABEL[item.status].en}</StatusPill>
        {item.listing?.slug ? <Link href={`/listings/${item.listing.slug}`} className="text-[14px] font-bold hover:underline">{addr}</Link> : <span className="text-[14px] font-bold">{addr}</span>}
        <span className="text-[12px] text-body-3">{zh ? '请求于 ' : 'Asked '}{new Date(item.created_at).toLocaleDateString(zh ? 'zh-CN' : 'en-CA')}</span>
        {item.client_id && <MessageButton zh={zh} target={{ kind: 'agent_client', ref: item.client_id, threadId: item.thread_id }} label={zh ? '和房东对话' : 'Message the landlord'} />}
      </div>
      {item.note && <div className="mt-1.5 text-[12.5px] text-body-2">{zh ? '房东留言：' : 'Landlord’s note: '}{item.note}</div>}
      {item.status === 'requested' && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder={zh ? 'MLS® 挂牌号' : 'MLS® number'} data-testid="mls-number" className="sl-field w-full text-[13px]" style={{ width: '100%' }} maxLength={40} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={zh ? '公开链接（可选，https://…）' : 'Public link (optional, https://…)'} data-testid="mls-url" className="sl-field w-full text-[13px]" style={{ width: '100%' }} maxLength={500} />
          <button type="button" disabled={busy || !numOk || !urlOk} onClick={() => act({ action: 'posted', external_id: num.trim(), external_url: url.trim() })} className="sl-btn-primary !px-4 !py-2 text-[13px] disabled:opacity-50">{busy ? '…' : zh ? '已挂牌，填回' : 'Listed — record it'}</button>
        </div>
      )}
      {item.status === 'posted' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-semibold">MLS® {item.external_id}</span>
          {item.external_url && <a href={item.external_url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">{zh ? '查看挂牌 ↗' : 'View ↗'}</a>}
          {item.posted_at && <span className="text-body-3">{zh ? '填回于 ' : 'Recorded '}{new Date(item.posted_at).toLocaleDateString(zh ? 'zh-CN' : 'en-CA')}</span>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
        {item.status === 'requested' && confirm !== 'declined' && <button type="button" data-testid="mls-decline" onClick={() => setConfirm('declined')} className="text-body-3 underline-offset-2 hover:underline">{zh ? '无法承接' : 'Decline'}</button>}
        {item.status === 'posted' && confirm !== 'removed' && <button type="button" data-testid="mls-remove" onClick={() => setConfirm('removed')} className="text-body-3 underline-offset-2 hover:underline">{zh ? '已从 MLS® 撤下' : 'Taken down from MLS®'}</button>}
      </div>
      {confirm === 'declined' && (
        <div data-testid="mls-decline-confirm" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px]">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, HANDOFF_NOTE_MAX))} placeholder={zh ? '给房东的一句说明（可选）' : 'A line for the landlord (optional)'} className="sl-field min-w-[200px] flex-1 text-[12.5px]" style={{ width: 'auto' }} />
          <button type="button" disabled={busy} onClick={() => act({ action: 'declined', note })} className="rounded-full bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-60">{busy ? '…' : zh ? '确认不承接' : 'Confirm decline'}</button>
          <button type="button" onClick={() => setConfirm(null)} className="underline-offset-2 hover:underline">{zh ? '取消' : 'Cancel'}</button>
        </div>
      )}
      {confirm === 'removed' && (
        <div data-testid="mls-remove-confirm" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px]">
          <span>{zh ? '记录这套房源已从 MLS® 撤下？房源页将不再显示编号。' : 'Record that this unit is off MLS®? The listing page stops showing the number.'}</span>
          <button type="button" disabled={busy} onClick={() => act({ action: 'removed' })} className="rounded-full bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-60">{busy ? '…' : zh ? '确认' : 'Confirm'}</button>
          <button type="button" onClick={() => setConfirm(null)} className="underline-offset-2 hover:underline">{zh ? '取消' : 'Cancel'}</button>
        </div>
      )}
      {err && <div className="mt-1.5 text-[12px] text-danger">{err}</div>}
    </div>
  )
}
