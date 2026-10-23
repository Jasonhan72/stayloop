'use client'
// The landlord's side of the MLS® hand-off (V0.8 第二项 · 第 3 步, 2026-10-22): one line per listing
// on the dashboard and in the owner box of the listing page. Pick a Stayloop-verified agent →
// POST /api/listings/mls-handoff {action:'request'} → the agent lists the unit in their own system
// and writes back the number + link, which show here. Withdraw / take-down are two-step in page
// (no window.confirm). Stayloop does not dispatch, charges nothing and takes no part in the trade.
import { useState } from 'react'
import Link from 'next/link'
import { AgentPicker, type AgentPick } from '@/components/AgentPicker'
import { StatusPill } from '@/components/workspace'
import { supabase } from '@/lib/supabase'
import { STATUS_LABEL, STATUS_TONE, type HandoffItem } from '@/lib/listings/syndication'

const ERR: Record<string, { zh: string; en: string }> = {
  already_live: { zh: '这套房源已有一条进行中的 MLS® 交接。', en: 'This listing already has an MLS® hand-off in progress.' },
  agent_not_verified: { zh: '这位经纪的 RECO 注册不在有效状态。', en: 'This agent’s RECO registration is not live.' },
  listing_not_eligible: { zh: '这套房源不能发起 MLS® 交接。', en: 'This listing cannot be handed off to MLS®.' },
  rate_limited: { zh: '请求太频繁，请稍后再试。', en: 'Too many requests; try again later.' },
  sign_in_required: { zh: '请先登录。', en: 'Please sign in.' },
  not_owner: { zh: '只有房源的房东能发起。', en: 'Only the listing’s landlord can ask.' },
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; thread_id?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { ok: false, error: 'sign_in_required' }
  const r = await fetch('/api/listings/mls-handoff', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as { error?: string; thread_id?: string }
  return { ok: r.ok, error: j.error, thread_id: j.thread_id }
}

export default function MlsHandoff({ zh, listing, item, onChanged, excludeAuthIds = [], compact = false }: {
  zh: boolean
  listing: { id: string; address: string; unit?: string | null }
  /** The listing's most recent MLS® row (any status) — the dashboard loads them in one call. */
  item: HandoffItem | null
  onChanged: () => void
  excludeAuthIds?: Array<string | null | undefined>
  compact?: boolean
}) {
  const [picking, setPicking] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<null | 'removed'>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const live = item && (item.status === 'requested' || item.status === 'posted') ? item : null
  const address = `${listing.address}${listing.unit ? ` #${listing.unit}` : ''}`
  const t = (k: string) => ERR[k] ? (zh ? ERR[k].zh : ERR[k].en) : zh ? '没成功，请稍后再试。' : 'That did not go through; try again.'

  const ask = async (a: AgentPick) => {
    setBusyId(a.auth_id); setErr(null)
    const r = await post({ action: 'request', listing_id: listing.id, agent_auth_id: a.auth_id })
    setBusyId(null)
    if (!r.ok) { setErr(t(r.error || '')); return }
    setPicking(false)
    setDone(zh ? `已发给 ${a.legal_name}（${a.brokerage_name}）。对话在「消息」里。` : `Sent to ${a.legal_name} (${a.brokerage_name}). The conversation is under Messages.`)
    onChanged()
  }
  const remove = async () => {
    if (!live) return
    setBusy(true); setErr(null)
    const r = await post({ action: 'removed', id: live.id })
    setBusy(false); setConfirming(null)
    if (!r.ok) { setErr(t(r.error || '')); return }
    onChanged()
  }

  const agentLine = item?.agent ? `${item.agent.name} · ${item.agent.brokerage}` : null
  return (
    <div data-testid="mls-handoff" className={compact ? 'text-[12px]' : 'text-[13px]'}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">MLS®</span>
        {item ? <StatusPill tone={STATUS_TONE[item.status]}>{zh ? STATUS_LABEL[item.status].zh : STATUS_LABEL[item.status].en}</StatusPill> : <span className="text-body-3">{zh ? '未挂牌' : 'Not listed'}</span>}
        {item?.status === 'posted' && item.external_id && <span className="font-semibold">{item.external_id}</span>}
        {item?.status === 'posted' && item.external_url && (
          <a href={item.external_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline-offset-2 hover:underline">{zh ? '查看挂牌 ↗' : 'View listing ↗'}</a>
        )}
        {agentLine && (item?.status === 'requested' || item?.status === 'posted') && (
          <span className="text-body-3">{item.agent?.slug ? <Link href={`/agents/${item.agent.slug}`} className="underline-offset-2 hover:underline">{agentLine}</Link> : agentLine}</span>
        )}
        {live?.thread_id && <Link href={`/messages?t=${live.thread_id}`} className="text-brand underline-offset-2 hover:underline">{zh ? '对话' : 'Conversation'}</Link>}
        {!live && (
          <button type="button" data-testid="mls-handoff-ask" onClick={() => { setPicking(true); setDone(null); setErr(null) }} className="rounded-full border border-line-strong px-2.5 py-[3px] font-semibold text-body hover:border-brand hover:text-brand">
            {item ? (zh ? '再找经纪挂牌' : 'Ask another agent') : (zh ? '让认证经纪帮我挂到 MLS®' : 'Have a verified agent list it on MLS®')}
          </button>
        )}
        {live && confirming !== 'removed' && (
          <button type="button" data-testid="mls-handoff-remove" onClick={() => setConfirming('removed')} className="text-body-3 underline-offset-2 hover:underline">
            {live.status === 'requested' ? (zh ? '撤回请求' : 'Withdraw') : (zh ? '已从 MLS® 撤下' : 'Taken down from MLS®')}
          </button>
        )}
      </div>
      {confirming === 'removed' && live && (
        <div data-testid="mls-handoff-confirm" className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px]">
          <span>{live.status === 'requested' ? (zh ? '撤回这次挂牌请求？经纪会在对话里看到一条说明。' : 'Withdraw this request? The agent sees a note in the conversation.') : (zh ? '记录这套房源已从 MLS® 撤下？房源页将不再显示 MLS® 挂牌号。' : 'Record that this unit is off MLS®? The listing page stops showing the number.')}</span>
          <button type="button" disabled={busy} onClick={remove} className="rounded-full bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-60">{busy ? '…' : zh ? '确认' : 'Confirm'}</button>
          <button type="button" onClick={() => setConfirming(null)} className="underline-offset-2 hover:underline">{zh ? '取消' : 'Cancel'}</button>
        </div>
      )}
      {done && <div className="mt-1 text-[12px] text-success">{done}</div>}
      {err && <div className="mt-1 text-[12px] text-danger">{err}</div>}
      {picking && (
        <AgentPicker
          zh={zh}
          listingAddress={address}
          onClose={() => setPicking(false)}
          excludeAuthIds={excludeAuthIds}
          pick={{
            eyebrow: zh ? '挂到 MLS®' : 'List on MLS®',
            title: zh ? '选一位 Stayloop 认证的经纪' : 'Pick a Stayloop-verified agent',
            intro: zh
              ? `经纪会在自己经纪公司的系统里把「${address}」挂到 MLS®，再把 MLS® 挂牌号和公开链接填回来；服务与报酬由你们双方约定。Stayloop 不派单、不参与交易、不收费，也不读取任何 MLS® 数据。`
              : `The agent lists “${address}” on MLS® through their own brokerage and records the MLS® number and public link here; you agree the service and fee between you. Stayloop does not dispatch, takes no part in the trade, charges nothing and reads no MLS® data.`,
            label: zh ? '请这位经纪挂牌' : 'Ask this agent',
            busyId,
            onPick: ask,
          }}
        />
      )}
    </div>
  )
}
