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
  const [done, setDone] = useState<null | { delivered: boolean; merged?: boolean; reason?: string }>(null)
  const [error, setError] = useState<string | null>(null)
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
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; delivered?: boolean; merged?: boolean; reason?: string }
      if (!res.ok || !j.ok) {
        const code = j.error || ''
        setError(
          code === 'own_listing'
            ? (zh ? '这是你自己的房源，不能向自己提交看房意向。' : 'This is your own listing.')
            : code === 'rate_limited'
              ? (zh ? '一小时内提交次数过多，请稍后再试。' : 'Too many requests this hour — try again later.')
              : code === 'sign_in_required'
                ? (zh ? '请先登录。' : 'Please sign in first.')
                : (zh ? `提交失败：${code || res.status}` : `Failed: ${code || res.status}`),
        )
        setBusy(false)
        return
      }
      setDone({ delivered: !!j.delivered, merged: j.merged, reason: j.reason })
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
              ? '房东需要一个能回复你的邮箱。登录后（魔法链接，不用密码）再提交，房东的回复会发到你的邮箱。'
              : 'The landlord needs an email to reply to. Sign in (magic link, no password) and the reply lands in your inbox.'}
            <div className="mt-3">
              <Link href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/listings')}`} className="sl-btn-primary !px-5 !py-2 !text-[13.5px]">{zh ? '登录后继续 →' : 'Sign in to continue →'}</Link>
            </div>
          </div>
        ) : done ? (
          <div className="mt-5 rounded-xl border border-success/30 bg-success/5 p-4 text-[13.5px] leading-relaxed text-body-2">
            {done.delivered
              ? (zh
                  ? <>已送到房东的助手待办{done.merged ? '（并入了你对这套房源的上一条请求）' : ''}。房东批准后你会收到一封带联系方式的邮件；房东没有回应时不会有任何邮件。</>
                  : <>Delivered to the landlord&apos;s agent inbox{done.merged ? ' (merged with your earlier request for this listing)' : ''}. You get an email with the landlord&apos;s contact once they approve; no email otherwise.</>)
              : (zh
                  ? '已记录你的请求。这套房源没有 Stayloop 房东账号（多为 Realtor.ca 导入），请直接联系页面上的经纪公司。'
                  : 'Recorded. This listing has no Stayloop landlord account (usually a Realtor.ca import) — please contact the brokerage shown on the page.')}
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
                ? '房东只会看到你的姓名、登录邮箱和这里写的内容。按 OHRC 租房政策，看房与提问不需要、也不应提供家庭状况、国籍、收入来源等受保护信息。'
                : 'The landlord sees only your name, sign-in email and what you write here. Under OHRC housing policy you need not — and should not — share protected information such as family status, nationality or source of income.'}
            </p>
            {error && <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="sl-btn-secondary !px-5 !py-2 !text-[13.5px]">{zh ? '取消' : 'Cancel'}</button>
              <button type="button" onClick={submit} disabled={busy} className="sl-btn-primary !px-5 !py-2 !text-[13.5px] disabled:opacity-60">
                {busy ? (zh ? '提交中…' : 'Sending…') : isShowing ? (zh ? '发送看房请求' : 'Send request') : (zh ? '发送提问' : 'Send question')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
