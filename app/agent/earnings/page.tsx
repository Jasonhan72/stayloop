'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AIProactive from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
  EmptyState,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
  Table,
  Td,
  Tr,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'
import {
  CLOSED_DEALS,
  DEMO_MONTH,
  DEMO_MONTH_DAYS_LEFT,
  FEE_INVOICES,
  MONTH_FORECAST,
  MONTH_GOAL,
  MONTH_GOAL_PCT,
  MONTH_GROSS,
  MONTH_FEE,
  MONTH_NET,
  PIPELINE,
  PIPELINE_THIS_MONTH,
  PIPELINE_THIS_MONTH_TOTAL,
  PIPELINE_TOTAL,
  PLATFORM_FEE_RATE,
  WIN_PROBABILITY,
  YTD_FEE,
  YTD_GROSS,
  YTD_NET,
  money,
  netCommission,
  platformFee,
} from '@/lib/demo/agentBook'

/**
 * V5 Agent · Earnings — layout follows design/v9-workspace-finance.html.
 *
 * This page is the single ledger for the agent workspace: /agent/calendar and
 * /agent/clients read the same fixtures from lib/demo/agentBook.ts instead of
 * carrying their own totals.
 *
 * Commission is always shown as a breakdown — gross billed, the 25% platform
 * referral fee, and what the agent keeps — in both demo and live mode, so the
 * same column never means two different things. Live rows come from the
 * commission table (RLS-scoped to the caller's brokerage); when the fee is
 * still outstanding the status cell keeps the "pay now" action.
 *
 * Stayloop does not pay agents out — the Connect account exists so the
 * brokerage can settle its platform fee and receive invoices.
 */

interface SettlementRow {
  id: string
  referralId: string
  createdAt: string
  date: string
  fee: number
  gross: number
  paid: boolean
}

interface InvoiceRow {
  id: string
  date: string
  amount: number
  hst: number
  pdfUrl: string | null
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function AgentEarningsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()

  // Real referral-fee ledger (null = none, fall back to the demo book).
  const [realRows, setRealRows] = useState<SettlementRow[] | null>(null)
  const [realInvoices, setRealInvoices] = useState<InvoiceRow[] | null>(null)
  const [connectId, setConnectId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!auth.user) return
    // Brokerage Connect status (RLS: owner only).
    const { data: brokerage } = await supabase
      .from('brokerages')
      .select('id, stripe_connect_id')
      .eq('owner_id', auth.user.id)
      .limit(1)
      .maybeSingle()
    setConnectId(brokerage?.stripe_connect_id ?? null)

    // Fee invoices (RLS: invoice_self).
    const { data: invs } = await supabase
      .from('invoice')
      .select('id, kind, amount, hst, pdf_url, created_at')
      .eq('kind', 'commission')
      .order('created_at', { ascending: false })
    setRealInvoices(
      invs && invs.length > 0
        ? invs.map((v) => ({
            id: v.id as string,
            date: shortDate(v.created_at as string),
            amount: Number(v.amount),
            hst: Number(v.hst),
            pdfUrl: (v.pdf_url as string | null) ?? null,
          }))
        : null
    )

    // Commission rows visible under RLS (payer brokerage owner = caller).
    const { data: coms } = await supabase
      .from('commission')
      .select('id, referral_id, fee_amount, stripe_transfer_id, created_at')
      .order('created_at', { ascending: false })
    if (!coms || coms.length === 0) {
      setRealRows(null)
      return
    }
    const refIds = coms.map((c) => c.referral_id)
    const { data: agrs } = await supabase
      .from('referral_agreement')
      .select('referral_id, gross_commission')
      .in('referral_id', refIds)
    const grossByRef = new Map<string, number>(
      (agrs || []).map((a) => [a.referral_id as string, Number(a.gross_commission)])
    )
    setRealRows(
      coms.map((c) => {
        const fee = Number(c.fee_amount)
        return {
          id: c.id as string,
          referralId: c.referral_id as string,
          createdAt: c.created_at as string,
          date: shortDate(c.created_at as string),
          fee,
          // No agreement row (legacy): reverse the 25% rate off the fee.
          gross: grossByRef.get(c.referral_id as string) ?? fee / PLATFORM_FEE_RATE,
          paid: Boolean(c.stripe_transfer_id),
        }
      })
    )
  }, [auth.user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Returning from Stripe (?connect=done/refresh, ?fee=paid/cancelled):
  // re-fetch and clean the query string so a reload doesn't re-trigger.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.has('connect') || params.has('fee')) {
      loadData()
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [loadData])

  const handleConnect = async () => {
    if (!auth.session || connecting) return
    setConnecting(true)
    try {
      const res = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (res.ok && json.url) {
        window.location.href = json.url
        return
      }
      console.warn('connect onboard failed', json?.error)
    } catch (err) {
      console.warn('connect onboard failed', err)
    } finally {
      setConnecting(false)
    }
  }

  const handlePay = async (row: SettlementRow) => {
    if (!auth.session || payingId) return
    setPayingId(row.id)
    try {
      const res = await fetch('/api/stripe/connect/settle', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.session.access_token}`,
          'Content-Type': 'application/json',
        },
        // Commission already exists — the RPC short-circuits to
        // already_settled and the route goes straight to Checkout.
        body: JSON.stringify({ referral_id: row.referralId, gross: row.gross }),
      })
      const json = await res.json()
      if (res.ok && json.url) {
        window.location.href = json.url
        return
      }
      if (json?.paid) {
        await loadData()
        return
      }
      console.warn('settle failed', json?.error)
    } catch (err) {
      console.warn('settle failed', err)
    } finally {
      setPayingId(null)
    }
  }

  const hasReal = !!realRows && realRows.length > 0
  const now = new Date()
  const settledReal = hasReal ? realRows!.filter((r) => r.paid) : []
  const realYtdRows = settledReal.filter((r) => new Date(r.createdAt).getFullYear() === now.getFullYear())
  const realMonthRows = realYtdRows.filter((r) => new Date(r.createdAt).getMonth() === now.getMonth())
  const sumGross = (rows: SettlementRow[]) => rows.reduce((s, r) => s + r.gross, 0)
  const sumFee = (rows: SettlementRow[]) => rows.reduce((s, r) => s + r.fee, 0)

  const ytdGross = hasReal ? sumGross(realYtdRows) : YTD_GROSS
  const ytdFee = hasReal ? sumFee(realYtdRows) : YTD_FEE
  const ytdNet = hasReal ? ytdGross - ytdFee : YTD_NET
  const monthGross = hasReal ? sumGross(realMonthRows) : MONTH_GROSS
  const monthFee = hasReal ? sumFee(realMonthRows) : MONTH_FEE
  const monthNet = hasReal ? monthGross - monthFee : MONTH_NET
  const dealCount = hasReal ? realYtdRows.length : CLOSED_DEALS.length

  const invoices: InvoiceRow[] =
    realInvoices ??
    FEE_INVOICES.map((v) => ({ id: v.id, date: v.date, amount: v.amount, hst: v.hst, pdfUrl: null }))
  const invoiceLabel = (i: number): string =>
    realInvoices ? (zh ? '转介平台费' : 'Platform referral fee') : FEE_INVOICES[i].deal[lang]

  return (
    <WorkspaceShell role="agent" aside={<Aside hasReal={hasReal} />}>
      {hasReal && (
        <div className="mb-3 rounded-xl border border-success/30 bg-success/[0.06] px-4 py-2.5 font-mono text-[11px] leading-relaxed text-body-2">
          {zh
            ? '真实账本 · 下方结算与发票来自你自己的转介记录'
            : 'LIVE LEDGER · the settlements and invoices below come from your own referral records'}
        </div>
      )}

      <PageHeader
        title={zh ? '佣金与结算' : 'Commission & settlements'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-agent">AGENT · EARNINGS</span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh
              ? `总佣金 → 平台转介费 ${Math.round(PLATFORM_FEE_RATE * 100)}% → 你的实收，逐单可查`
              : `Gross commission → ${Math.round(PLATFORM_FEE_RATE * 100)}% platform referral fee → what you keep, deal by deal`}
          </>
        }
        actions={
          <Link
            href={`/agent/agent?prompt=${encodeURIComponent(zh ? '帮我导出 5 月的佣金明细 CSV' : 'Export a CSV of my May commission details')}`}
            className="rounded-[10px] border border-line-strong bg-white px-4 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {zh ? '导出 CSV' : 'Export CSV'}
          </Link>
        }
      />

      <StatStrip
        stats={[
          {
            label: zh ? '本月实收' : 'Kept this month',
            value: money(monthNet),
            sub: zh
              ? `总佣金 ${money(monthGross)} · 平台费 −${money(monthFee)}`
              : `Gross ${money(monthGross)} · fee −${money(monthFee)}`,
          },
          {
            label: zh ? 'YTD 实收' : 'YTD kept',
            value: money(ytdNet),
            sub: zh ? `${dealCount} 单 · 总佣金 ${money(ytdGross)}` : `${dealCount} deals · gross ${money(ytdGross)}`,
            tone: 'up',
          },
          {
            label: zh ? 'YTD 平台转介费' : 'YTD platform fee',
            value: money(ytdFee),
            sub: zh ? `${Math.round(PLATFORM_FEE_RATE * 100)}% · 按单计费` : `${Math.round(PLATFORM_FEE_RATE * 100)}% · billed per deal`,
            tone: 'warn',
          },
          {
            label: 'Pipeline',
            value: money(PIPELINE_TOTAL),
            sub: zh ? `${PIPELINE.length} 单在途 · 预计总佣金` : `${PIPELINE.length} open · expected gross`,
          },
        ]}
      />

      {/* Month goal — the same $7,200 target the agent's GOAL memory carries. */}
      {!hasReal && (
        <SectionCard
          className="mb-4"
          title={zh ? `${DEMO_MONTH} 月目标进度` : `Month ${DEMO_MONTH} goal progress`}
          meta={zh ? '示范数据' : 'Sample data'}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <GoalFigure label={zh ? '本月目标（总佣金）' : 'Monthly goal (gross)'} value={money(MONTH_GOAL)} />
            <GoalFigure
              label={zh ? '已达成' : 'Booked so far'}
              value={money(MONTH_GROSS)}
              sub={`${MONTH_GOAL_PCT}%`}
              tone="#047857"
            />
            <GoalFigure
              label={zh ? '按当前速度预计' : 'Forecast at current pace'}
              value={money(MONTH_FORECAST)}
              sub={zh ? `本月剩 ${DEMO_MONTH_DAYS_LEFT} 天` : `${DEMO_MONTH_DAYS_LEFT} days left`}
              tone={MONTH_FORECAST >= MONTH_GOAL ? '#047857' : '#B45309'}
            />
          </div>
          <div className="mt-4 h-[14px] overflow-hidden rounded-full bg-surface-chip">
            <div className="h-full rounded-full" style={{ width: `${MONTH_GOAL_PCT}%`, background: '#047857' }} />
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">
            {zh
              ? `预计 = 已达成 ${money(MONTH_GROSS)} + 本月内可签 pipeline ${money(PIPELINE_THIS_MONTH_TOTAL)}（${PIPELINE_THIS_MONTH.length} 单）× ${Math.round(WIN_PROBABILITY * 100)}% 成交概率。`
              : `Forecast = ${money(MONTH_GROSS)} booked + ${money(PIPELINE_THIS_MONTH_TOTAL)} of pipeline that could sign this month (${PIPELINE_THIS_MONTH.length} deals) × ${Math.round(WIN_PROBABILITY * 100)}% win rate.`}
          </p>
        </SectionCard>
      )}

      {/* Stripe Connect — used to settle the platform fee, not to pay agents out. */}
      <SectionCard className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13.5px] font-bold">{zh ? 'Stripe 结算账户' : 'Stripe settlement account'}</div>
            <div className="mt-0.5 text-[12px] text-body-3">
              {connectId
                ? zh
                  ? '已连接 · 转介平台费通过 Stripe 结算并开票'
                  : 'Connected · platform referral fees settle and invoice through Stripe'
                : zh
                  ? '连接后可用 Stripe 结算平台转介费并接收发票'
                  : 'Connect to settle platform referral fees and receive invoices through Stripe'}
            </div>
          </div>
          {connectId ? (
            <StatusPill tone="ok">{zh ? '✓ 已连接' : '✓ CONNECTED'}</StatusPill>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting || !auth.session}
              className="rounded-[10px] border border-line-strong bg-white px-4 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {connecting ? '…' : zh ? '连接 Stripe 账户' : 'Connect Stripe account'}
            </button>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Settlements — identical semantics in demo and live mode. */}
        <SectionCard
          padded={false}
          title={zh ? '结算明细' : 'Settlements'}
          meta={zh ? `平台费 ${Math.round(PLATFORM_FEE_RATE * 100)}%` : `${Math.round(PLATFORM_FEE_RATE * 100)}% platform fee`}
        >
          <Table
            head={[
              zh ? '客户 / 房源' : 'Client / listing',
              zh ? '日期' : 'Date',
              zh ? '总佣金' : 'Gross',
              zh ? `平台费 ${Math.round(PLATFORM_FEE_RATE * 100)}%` : `Fee ${Math.round(PLATFORM_FEE_RATE * 100)}%`,
              zh ? '实收' : 'Kept',
              zh ? '状态' : 'Status',
            ]}
          >
            {hasReal
              ? realRows!.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <div className="font-semibold">{zh ? '转介结算' : 'Referral settlement'}</div>
                      <div className="font-mono text-[11px] text-body-3">#{r.referralId.slice(0, 8)}</div>
                    </Td>
                    <Td align="right" mono>{r.date}</Td>
                    <Td align="right" mono>{money(r.gross)}</Td>
                    <Td align="right" mono muted>−{money(r.fee)}</Td>
                    <Td align="right" mono strong>{money(r.gross - r.fee)}</Td>
                    <Td align="right">
                      {r.paid ? (
                        <StatusPill tone="ok">{zh ? '已结算' : 'Settled'}</StatusPill>
                      ) : (
                        <button
                          onClick={() => handlePay(r)}
                          disabled={payingId === r.id}
                          className="rounded-full bg-[#FFF7E8] px-2.5 py-0.5 text-[11px] font-semibold text-[#B45309] transition hover:opacity-80 disabled:opacity-50"
                        >
                          {payingId === r.id ? '…' : zh ? '平台费待付 · 去支付' : 'Fee due · pay'}
                        </button>
                      )}
                    </Td>
                  </Tr>
                ))
              : CLOSED_DEALS.map((d) => (
                  <Tr key={`${d.date}-${d.listing}`}>
                    <Td>
                      <div className="font-semibold">{d.client[lang]}</div>
                      <div className="text-[11.5px] text-body-2">{d.listing}</div>
                    </Td>
                    <Td align="right" mono>{d.date}</Td>
                    <Td align="right" mono>{money(d.gross)}</Td>
                    <Td align="right" mono muted>−{money(platformFee(d.gross))}</Td>
                    <Td align="right" mono strong>{money(netCommission(d.gross))}</Td>
                    <Td align="right">
                      <StatusPill tone="ok">{zh ? '已结算' : 'Settled'}</StatusPill>
                    </Td>
                  </Tr>
                ))}
          </Table>
        </SectionCard>

        <SectionCard padded={false} title={zh ? '在途 Pipeline' : 'Open pipeline'} meta={money(PIPELINE_TOTAL)}>
          <ul>
            {PIPELINE.map((p, i) => (
              <li key={p.client} className={'px-4 py-3 ' + (i > 0 ? 'border-t border-line-divider' : '')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-bold">{p.client}</div>
                  <div className="font-mono text-[13px] font-bold [font-variant-numeric:tabular-nums]">
                    {money(p.gross)}
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <div className="text-[12px] text-body-2">{p.listing[lang]}</div>
                  <StatusPill tone={p.stage === 'applied' ? 'warn' : p.stage === 'closing' ? 'ok' : 'info'}>
                    {STAGE_LABEL[p.stage][lang]}
                  </StatusPill>
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                  {zh
                    ? `预计签字 ${p.eta} · 实收约 ${money(netCommission(p.gross))}`
                    : `Est. signing ${p.eta} · keeps ~${money(netCommission(p.gross))}`}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Fee invoices — invoice table (kind='commission'), amount = platform fee. */}
      <SectionCard
        className="mt-4"
        padded={false}
        title={zh ? '发票与 HST' : 'Invoices & HST'}
        meta={realInvoices ? undefined : zh ? '示范数据' : 'Sample data'}
      >
        {invoices.length === 0 ? (
          <EmptyState>{zh ? '还没有平台费发票' : 'No platform-fee invoices yet'}</EmptyState>
        ) : (
          <Table
            head={[
              zh ? '发票编号' : 'Invoice',
              zh ? '项目' : 'Item',
              zh ? '日期' : 'Date',
              zh ? '金额' : 'Amount',
              'HST 13%',
              zh ? '合计' : 'Total',
              'PDF',
            ]}
          >
            {invoices.map((v, i) => (
              <Tr key={v.id}>
                <Td mono strong>{realInvoices ? `#${v.id.slice(0, 8)}` : v.id}</Td>
                <Td align="right">{invoiceLabel(i)}</Td>
                <Td align="right" mono>{v.date}</Td>
                <Td align="right" mono>{money(v.amount)}</Td>
                <Td align="right" mono muted>{money(v.hst)}</Td>
                <Td align="right" mono strong>{money(Math.round((v.amount + v.hst) * 100) / 100)}</Td>
                <Td align="right">
                  {v.pdfUrl ? (
                    <a
                      href={v.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-semibold text-agent underline underline-offset-2"
                    >
                      {zh ? '下载 PDF' : 'Download PDF'}
                    </a>
                  ) : (
                    <span className="text-[11.5px] text-body-3">{zh ? '生成中' : 'Generating'}</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </WorkspaceShell>
  )
}

const STAGE_LABEL: Record<string, { zh: string; en: string }> = {
  searching: { zh: '寻房中', en: 'Searching' },
  showing: { zh: '看房中', en: 'Showing' },
  applied: { zh: '已申请', en: 'Applied' },
  closing: { zh: '关单中', en: 'Closing' },
}

function GoalFigure({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <div>
      <div className="text-[11px] text-body-3">{label}</div>
      <div
        className="mt-0.5 text-[22px] font-extrabold tracking-tight [font-variant-numeric:tabular-nums]"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-body-2">{sub}</div>}
    </div>
  )
}

function Aside({ hasReal }: { hasReal: boolean }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('agent')
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive
          role="agent"
          variant="rail"
          insights={[
            {
              text: {
                zh: '你的带看转化率高于区域均值。进入 Top 8% 可申请 Top Agent 入口，获得优先派单。',
                en: 'Your showing conversion beats the area average. Reaching the top 8% unlocks the Top Agent lane with priority dispatch.',
              },
              action: {
                label: { zh: '给我提升计划', en: 'Give me a plan' },
                prompt: {
                  zh: '我现在的表现离 Top Agent 还差什么？给我一个提升计划。',
                  en: 'What separates me from Top Agent status? Give me an improvement plan.',
                },
              },
            },
          ]}
        />
      </AsideBlock>

      <AsideBlock title={zh ? '订阅与账单' : 'Subscription & billing'}>
        <BillingPortalButton lang={lang} />
      </AsideBlock>

      <AsideBlock title={zh ? '报税' : 'Tax filing'}>
        <div className="rounded-xl border border-line-divider bg-white p-3.5">
          <div className="text-[13.5px] font-bold">{zh ? '2025 报税包' : '2025 tax pack'}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body-2">
            {zh
              ? `${hasReal ? '' : '示范数据 · '}全年总佣金 $52,800，平台转介费已按单开票，可一并导出给会计。`
              : `${hasReal ? '' : 'Sample data · '}$52,800 gross commission for the year; platform fees are invoiced per deal and export together for your accountant.`}
          </p>
          <Link
            href={`/agent/agent?prompt=${encodeURIComponent(zh ? '帮我把 2025 年的佣金、平台转介费和发票整理成报税包' : 'Assemble my 2025 commission, platform fees and invoices into a tax pack')}`}
            className="mt-3 block w-full rounded-[8px] border border-line-strong bg-white py-2 text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
          >
            {zh ? '整理报税包' : 'Assemble tax pack'}
          </Link>
        </div>
      </AsideBlock>

      <AsideBlock title={zh ? `${aiName} 提示` : `${aiName} tips`}>
        <div className="space-y-2 text-[12.5px] leading-relaxed text-body-2">
          <p>
            {zh ? (
              <>
                📈 你的成单率比 GTA 同行高 <b>27%</b> — 主要靠快速响应。
              </>
            ) : (
              <>
                📈 Your close rate is <b>27%</b> higher than GTA peers — mostly from fast response.
              </>
            )}
          </p>
          <p>{zh ? '💡 4 个 pipeline 客户中 3 个在 5 月底前能关单。' : '💡 3 of 4 pipeline clients can close before end of May.'}</p>
          <p>
            {zh
              ? '🧾 平台转介费按单开票（含 HST），结算后发票立即可下载。'
              : '🧾 Platform fees are invoiced per deal (HST included) — the invoice is downloadable right after settlement.'}
          </p>
        </div>
      </AsideBlock>
    </div>
  )
}

function BillingPortalButton({ lang }: { lang: Lang }) {
  const zh = lang === 'zh'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = async () => {
    setLoading(true)
    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('not signed in')
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'portal failed')
      window.location.href = data.url
    } catch {
      setError(zh ? '暂时打不开账单门户，请稍后再试。' : 'Could not open the billing portal — try again later.')
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-line-divider bg-white p-3.5">
      <p className="text-[12.5px] leading-relaxed text-body-2">
        {zh
          ? '付款方式、账单历史与取消都在 Stripe 账单门户里处理。'
          : 'Payment method, billing history and cancellation are all handled in the Stripe billing portal.'}
      </p>
      <button
        onClick={open}
        disabled={loading}
        className="mt-3 w-full rounded-[8px] border border-line-strong bg-white py-2 text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand disabled:opacity-50"
      >
        {loading ? '…' : zh ? '管理订阅' : 'Manage subscription'}
      </button>
      {error && <p className="mt-2 text-[11.5px] text-danger">{error}</p>}
    </div>
  )
}
