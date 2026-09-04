'use client'

// 订阅与账单 — the in-app home for subscription management.
// Blueprint: design/subscription-card-v2.html (2026-09-03, four states).
//
// Design decision: the app shows STATE and provides DOORS; the operations
// themselves (card update, invoices, cancel) live in the Stripe Billing
// Portal, deep-linked per flow so the landlord lands on the right screen.
// Stripe owns the cancel/proration state machine and the PCI surface —
// rebuilding those flows in-app would be duplicate risk for zero benefit.
// The single in-app mutation is "resume" (un-cancel), which the portal has
// no deep link for and which touches no payment data.
//
// Landlord-only: it is the only role with a plan store (landlords.plan,
// written by the Stripe webhook). State resolution lives in
// lib/billing/subscriptionState.ts (tested) — never re-derive it here.
import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'
import {
  BILLING_SELECT,
  formatCard,
  pickLandlordRow,
  resolveSubscriptionState,
  type LandlordBillingRow,
} from '@/lib/billing/subscriptionState'

type Busy = 'checkout' | 'portal' | 'card' | 'invoices' | 'cancel' | 'resume' | null

const GREEN = '#047857'
const GREEN_DEEP = '#065F46'

export default function SubscriptionCard({ userId, zh }: { userId: string; zh: boolean }) {
  const [row, setRow] = useState<LandlordBillingRow | null | 'loading'>('loading')
  const [busy, setBusy] = useState<Busy>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data } = await supabase
      .from('landlords')
      .select(BILLING_SELECT)
      // Dual-ID invariant (CLAUDE.md): legacy rows key by profileId; fetch
      // every match and let pickLandlordRow prefer the auth_id row.
      .or(`id.eq.${userId},auth_id.eq.${userId}`)
    return pickLandlordRow((data ?? []) as unknown as LandlordBillingRow[], userId)
  }, [userId])

  useEffect(() => {
    let cancelled = false
    load().then((r) => { if (!cancelled) setRow(r) })
    return () => { cancelled = true }
  }, [load])

  async function authedPost(path: string, body?: Record<string, unknown>) {
    const supabase = getSupabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error(zh ? '请先登录' : 'not signed in')
    const res = await fetch(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `${path} failed`)
    return data as { url?: string; ok?: boolean }
  }

  async function go(kind: Exclude<Busy, null>) {
    setBusy(kind)
    setErr(null)
    try {
      if (kind === 'checkout') {
        const { url } = await authedPost('/api/stripe/checkout')
        if (!url) throw new Error('checkout failed')
        window.location.href = url
        return
      }
      if (kind === 'resume') {
        await authedPost('/api/stripe/resume')
        setRow(await load())
        setBusy(null)
        return
      }
      const flow =
        kind === 'card' ? 'payment_method_update'
        : kind === 'cancel' ? 'subscription_cancel'
        : undefined
      const { url } = await authedPost('/api/stripe/portal', { return: 'settings', ...(flow ? { flow } : {}) })
      if (!url) throw new Error('portal failed')
      window.location.href = url
    } catch (e: any) {
      setErr(String(e?.message || 'unknown'))
      setBusy(null)
    }
  }

  if (row === 'loading') {
    return <div className="h-[140px] animate-pulse rounded-2xl border border-line-divider bg-surface-muted" />
  }

  const state = resolveSubscriptionState(row)
  const plan = row?.plan ?? 'free'
  const planName = plan === 'team' ? 'Team' : plan === 'pro' || state === 'past_due' ? 'Pro' : 'Free'
  const periodEnd = row?.plan_current_period_end
    ? new Date(row.plan_current_period_end).toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const card = formatCard(row)
  const trialing = row?.plan_status === 'trialing'

  const pill = (() => {
    switch (state) {
      case 'free': return { text: zh ? '当前计划' : 'Current plan', bg: '#F6F3EA', fg: '#71717A', dot: null, border: true }
      case 'active': return { text: trialing ? (zh ? '试用中' : 'Trial') : (zh ? '生效中' : 'Active'), bg: '#E4EEE3', fg: GREEN_DEEP, dot: GREEN, border: false }
      case 'comped': return { text: zh ? '生效中' : 'Active', bg: '#E4EEE3', fg: GREEN_DEEP, dot: GREEN, border: false }
      case 'canceling': return { text: zh ? '将于期末取消' : 'Cancels at period end', bg: '#FEF3E2', fg: '#B45309', dot: '#D97706', border: false }
      case 'past_due': return { text: zh ? '扣款失败' : 'Payment failed', bg: '#FEF2F2', fg: '#B91C1C', dot: '#DC2626', border: false }
    }
  })()

  const meta = (() => {
    switch (state) {
      case 'free':
        return zh
          ? <>升级到 <b className="font-semibold text-body-2">Pro · $29/月（CAD）</b>，随时可取消</>
          : <>Upgrade to <b className="font-semibold text-body-2">Pro · $29/mo (CAD)</b>, cancel any time</>
      case 'active':
        return zh
          ? <>{periodEnd ? <>下次续费：<b className="font-semibold text-body-2">{periodEnd}</b></> : '按月自动续费'}{card ? <> · {card}</> : null}</>
          : <>{periodEnd ? <>Renews <b className="font-semibold text-body-2">{periodEnd}</b></> : 'Renews monthly'}{card ? <> · {card}</> : null}</>
      case 'canceling':
        return zh
          ? <>Pro 功能保留至 <b className="font-semibold text-body-2">{periodEnd ?? '本期结束'}</b>，之后自动降回 Free，不再扣款</>
          : <>Pro stays on until <b className="font-semibold text-body-2">{periodEnd ?? 'the end of this period'}</b>, then drops to Free — no further charges</>
      case 'past_due':
        return zh
          ? 'Stripe 将自动重试数次；持续失败订阅将被取消'
          : 'Stripe will retry a few times; the subscription is cancelled if charges keep failing'
      case 'comped':
        return zh
          ? '由 Stayloop 直接开通，没有需要管理的 Stripe 订阅'
          : 'Granted directly by Stayloop — there is no Stripe subscription to manage'
    }
  })()

  const busyLabel = (k: Busy, idle: string) =>
    busy === k ? (zh ? '跳转中…' : 'Redirecting…') : idle

  return (
    <div className="overflow-hidden rounded-2xl border border-line-divider bg-white shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-[24px] font-extrabold tracking-tight">{planName}</span>
            {state !== 'free' && (
              <span className="text-[14px] font-semibold text-body-3">{plan === 'team' ? '' : '$29/mo'}</span>
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-bold"
              style={{ background: pill.bg, color: pill.fg, border: pill.border ? '1px solid #E0DACE' : undefined }}
            >
              {pill.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: pill.dot }} />}
              {pill.text}
            </span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-body-3">{meta}</div>
        </div>

        {state === 'free' && (
          <button onClick={() => go('checkout')} disabled={busy !== null} className="sl-btn-primary !px-5 !py-[11px] !text-[13.5px]">
            {busyLabel('checkout', zh ? '升级到 Pro →' : 'Upgrade to Pro →')}
          </button>
        )}
        {state === 'canceling' && (
          <button onClick={() => go('resume')} disabled={busy !== null} className="sl-btn-primary !px-5 !py-[11px] !text-[13.5px]">
            {busy === 'resume' ? (zh ? '恢复中…' : 'Resuming…') : (zh ? '恢复订阅' : 'Resume subscription')}
          </button>
        )}
        {state === 'past_due' && (
          <button
            onClick={() => go('card')}
            disabled={busy !== null}
            className="rounded-xl px-5 py-[11px] text-[13.5px] font-bold text-white transition hover:brightness-105 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#DC2626,#B91C1C)' }}
          >
            {busyLabel('card', zh ? '更新付款方式' : 'Update payment method')}
          </button>
        )}
      </div>

      {state === 'free' && (
        <div className="px-5 pb-[18px]">
          <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
            {(zh
              ? ['无限房源发布', '无限次租客筛查', '深度核查（法庭 · 取证 · 雇主）', '报告导出与分享']
              : ['Unlimited listings', 'Unlimited tenant screenings', 'Deep checks (courts · forensics · employer)', 'Report export & sharing']
            ).map((t) => (
              <div key={t} className="flex items-start gap-2 text-[13px] text-body-2">
                <span className="mt-[1px] grid h-[17px] w-[17px] flex-none place-items-center rounded-full text-[11px] font-extrabold" style={{ background: '#E4EEE3', color: GREEN }}>✓</span>
                {t}
              </div>
            ))}
          </div>
          <div className="mt-3.5 text-[12px] text-body-3">
            {zh ? '由 Stripe 安全托管付款 · 取消于本期末生效，不扣下期' : 'Payments handled securely by Stripe · cancellation takes effect at period end, no further charges'}
          </div>
        </div>
      )}

      {state === 'past_due' && (
        <div className="mx-5 mb-4 rounded-[10px] px-3.5 py-[11px] text-[12.5px] font-semibold leading-relaxed" style={{ background: '#FEF2F2', color: '#B91C1C' }}>
          {zh
            ? '上次扣款未成功 — 更新付款方式后 Stripe 会自动重试，Pro 功能在重试期内保留。'
            : 'The last charge failed — update your payment method and Stripe will retry automatically; Pro stays on during the retry window.'}
        </div>
      )}

      {(state === 'active' || state === 'canceling') && (
        <div className="grid grid-cols-1 border-t border-line-divider sm:grid-cols-3">
          <Door icon="💳" busy={busy === 'card'} disabled={busy !== null} onClick={() => go('card')}
            label={zh ? '更新付款方式' : 'Update payment method'} sub={zh ? '直达 Stripe 安全页' : 'Opens Stripe’s secure page'} />
          <Door icon="🧾" busy={busy === 'invoices'} disabled={busy !== null} onClick={() => go('invoices')}
            label={zh ? '发票与收据' : 'Invoices & receipts'} sub={zh ? '查看 · 下载 PDF' : 'View · download PDF'} />
          {state === 'active' ? (
            <Door icon="✕" quiet busy={busy === 'cancel'} disabled={busy !== null} onClick={() => go('cancel')}
              label={zh ? '取消订阅' : 'Cancel subscription'} sub={zh ? '本期末生效' : 'Takes effect at period end'} />
          ) : (
            <Door icon="↻" quiet busy={busy === 'portal'} disabled={busy !== null} onClick={() => go('portal')}
              label={zh ? '账单门户' : 'Billing portal'} sub={zh ? 'Stripe 托管' : 'Hosted by Stripe'} />
          )}
        </div>
      )}

      <div className="border-t border-dashed border-line-divider px-5 pb-4 pt-3 text-[11.5px] leading-relaxed text-body-4">
        {state === 'free'
          ? (zh ? '升级后可在此处更换付款方式、下载发票、取消或恢复订阅。' : 'After upgrading, this is where you change your card, download invoices, and cancel or resume.')
          : state === 'canceling'
            ? (zh ? '改变主意了？在到期前恢复订阅，计划无缝延续，无需重新付款设置。' : 'Changed your mind? Resume before the end date and the plan continues seamlessly — no new payment setup.')
            : state === 'comped'
              ? (zh ? '如需变更计划请联系 Stayloop。' : 'Contact Stayloop to change this plan.')
              : (zh ? '订阅由 Stripe 托管。取消后 Pro 功能保留至本期结束，且可在期内随时恢复。' : 'Managed by Stripe. After cancelling, Pro stays on until the end of the period and can be resumed at any time before then.')}
      </div>

      {err && (
        <div className="px-5 pb-4 text-[12px] font-semibold" style={{ color: '#DC2626' }}>⚠ {err}</div>
      )}
    </div>
  )
}

function Door({ icon, label, sub, quiet, busy, disabled, onClick }: {
  icon: string; label: string; sub: string; quiet?: boolean; busy: boolean; disabled: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2.5 border-b border-line-divider px-[18px] py-[13px] text-left text-[13px] font-semibold transition last:border-b-0 hover:bg-surface-chip disabled:opacity-60 sm:border-b-0 sm:border-r sm:last:border-r-0 ${quiet ? 'text-body-3' : 'text-body-2'}`}
    >
      <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-surface-chip text-[13px]">{icon}</span>
      <span className="min-w-0">
        <span className="block">{busy ? '…' : label}</span>
        <span className="block text-[11px] font-medium text-body-4">{sub}</span>
      </span>
    </button>
  )
}
