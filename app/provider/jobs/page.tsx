'use client'

// /provider/jobs — the provider's workbench (services marketplace §4.3;
// 节点 3 「可执行」 2026-09-26). Six tiles say where every job stands, the
// coverage chips say which trades can actually receive dispatch, the expiry
// banner colours by tier (90 / 60 / 30 / 7 / expired), and an empty workbench
// explains how the first job arrives. Every action goes through the shared
// WorkOrderCard → /api/work-orders/[id]/act. History, invoices, settlement
// records and reviews live on /provider/history.
import { WORK_ORDER_COLUMNS } from '@/lib/marketplace/workOrders'
import { buildProviderTiles, PROVIDER_GROUPS } from '@/lib/marketplace/providerView'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import WorkOrderCard, { type WorkOrderLite } from '@/components/marketplace/WorkOrderCard'
import ThreadPanel from '@/components/threads/ThreadPanel'
import { CREDENTIAL_LABEL, coverageLabel, earliestExpiry, TRADES, type CredentialKind, type CredentialLite, type Trade } from '@/lib/marketplace/trades'
import { expiryTone } from '@/lib/marketplace/sla'
import { useMarketplaceConfig } from '@/lib/marketplace/config'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'

type Row = WorkOrderLite & { ticket_id: string; household_id: string }
type Ctx = { title: string; city: string | null; address: string | null; unit: string | null }
type Prov = { id: string; status: string; legal_name: string; trade_name: string | null; trades: string[]; service_cities: string[]; contact_email: string | null }
const PROVIDER_STATUS: Record<string, { zh: string; en: string }> = { pending: { zh: '待核验', en: 'pending verification' }, verified: { zh: '已核验', en: 'verified' }, rejected: { zh: '未通过', en: 'rejected' }, suspended: { zh: '已暂停', en: 'suspended' }, expired: { zh: '已过期', en: 'expired' } }

const money = (n: number | string | null | undefined) => (n == null || n === '' ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)
const { IN_PROGRESS, AWAITING_ACCEPT } = PROVIDER_GROUPS

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-surface"><Header /><main className="mx-auto w-full max-w-[860px] flex-1 px-5 py-8">{children}</main><Footer /></div>
}

export default function ProviderJobsPage() {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const { graceDays } = useMarketplaceConfig()
  const [prov, setProv] = useState<Prov | null | 'loading'>('loading')
  const [rows, setRows] = useState<Row[]>([])
  const [ctx, setCtx] = useState<Record<string, Ctx>>({})
  const [creds, setCreds] = useState<CredentialLite[]>([])
  const [reviews, setReviews] = useState<{ overall: number }[]>([])
  // Earliest credential expiry: an expired credential silently drops the
  // trade from coverage and dispatch skips the provider, so the jobs page
  // says so ≤90 days ahead, coloured by tier (节点 3 2026-09-26).
  const [expiry, setExpiry] = useState<{ kind: string; days: number } | null>(null)
  const load = useCallback(async () => {
    if (!auth.user) { setProv(null); return }
    const { data: p } = await supabase.from('service_providers').select('id, status, legal_name, trade_name, trades, service_cities, contact_email').eq('auth_id', auth.user.id).maybeSingle()
    setProv((p as Prov | null) ?? null)
    if (!p) return
    const pid = (p as { id: string }).id
    const [{ data: cr }, { data: data }, { data: rv }, { data: c }] = await Promise.all([
      supabase.from('provider_credentials').select('kind, expires_at, verified_at').eq('provider_id', pid),
      supabase.from('work_orders').select(WORK_ORDER_COLUMNS).eq('provider_id', pid).order('updated_at', { ascending: false }).limit(200),
      supabase.from('provider_reviews').select('overall').eq('provider_id', pid).limit(500),
      // Address / title come from a definer RPC scoped to this provider's live
      // work orders (no table access to households or tickets; review 2026-09-23).
      supabase.rpc('provider_job_context'),
    ])
    const credList = (cr ?? []) as CredentialLite[]
    setCreds(credList)
    setExpiry(earliestExpiry(credList))
    setRows((data ?? []) as unknown as Row[])
    setReviews((rv ?? []) as { overall: number }[])
    const m: Record<string, Ctx> = {}
    for (const x of (c ?? []) as { work_order_id: string; ticket_title: string; address: string | null; unit: string | null; city: string | null }[]) m[x.work_order_id] = { title: x.ticket_title, city: x.city, address: x.address, unit: x.unit }
    setCtx(m)
  }, [auth.user])
  useEffect(() => { if (!auth.loading) void load() }, [auth.loading, load])
  const tiles = useMemo(() => buildProviderTiles(rows, reviews), [rows, reviews])

  if (auth.loading || prov === 'loading') return <Shell><div className="text-body-3">…</div></Shell>
  if (!auth.user) return <Shell><div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '请先登录。' : 'Sign in first.'} <Link href="/login?next=/provider/jobs" className="underline">{zh ? '登录' : 'Sign in'}</Link></div></Shell>
  if (!prov) return <Shell><div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '你还没有服务商档案。' : 'No provider profile yet.'} <Link href="/provider/onboard" className="font-bold text-brand underline">{zh ? '入驻 →' : 'Onboard →'}</Link></div></Shell>

  const groups: { key: string; zh: string; en: string; filter: (r: Row) => boolean }[] = [
    { key: 'invites', zh: '邀请 · 等你回应', en: 'Invitations', filter: (r) => r.status === 'offered' },
    { key: 'quoted', zh: '已报价 · 等房东批准', en: 'Quoted · awaiting the landlord', filter: (r) => r.status === 'quoted' },
    { key: 'active', zh: '进行中', en: 'In progress', filter: (r) => IN_PROGRESS.includes(r.status) },
    { key: 'awaiting', zh: '已完工 · 待验收', en: 'Completed · awaiting acceptance', filter: (r) => AWAITING_ACCEPT.includes(r.status) },
    { key: 'settle', zh: '已验收 · 待结算', en: 'Accepted · awaiting payment', filter: (r) => r.status === 'accepted' },
  ]
  const hidden = (r: Row) => ['offered', 'declined', 'cancelled', 'expired'].includes(r.status)
  const tone = expiry ? expiryTone(expiry.days) : null
  const bannerCls = tone === 'expired' || tone === 'critical' ? 'border-red-200 bg-red-50 text-red-900' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : tone === 'notice' ? 'border-amber-100 bg-amber-50/60 text-amber-900' : 'border-brand/20 bg-brand/5 text-body'
  const credName = (k: string) => (zh ? CREDENTIAL_LABEL[k as CredentialKind]?.zh : CREDENTIAL_LABEL[k as CredentialKind]?.en) ?? k
  const coverage = (prov.trades as Trade[]).map((t) => ({ t, def: TRADES.find((x) => x.key === t), ...coverageLabel(t, creds, zh, new Date(), graceDays) }))
  const tileCls = 'rounded-xl border border-line-divider bg-white p-3 text-left hover:bg-surface-chip'
  const TILE = ({ href, n, label, sub, warn }: { href: string; n: string | number; label: string; sub?: string | null; warn?: boolean }) => (
    <a href={href} className={tileCls}><div className={'text-[22px] font-extrabold tracking-tight ' + (warn ? 'text-danger' : '')}>{n}</div><div className="text-[12px] font-semibold text-body-2">{label}</div>{sub ? <div className="mt-0.5 text-[11px] text-body-3">{sub}</div> : null}</a>
  )

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '服务商 · 工单' : 'PROVIDER · JOBS'}</div>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{prov.trade_name || prov.legal_name}</h1>
          <p className="mt-1 text-[12.5px] text-body-3">{prov.status === 'verified' ? (zh ? '资质已核 · 可接收派单' : 'Verified · eligible for dispatch') : (zh ? `状态：${PROVIDER_STATUS[prov.status]?.zh ?? prov.status} · 核验通过前不会收到派单` : `Status: ${PROVIDER_STATUS[prov.status]?.en ?? prov.status} · no dispatch until verified`)} · <Link href="/provider/onboard" className="underline">{zh ? '资料与资质' : 'Profile & credentials'}</Link> · <Link href="/provider/history" className="underline" data-testid="provider-history-link">{zh ? '历史 · 账单 · 评价' : 'History · invoices · reviews'}</Link></p>
        </div>
      </div>

      {/* Six tiles (报告 7) */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="provider-tiles">
        <TILE href="#invites" n={tiles.invites} label={zh ? '新邀请' : 'New invitations'} sub={tiles.urgent ? (zh ? `${tiles.urgent} 张临近 / 已过报价截止` : `${tiles.urgent} near / past the quote deadline`) : (zh ? '48 小时内回应' : 'answer within the window')} warn={tiles.urgent > 0} />
        <TILE href="#quoted" n={tiles.quoted} label={zh ? '已报价 · 等房东' : 'Quoted · landlord'} />
        <TILE href="#active" n={tiles.active} label={zh ? '进行中' : 'In progress'} />
        <TILE href="#awaiting" n={tiles.awaiting} label={zh ? '待验收' : 'Awaiting acceptance'} />
        <TILE href="#settle" n={tiles.settle} label={zh ? '待结算' : 'Awaiting payment'} sub={tiles.settle ? money(tiles.settleSum) : null} />
        <TILE href="/provider/history" n={money(tiles.paidSum)} label={zh ? '今年收入 · 评价' : 'Paid this year · rating'} sub={tiles.avg != null ? `★ ${tiles.avg} (${tiles.reviews})` : (zh ? '还没有评价' : 'no reviews yet')} />
      </div>

      {/* Coverage per trade (报告 8): what can actually receive dispatch */}
      <div className="mt-4 flex flex-wrap gap-1.5" data-testid="trade-coverage">
        {coverage.map((c) => <span key={c.t} className={'rounded-full px-2.5 py-[3px] text-[11.5px] ' + (c.ok ? 'bg-success/10 text-success' : 'bg-amber-50 text-amber-800')}>{c.def ? (zh ? c.def.zh : c.def.en) : c.t} · {c.text}</span>)}
        {coverage.length === 0 && <span className="text-[12px] text-body-3">{zh ? '还没有选工种。' : 'No trades selected yet.'} <Link href="/provider/onboard" className="underline">{zh ? '去补' : 'Add'}</Link></span>}
      </div>

      {expiry && tone && (
        <div className={'mt-4 rounded-xl border px-4 py-3 text-[13px] ' + bannerCls} role="status" data-testid="credential-expiry" data-tier={tone}>
          <b>{credName(expiry.kind)}</b>
          {' '}
          {expiry.days < 0
            ? (zh ? `已于 ${-expiry.days} 天前到期——过期资质不再计入工种覆盖，派单会跳过你。` : `expired ${-expiry.days} day(s) ago — an expired credential no longer counts toward coverage and dispatch skips you.`)
            : expiry.days === 0
              ? (zh ? '今天到期——明天起不再计入工种覆盖。' : 'expires today — from tomorrow it no longer counts toward coverage.')
              : (zh ? `还有 ${expiry.days} 天到期——到期后不再计入工种覆盖，请在到期前更新。提醒会在 90 / 60 / 30 / 7 天各发一次。` : `expires in ${expiry.days} day(s) — after that it no longer counts toward coverage; renew before then. Reminders go out at 90 / 60 / 30 / 7 days.`)}
          {' '}<Link href="/provider/onboard" className="font-bold underline">{zh ? '更新资质 →' : 'Update credentials →'}</Link>
        </div>
      )}

      {rows.length === 0 && (
        <div className="mt-6 rounded-2xl border border-line-divider bg-white p-5 text-[13.5px]" data-testid="provider-empty-guide">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '第一张工单怎么来' : 'How the first job arrives'}</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-body-2">
            <li>{zh ? '房东在在管租约的报修上派单；精选网络按 资质有效 → 覆盖该城市 → 房东偏好 / 你以前为 TA 做过的单 / 评分 / 接单率 排序。' : 'Landlords dispatch from a repair ticket on a managed tenancy; the network ranks by valid credentials → city served → the landlord’s preference / past jobs with them / ratings / acceptance.'}</li>
            <li>{prov.status === 'verified' ? (zh ? '你的档案已核验。' : 'Your profile is verified.') : (zh ? `你的档案${PROVIDER_STATUS[prov.status]?.zh ?? prov.status}——核验通过前不会收到派单。` : `Your profile is ${PROVIDER_STATUS[prov.status]?.en ?? prov.status} — no dispatch until it is verified.`)} {coverage.some((c) => !c.ok) ? (zh ? '上面标「未覆盖」的工种还缺资质，补齐后才会收到该工种的派单。' : 'Trades marked “not covered” above are missing credentials; they receive dispatch once complete.') : (zh ? '所有工种都已覆盖。' : 'Every trade is covered.')} <Link href="/provider/onboard" className="underline">{zh ? '资质页' : 'Credentials'}</Link></li>
            <li>{zh ? `服务城市：${prov.service_cities.join('、') || '未选'}——只有这些城市的报修会找到你。` : `Cities served: ${prov.service_cities.join(', ') || 'none'} — only tickets in these cities reach you.`}</li>
            <li>{zh ? `派单邀请发到 ${prov.contact_email || '（未填接单邮箱）'} 并推送到这里；请在房东设定的时限内（默认 48 小时）接单报价，或选原因婉拒。逾期房东可改派。` : `Invitations go to ${prov.contact_email || '(no dispatch email)'} and appear here; answer within the landlord’s window (48 h by default) with a quote, or decline with a reason. Overdue offers may be reassigned.`}</li>
          </ol>
        </div>
      )}

      {groups.map((g) => {
        const list = rows.filter(g.filter)
        return (
          <section key={g.key} id={g.key} className="mt-6">
            <h2 className="text-[14px] font-extrabold">{zh ? g.zh : g.en} <span className="font-mono text-[12px] text-body-3">{list.length}</span></h2>
            {list.length === 0 ? <p className="mt-2 text-[12.5px] text-body-3">—</p> : (
              <div className="mt-2 space-y-3">
                {list.map((r) => (
                  <div key={r.id}>
                    <div className="mb-1 text-[12.5px] text-body-2"><b>{ctx[r.id]?.title || r.scope}</b> · {hidden(r) ? (ctx[r.id]?.city || '') : [ctx[r.id]?.address, ctx[r.id]?.unit ? `#${ctx[r.id]?.unit}` : null, ctx[r.id]?.city].filter(Boolean).join(', ')}</div>
                    <WorkOrderCard wo={r} viewer="provider" zh={zh} providerName={prov.trade_name || prov.legal_name} onChange={load} />
                    {/* 节点 4: the tri-party thread — the landlord and the tenant read the same lines. */}
                    <div className="mt-2"><ThreadPanel kind="work_order" refId={r.id} viewer="provider" zh={zh} compact title={zh ? '工单对话' : 'Work-order thread'} participants={zh ? '租客 · 房东 · 你' : 'tenant · landlord · you'} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
      <p className="mt-8 text-[11px] text-body-3">{zh ? '完整地址在接单后显示、归档后隐藏；进入方式以房东发出的通知为准。已付款 / 已归档 / 婉拒 / 取消的工单在' : 'The full address shows after you accept and is hidden once the job is closed; entry follows the landlord’s notice. Paid / closed / declined / cancelled jobs are on '}<Link href="/provider/history" className="underline">{zh ? '历史页' : 'the history page'}</Link>{zh ? '。' : '.'}</p>
    </Shell>
  )
}
