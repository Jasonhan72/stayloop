'use client'

// Listing page → "预约看房" / "向房东提问" (2026-09-22, EliseAI benchmark
// items G + H). One small form, one POST to /api/showing-intent; the
// landlord's agent gets a single card per (tenant, listing) and answers
// through Stayloop. Anonymous visitors are sent to sign in first — the
// landlord needs a real email to reply to.
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export type ShowingKind = 'showing' | 'question'

/** /api/showing-intent refusals in words — never the route's raw code (sweep 2026-10-01). */
export function showingErrorText(code: string | null | undefined, status: number, zh: boolean): string {
  switch (code || '') {
    case 'listing_inactive': return zh ? '这套房源已下架，请求没有发出。' : 'This listing is off the market — your request was not sent.'
    case 'own_listing': return zh ? '这是你自己的房源，不能向自己提交看房意向。' : 'This is your own listing.'
    case 'rate_limited': return zh ? '一小时内提交次数过多，请稍后再试。' : 'Too many requests this hour — try again later.'
    case 'sign_in_required': return zh ? '请先登录。' : 'Please sign in first.'
    case 'message required': return zh ? '请写下你的问题。' : 'Please write your question.'
    case 'listing_id required': return zh ? '找不到这套房源，请求没有发出。请刷新页面后再试。' : 'This listing could not be found — your request was not sent. Refresh the page and try again.'
    case 'tenant profile unavailable': return zh ? '暂时读不到你的租客资料，请求没有发出。请稍后再试。' : 'Your tenant profile could not be loaded right now — your request was not sent. Try again shortly.'
    default: return zh ? `提交没有成功，请求没有发出。请稍后再试${status ? `（HTTP ${status}）` : ''}。` : `The request did not go through and was not sent. Try again shortly${status ? ` (HTTP ${status})` : ''}.`
  }
}

/** Recorded but not delivered: say which of the three it was (the route's `reason`). */
export function showingUndeliveredText(reason: string | null | undefined, zh: boolean): string {
  if (reason === 'action_insert_failed') {
    return zh
      ? '你的请求已经记录，但这次没能提醒房东（服务器出错），房东可能还不知道。请稍后再发一次。'
      : 'Your request was recorded, but the landlord was not alerted this time (server error) and may not know yet. Please send it again later.'
  }
  if (reason === 'listing_not_found') {
    return zh ? '已记录你的请求，但找不到这套房源，所以没有送到任何人。请刷新页面查看房源是否还在。' : 'Your request was recorded, but this listing could not be found, so it reached no one. Refresh to check the listing is still there.'
  }
  return zh
    ? '已记录你的请求。这套房源没有 Stayloop 房东账号（多为 Realtor.ca 导入），请直接联系页面上的经纪公司。'
    : 'Recorded. This listing has no Stayloop landlord account (usually a Realtor.ca import) — please contact the brokerage shown on the page.'
}

export function ShowingRequestModal({
  zh,
  kind,
  listingId,
  listingAddress,
  signedIn,
  onClose,
}: {
  zh: boolean
  kind: ShowingKind
  listingId: string
  listingAddress: string
  signedIn: boolean
  onClose: () => void
}) {
  const [moveIn, setMoveIn] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | { delivered: boolean; merged?: boolean; reason?: string; threadId?: string | null }>(null)
  const [error, setError] = useState<string | null>(null)
  // The listing went off the market: sending again cannot work.
  const [offMarket, setOffMarket] = useState(false)
  const isShowing = kind === 'showing'
  const title = isShowing ? (zh ? '预约看房' : 'Request a viewing') : (zh ? '向房东提问' : 'Ask the landlord')

  async function submit() {
    setError(null)
    if (!isShowing && !message.trim()) {
      setError(zh ? '请写下你的问题。' : 'Please write your question.')
      return
    }
    setBusy(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) {
        setError(zh ? '请先登录。' : 'Please sign in first.')
        setBusy(false)
        return
      }
      const res = await fetch('/api/showing-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: listingId, kind, move_in_date: moveIn || null, message: message.trim() }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; delivered?: boolean; merged?: boolean; reason?: string; thread_id?: string | null }
      if (!res.ok || !j.ok) {
        setError(showingErrorText(j.error, res.status, zh))
        if (j.error === 'listing_inactive') setOffMarket(true)
        setBusy(false)
        return
      }
      setDone({ delivered: !!j.delivered, merged: j.merged, reason: j.reason, threadId: j.thread_id ?? null })
    } catch {
      setError(zh ? '网络错误，请重试。' : 'Network error — please retry.')
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92dvh] w-full max-w-[460px] overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{isShowing ? 'SHOWING REQUEST' : 'ASK THE LANDLORD'}</div>
            <h3 className="mt-1 text-[19px] font-bold tracking-tight">{title}</h3>
            <p className="mt-1 truncate text-[12.5px] text-body-3">{listingAddress}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[18px] text-body-3 hover:bg-surface-chip">×</button>
        </div>

        {!signedIn ? (
          <div className="mt-5 rounded-xl border border-line-divider bg-surface-chip p-4 text-[13.5px] leading-relaxed text-body-2">
            {zh
              ? '登录后再提交（Google 或邮箱 + 密码）：房东在「消息」里回复你，你会收到提醒；双方都看不到对方的私人邮箱。'
              : 'Sign in first (Google or email + password): the landlord replies under Messages and you get a reminder; neither side sees the other’s personal email.'}
            <div className="mt-3">
              <Link href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/listings')}`} className="sl-btn-primary !px-5 !py-2 !text-[13.5px]">{zh ? '登录后继续 →' : 'Sign in to continue →'}</Link>
            </div>
          </div>
        ) : done ? (
          <div className="mt-5 rounded-xl border border-success/30 bg-success/5 p-4 text-[13.5px] leading-relaxed text-body-2">
            {done.delivered
              ? (zh
                  ? <>已发给房东{done.merged ? '（并入了你和这套房源的同一段对话）' : ''}。房东会在「消息」里的这段对话回复你，你也会收到提醒；双方都看不到对方的私人邮箱。{done.threadId && <> <Link href={`/messages?t=${done.threadId}`} className="font-semibold text-brand">打开对话 →</Link></>}</>
                  : <>Sent to the landlord{done.merged ? ' (added to your existing conversation about this listing)' : ''}. They reply in this conversation under Messages, and you get a reminder; neither side sees the other&apos;s personal email.{done.threadId && <> <Link href={`/messages?t=${done.threadId}`} className="font-semibold text-brand">Open conversation →</Link></>}</>)
              : showingUndeliveredText(done.reason, zh)}
            <div className="mt-3 text-right">
              <button type="button" onClick={onClose} className="sl-btn-secondary !px-5 !py-2 !text-[13.5px]">{zh ? '好' : 'OK'}</button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {isShowing && (
              <label className="block">
                <span className="text-[12.5px] font-semibold text-body-2">{zh ? '期望入住日期（可选）' : 'Preferred move-in date (optional)'}</span>
                <input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} className="sl-input mt-1 w-full" />
              </label>
            )}
            <label className="block">
              <span className="text-[12.5px] font-semibold text-body-2">
                {isShowing ? (zh ? '方便的时间或补充说明（可选）' : 'Times that work, or anything else (optional)') : (zh ? '你的问题' : 'Your question')}
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                rows={4}
                className="sl-input mt-1 w-full resize-y"
                placeholder={isShowing
                  ? (zh ? '例如：周末下午都可以；我们两人一只猫。' : 'e.g. weekend afternoons; two adults and a cat.')
                  : (zh ? '例如：水电网包含在租金里吗？车位另收费吗？' : 'e.g. are utilities included? Is parking extra?')}
              />
            </label>
            <p className="text-[11.5px] leading-relaxed text-body-3">
              {zh
                ? '房东只会看到你的姓名和这里写的内容，看不到你的邮箱。按 OHRC 租房政策，看房与提问不需要、也不应提供家庭状况、国籍、收入来源等受保护信息。'
                : 'The landlord sees only your name and what you write here — not your email. Under OHRC housing policy you need not — and should not — share protected information such as family status, nationality or source of income.'}
            </p>
            {error && <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="sl-btn-secondary !px-5 !py-2 !text-[13.5px]">{zh ? '取消' : 'Cancel'}</button>
              <button type="button" onClick={submit} disabled={busy || offMarket} className="sl-btn-primary !px-5 !py-2 !text-[13.5px] disabled:opacity-60">
                {busy ? (zh ? '提交中…' : 'Sending…') : isShowing ? (zh ? '发送看房请求' : 'Send request') : (zh ? '发送提问' : 'Send question')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
