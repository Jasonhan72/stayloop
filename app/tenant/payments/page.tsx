'use client'

import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
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

const HISTORY = [
  { date: '2026-05-01', amount: 2800, status: 'paid', method: { zh: 'Plaid · RBC ****8721', en: 'Plaid · RBC ****8721' } },
  { date: '2026-04-01', amount: 2800, status: 'paid', method: { zh: 'Plaid · RBC ****8721', en: 'Plaid · RBC ****8721' } },
  { date: '2026-03-01', amount: 2800, status: 'paid', method: { zh: 'e-Transfer', en: 'e-Transfer' } },
  { date: '2026-02-01', amount: 2800, status: 'late', method: { zh: '迟付 3 天', en: '3 days late' } },
  { date: '2026-01-01', amount: 2800, status: 'paid', method: { zh: 'Plaid · RBC ****8721', en: 'Plaid · RBC ****8721' } },
]

/**
 * Deposits and one-time charges.
 * Ontario compliance: the RTA only permits a rent deposit (last month's rent)
 * and a key deposit — never a "damage deposit". The $500 pet item is a lease
 * clause settled against actual wear and tear at move-out, matching the wording
 * already used on /tenant/lease.
 */
const DEPOSITS = [
  {
    item: { zh: '最后一月租金押金', en: "Last month's rent deposit" },
    amount: 2800,
    note: {
      zh: '按 RTA s.106 计息（2026 指导利率 2.5%）· 抵扣租期最后一个月（2027 年 5 月）',
      en: 'Interest per RTA s.106 (2026 guideline rate 2.5%) · applied to the final month (May 2027)',
    },
    status: { zh: '2025-08-01 收讫', en: 'Received 2025-08-01' },
    tone: 'ok' as const,
  },
  {
    item: { zh: '钥匙 / 门禁卡押金', en: 'Key / fob deposit' },
    amount: 50,
    note: {
      zh: '按更换成本收取（RTA 允许）· 交还钥匙后全额退还',
      en: 'Charged at replacement cost (permitted by the RTA) · refunded in full when keys are returned',
    },
    status: { zh: '2025-08-01 收讫', en: 'Received 2025-08-01' },
    tone: 'neutral' as const,
  },
]

/** Recent activity on this account (demo — mirrors the HISTORY fixtures). */
const ACTIVITY = [
  {
    when: '5/01 09:02',
    text: { zh: '扣款成功 $2,800 · RBC ****8721', en: 'Debit succeeded $2,800 · RBC ****8721' },
    tone: 'ok' as const,
  },
  {
    when: '4/28 09:00',
    text: { zh: '提前 3 天提醒', en: 'Reminder sent 3 days ahead' },
    tone: 'neutral' as const,
  },
  {
    when: '2/04',
    text: {
      zh: '迟付说明已归档（银行转账延迟）',
      en: 'Late-payment explanation filed (bank transfer delay)',
    },
    tone: 'warn' as const,
  },
]

function downloadCSV(lang: Lang, rows: typeof HISTORY) {
  const header = lang === 'zh' ? '日期,期间,金额,方式,状态' : 'Date,Period,Amount,Method,Status'
  const lines = rows.map(
    (p) =>
      `${p.date},${p.date.slice(0, 7)},${p.amount},"${p.method[lang]}",${p.status}`
  )
  const csv = [header, ...lines].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stayloop-rent-payments-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function TenantPaymentsPage() {
  const name = useAIName()
  const { lang } = useT()
  const zh = lang === 'zh'

  const paidYtd = HISTORY.reduce((sum, p) => sum + p.amount, 0)
  const onTime = HISTORY.filter((p) => p.status === 'paid').length

  const insights: AIInsight[] = [
    {
      text: {
        zh: '2 月那次迟付 3 天可以补充情况说明（如银行转账延迟），{ai} 帮你写好并归档，避免影响信任分。',
        en: "February's 3-day late payment can carry an explanation (e.g. bank transfer delay). {ai} writes and files it so your trust score isn't dinged.",
      },
      action: {
        label: { zh: '补充说明', en: 'Add explanation' },
        prompt: {
          zh: '帮我为 2 月迟付 3 天写一份情况说明并归档，原因是银行转账延迟。',
          en: 'Write and file an explanation for the February 3-day late payment — cause was a bank transfer delay.',
        },
      },
    },
  ]

  return (
    <WorkspaceShell role="tenant" aside={<Aside lang={lang} insights={insights} />}>
      <PageHeader
        title={zh ? '租金支付' : 'Rent Payments'}
        sub={<span className="font-mono text-[11px] uppercase tracking-eyebrow text-tenant">RENT PAYMENTS</span>}
        actions={
          <button
            onClick={() => downloadCSV(lang, HISTORY)}
            className="rounded-[10px] border border-line-strong bg-white px-4 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {zh ? '导出 CSV' : 'Export CSV'}
          </button>
        }
      />

      <StatStrip
        stats={[
          {
            label: zh ? '本年已付' : 'Paid year to date',
            value: `$${paidYtd.toLocaleString()}`,
            sub: zh ? `${HISTORY.length} 期 · 每期 $2,800` : `${HISTORY.length} periods · $2,800 each`,
          },
          {
            label: zh ? '押金托管' : 'Deposit held',
            value: '$2,800',
            sub: zh ? '最后一月租金押金' : "Last month's rent deposit",
          },
          {
            label: zh ? '准时率' : 'On-time rate',
            value: `${Math.round((onTime / HISTORY.length) * 100)}%`,
            sub: zh ? `${onTime}/${HISTORY.length} 期准时` : `${onTime}/${HISTORY.length} periods on time`,
            tone: 'warn',
          },
          {
            label: zh ? '剩余租期' : 'Term remaining',
            value: zh ? '10 个月' : '10 mo',
            sub: zh ? '2027-05-31 到期' : 'Ends 2027-05-31',
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard title={zh ? '下次扣款' : 'Next payment'}>
          <div className="flex items-baseline gap-3">
            <span className="text-[24px] font-extrabold tracking-tight [font-variant-numeric:tabular-nums]">$2,800</span>
            <span className="text-[13px] text-body-3">{zh ? '/ 月' : '/ mo'}</span>
          </div>
          <div className="mt-1 text-[12.5px] text-body-2">{zh ? '5月22日 · 自动扣款 · RBC ****8721' : 'May 22 · auto-debit · RBC ****8721'}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/tenant/agent?prompt=${encodeURIComponent(zh ? '帮我提前支付这个月的房租 $2,800' : 'Help me pay this month’s $2,800 rent early')}`} className="sl-btn-secondary !px-4 !py-2 !text-[12.5px]">{zh ? '立即支付（提前付）' : 'Pay now (early)'}</Link>
            <Link href={`/tenant/agent?prompt=${encodeURIComponent(zh ? '我想申请暂停 1 个月房租扣款，帮我向房东发起申请' : 'I’d like to pause rent auto-debit for 1 month — help me request landlord consent')}`} className="sl-btn-ghost !px-4 !py-2 !text-[12.5px]">{zh ? '暂停 1 个月（需房东同意）' : 'Pause 1 month (needs landlord consent)'}</Link>
          </div>

          <div className="mt-4 rounded-xl bg-success/10 p-3.5 text-[12.5px] leading-relaxed text-success">
            {zh
              ? '✓ 你今年所有付款都准时 · 你的还款记录已计入 护照信任分'
              : '✓ All your payments this year were on time · your payment record counts toward your Passport trust score'}
            <Link href="/tenant/passport" className="ml-2 font-semibold underline underline-offset-2">
              {zh ? '在护照中查看 →' : 'View in Passport →'}
            </Link>
          </div>
        </SectionCard>

        {/* Right column — matches V5.3 design: 房客信用 + LUNA 续约提醒 */}
        <div className="flex flex-col gap-4">
          <SectionCard title={zh ? '你的房客信用' : 'Your tenant credit'}>
            <div className="text-[24px] font-extrabold leading-none text-success">A+</div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-body-2">
              {zh
                ? '10/10 准时 · 优于 92% Stayloop 用户。下个房东会自动看到你的纪录（你授权才能看）。'
                : '10/10 on time · better than 92% of Stayloop users. Your next landlord will automatically see your record (only with your authorization).'}
            </p>
          </SectionCard>

          <div className="rounded-xl border border-tenant/30 bg-tenant/[0.04] p-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-5 rounded-full bg-tenant/20 text-center text-[11px] leading-5">🟣</span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-tenant">
                {zh ? `${name} · 续约提醒` : `${name} · Renewal reminder`}
              </span>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-body-2">
              {zh ? (
                <>还有 <b>10 个月</b>到期。市场租金 +6%，房东可能会提议涨租。</>
              ) : (
                <><b>10 months</b> until your lease ends. Market rent is up 6%, so the landlord may propose an increase.</>
              )}
            </p>
            <p className="mt-2.5 text-[12.5px] text-body-2">{zh ? '我帮你准备续约谈判材料？' : 'Want me to prepare your renewal negotiation materials?'}</p>
            <Link href={`/tenant/agent?prompt=${encodeURIComponent(zh ? '租约还有 10 个月到期，帮我准备续约谈判材料' : 'My lease ends in 10 months — help me prepare renewal negotiation materials')}`} className="sl-btn-secondary mt-3 block w-full text-center !py-2 !text-[12.5px]">{zh ? '→ 准备材料' : '→ Prepare materials'}</Link>
          </div>
        </div>
      </div>

      {/* Deposits & one-time charges */}
      <div className="mt-4">
        <SectionCard
          title={zh ? '押金与一次性费用' : 'Deposits & one-time charges'}
          meta={zh ? '示范数据' : 'SAMPLE DATA'}
          padded={false}
        >
          <Table head={[zh ? '项目' : 'Item', zh ? '金额' : 'Amount', zh ? '状态' : 'Status']}>
            {DEPOSITS.map((d) => (
              <Tr key={d.item.en}>
                <Td>
                  <div className="font-semibold">{d.item[lang]}</div>
                  <div className="mt-0.5 text-[11.5px] text-body-3">{d.note[lang]}</div>
                </Td>
                <Td align="right" mono strong>
                  ${d.amount.toLocaleString()}
                </Td>
                <Td align="right">
                  <StatusPill tone={d.tone}>{d.status[lang]}</StatusPill>
                </Td>
              </Tr>
            ))}
          </Table>
          <p className="border-t border-line-divider px-4 py-3 text-[11.5px] leading-relaxed text-body-3">
            {zh
              ? '安省《住宅租赁法》只允许房东收取「最后一月租金押金」与「钥匙押金」两类押金；宠物条款下的费用按实际损耗结算，不构成第三类押金。'
              : "Under Ontario's Residential Tenancies Act a landlord may collect only two deposits — last month's rent and a key deposit. The pet clause charge is settled against actual wear and tear and is not a third deposit."}
          </p>
        </SectionCard>
      </div>

      {/* Payment history */}
      <div className="mt-4">
        <SectionCard title={zh ? '付款历史' : 'Payment history'} padded={false}>
          <Table
            head={[
              zh ? '日期' : 'Date',
              zh ? '期间' : 'Period',
              zh ? '金额' : 'Amount',
              zh ? '方式' : 'Method',
              zh ? '状态' : 'Status',
              zh ? '收据' : 'Receipt',
            ]}
          >
            {HISTORY.map((p) => (
              <Tr key={p.date}>
                <Td mono>{p.date}</Td>
                <Td align="right" mono muted>
                  {zh ? `${p.date.slice(0, 7)} 月租` : `${p.date.slice(0, 7)} rent`}
                </Td>
                <Td align="right" mono strong>
                  ${p.amount.toLocaleString()}
                </Td>
                <Td align="right" muted>
                  {p.method[lang]}
                </Td>
                <Td align="right">
                  <StatusPill tone={p.status === 'paid' ? 'ok' : 'warn'}>
                    {p.status === 'paid' ? 'PAID' : 'LATE'}
                  </StatusPill>
                </Td>
                <Td align="right">
                  <button
                    onClick={() => window.print()}
                    className="text-[12px] font-semibold text-brand transition hover:underline"
                  >
                    {zh ? '查看收据' : 'View receipt'}
                  </button>
                </Td>
              </Tr>
            ))}
          </Table>
        </SectionCard>
      </div>
    </WorkspaceShell>
  )
}

function Aside({ lang, insights }: { lang: Lang; insights: AIInsight[] }) {
  const zh = lang === 'zh'
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive role="tenant" insights={insights} variant="rail" />
      </AsideBlock>

      <AsideBlock title={zh ? '最近动态' : 'RECENT ACTIVITY'}>
        <ol className="space-y-3">
          {ACTIVITY.map((a) => (
            <li key={a.when} className="grid grid-cols-[10px_1fr] gap-2.5">
              <span
                className={
                  'mt-[5px] h-2 w-2 rounded-full ' +
                  (a.tone === 'ok' ? 'bg-success' : a.tone === 'warn' ? 'bg-warning' : 'bg-line-strong')
                }
              />
              <div>
                <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">{a.when}</div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-body-2">{a.text[lang]}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] text-body-3">{zh ? '示范数据' : 'SAMPLE DATA'}</p>
      </AsideBlock>
    </div>
  )
}
