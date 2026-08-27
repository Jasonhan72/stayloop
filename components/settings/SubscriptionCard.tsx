'use client'

// 订阅与账单 — the in-app home for subscription management (2026-08-27).
//
// Design decision: the app shows STATE and provides DOORS; the operations
// themselves (card update, invoices, cancel, un-cancel) live in the Stripe
// Billing Portal. Stripe owns the cancel/resume/proration state machine and
// the PCI surface — rebuilding those flows in-app would be duplicate risk
// for zero benefit. The portal's live configuration (invoice history +
// payment-method update + cancel-at-period-end) was set up 2026-08-26.
//
// Landlord-only: it is the only role with a plan store (landlords.plan,
// written by the Stripe webhook). Three states:
//   free                → Pro pitch + checkout button
//   paid via Stripe     → status card + renewal date + portal button
//   comped (no customer)→ "granted directly" note, nothing to manage
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'

type Row = {
  plan: string | null
  plan_status: string | null
  plan_current_period_end: string | null
  stripe_customer_id: string | null
}

export default function SubscriptionCard({ userId, zh }: { userId: string; zh: boolean }) {
  const [row, setRow] = useState<Row | null | 'loading'>('loading')
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = getSupabaseBrowser()
      const { data } = await supabase
        .from('landlords')
        .select('plan, plan_status, plan_current_period_end, stripe_customer_id')
        // Dual-ID invariant (CLAUDE.md): legacy rows key by profileId.
        .or(`id.eq.${userId},auth_id.eq.${userId}`)
        .limit(1)
        .maybeSingle()
      if (!cancelled) setRow((data as Row) ?? null)
    })()
    return () => { cancelled = true }
  }, [userId])

  async function callBilling(kind: 'checkout' | 'portal') {
    setBusy(kind)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error(zh ? '请先登录' : 'not signed in')
      const res = await fetch(`/api/stripe/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: kind === 'portal' ? JSON.stringify({ return: 'settings' }) : undefined,
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || `${kind} failed`)
      window.location.href = data.url
    } catch (e: any) {
      setErr(String(e?.message || 'unknown'))
      setBusy(null)
    }
  }

  if (row === 'loading') {
    return <div className="h-[104px] animate-pulse rounded-xl border border-line-divider bg-surface-muted" />
  }
  // No landlord row at all — nothing to manage yet (checkout self-heals one
  // the moment they upgrade, so still show the free pitch).
  const plan = row?.plan ?? 'free'
  const paid = plan === 'pro' || plan === 'team'
  const hasStripe = !!row?.stripe_customer_id
  const status = row?.plan_status ?? null
  const periodEnd = row?.plan_current_period_end
    ? new Date(row.plan_current_period_end).toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const pastDue = status === 'past_due' || status === 'unpaid' || status === 'incomplete'

  return (
    <div className="rounded-xl border border-line-divider bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{zh ? '订阅与账单' : 'Subscription & billing'}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-body-3">
            <span className="font-mono font-bold uppercase" style={{ color: paid ? '#047857' : undefined }}>
              {plan === 'team' ? 'Team' : plan === 'pro' ? 'Pro · $29/mo' : 'Free'}
            </span>
            {paid && status && (
              <span
                className="rounded-md px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase"
                style={pastDue ? { background: '#FEF2F2', color: '#DC2626' } : { background: '#04785712', color: '#047857' }}
              >
                {status}
              </span>
            )}
            {paid && periodEnd && (
              <span>{zh ? `下次续费：${periodEnd}` : `Renews ${periodEnd}`}</span>
            )}
          </div>
        </div>

        {plan === 'free' && (
          <button
            onClick={() => callBilling('checkout')}
            disabled={busy !== null}
            className="sl-btn-primary !px-4 !py-[9px] !text-[13px]"
          >
            {busy === 'checkout' ? (zh ? '跳转 Stripe…' : 'Redirecting…') : (zh ? '升级到 Pro →' : 'Upgrade to Pro →')}
          </button>
        )}
        {paid && hasStripe && (
          <button
            onClick={() => callBilling('portal')}
            disabled={busy !== null}
            className="rounded-xl border border-line-divider bg-white px-4 py-[9px] text-[13px] font-semibold text-body hover:border-brand"
          >
            {busy === 'portal' ? (zh ? '打开中…' : 'Opening…') : (zh ? '管理订阅' : 'Manage subscription')}
          </button>
        )}
      </div>

      {pastDue && (
        <div className="mt-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: '#FEF2F2', color: '#B91C1C' }}>
          {zh
            ? '上次扣款失败 — 请在「管理订阅」里更新付款方式，否则计划将降回免费档。'
            : 'The last charge failed — update your payment method in “Manage subscription”, or the plan will drop back to Free.'}
        </div>
      )}

      <div className="mt-3 text-[11.5px] leading-relaxed text-body-3">
        {plan === 'free' ? (
          zh
            ? 'Pro：无限房源 · 深度核查 · 优先评分队列 · 批量导出。随时可在此处取消。'
            : 'Pro: unlimited listings · deep checks · priority scoring · bulk export. Cancel here any time.'
        ) : hasStripe ? (
          zh
            ? '「管理订阅」由 Stripe 托管：更换付款方式、查看/下载发票、取消或恢复订阅。取消在本期结束时生效，期间 Pro 功能保留。'
            : 'Managed by Stripe: update your card, view invoices, cancel or resume. Cancellation takes effect at the end of the current period; Pro stays on until then.'
        ) : (
          zh
            ? '你的 Pro 由 Stayloop 直接开通，没有需要管理的 Stripe 订阅。'
            : 'Your Pro plan was granted directly by Stayloop — there is no Stripe subscription to manage.'
        )}
      </div>

      {err && (
        <div className="mt-2 text-[12px] font-semibold" style={{ color: '#DC2626' }}>⚠ {err}</div>
      )}
    </div>
  )
}
