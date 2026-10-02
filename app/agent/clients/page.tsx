'use client'

import { useCallback, useState } from 'react'
import ClientBook from '@/components/agent/ClientBook'
import Link from 'next/link'
import AIProactive from '@/components/AIProactive'
import StampBadge from '@/components/StampBadge'
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
  type PillTone,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'
import {
  CLOSED_DEALS,
  PIPELINE,
  PIPELINE_TOTAL,
  money,
  netCommission,
  platformFee,
} from '@/lib/demo/agentBook'
import { CLIENTS } from '@/lib/demo/agentClients'

/**
 * V5 Agent · Clients — layout follows design/v9-workspace-finance.html.
 *
 * CRM-style table grouped by stage: searching / showing / applied / leased.
 *
 * Commission figures (pipeline and closed deals) come from lib/demo/agentBook.ts,
 * the same book /agent/earnings renders — the CRM used to show no sign that half
 * these clients had already closed, and the follow-up alert named a client who
 * did not exist in the list.
 */

/** Days since the last two-way contact — drives the follow-up alert. */
const SILENT_WARN = 3
const SILENT_DANGER = 5

const STAGE_STYLE: Record<string, { tone: PillTone; label: { zh: string; en: string } }> = {
  searching: { tone: 'info', label: { zh: '寻房中', en: 'Searching' } },
  showing: { tone: 'info', label: { zh: '看房中', en: 'Showing' } },
  applied: { tone: 'warn', label: { zh: '已申请', en: 'Applied' } },
  leased: { tone: 'ok', label: { zh: '已成交', en: 'Leased' } },
}

/** Expected gross commission per client, straight from the shared pipeline. */
const PIPELINE_BY_CLIENT = new Map(PIPELINE.map((p) => [p.client, p]))
/** Deals already closed, matched back to the CRM rows. */
const CLOSED_BY_CLIENT = CLOSED_DEALS.filter((d) => d.clientKey)

export default function AgentClientsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName()
  const [sortByStamps, setSortByStamps] = useState(false)
  // Real rows (agent_clients) render first; the design-canon roster below is
  // shown only while the agent has none, and is labelled as a sample.
  const [liveCount, setLiveCount] = useState<number | null>(null)
  const onRows = useCallback((n: number) => setLiveCount(n), [])
  const liveMode = (liveCount ?? 0) > 0
  const all = CLIENTS(aiName)
  const clients = sortByStamps ? [...all].sort((a, b) => b.tier - a.tier) : all

  const stageCount = (key: string) => all.filter((c) => c.stage === key).length
  const avgSilent = Math.round((all.reduce((s, c) => s + c.silent, 0) / all.length) * 10) / 10
  // B3 was a ghost: the alert named "Lily Zhang", who is not in this list.
  const quietest = [...all].sort((a, b) => b.silent - a.silent)[0]

  return (
    <WorkspaceShell role="agent" aside={<Aside lang={lang} quietest={quietest} />} liveSlot={<ClientBook zh={zh} onRows={onRows} />}>
      <PageHeader
        title={zh ? '客户管理' : 'Client management'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-agent">AGENT · CLIENTS</span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh
              ? '客户表 · 阶段 / 代表协议与 Information Guide 日期 / 静默天数 / 委托'
              : 'Client book · stage / agreement & Information Guide dates / days quiet / delegation'}
          </>
        }
      />

      <ClientBook zh={zh} onRows={onRows} />

      {liveMode ? null : (<>

      <StatStrip
        stats={[
          {
            label: zh ? '在管客户' : 'Active clients',
            value: String(all.length),
            sub: zh
              ? `寻房 ${stageCount('searching')} · 看房 ${stageCount('showing')} · 已申请 ${stageCount('applied')} · 已成交 ${stageCount('leased')}`
              : `${stageCount('searching')} searching · ${stageCount('showing')} showing · ${stageCount('applied')} applied · ${stageCount('leased')} leased`,
          },
          {
            label: zh ? '本周新增' : 'New this week',
            value: '2',
            sub: zh ? 'Priya S. · Sophie B.' : 'Priya S. · Sophie B.',
            tone: 'up',
          },
          {
            label: zh ? '平均静默' : 'Avg days quiet',
            value: zh ? `${avgSilent} 天` : String(avgSilent),
            sub: zh ? `${all.filter((c) => c.silent >= SILENT_WARN).length} 位超 ${SILENT_WARN} 天` : `${all.filter((c) => c.silent >= SILENT_WARN).length} over ${SILENT_WARN} days`,
            tone: 'warn',
          },
          {
            label: zh ? 'Pipeline 价值' : 'Pipeline value',
            value: money(PIPELINE_TOTAL),
            sub: zh ? `${PIPELINE.length} 单 · 预计总佣金` : `${PIPELINE.length} deals · expected gross`,
          },
        ]}
      />

      {/* Screening for a client (2026-09-29: a RECO-registered agent screens directly; a delegation the
          client confirms only adds the report to the client's own account). */}
      <SectionCard
        className="mb-4"
        title={zh ? '替房东客户筛查' : 'Screening for a landlord client'}
        action={
          <a href="#client-book" className="sl-btn-primary !px-4 !py-2 !text-[12px]">
            {zh ? '去客户表 ↑' : 'Go to the client book ↑'}
          </a>
        }
      >
        <ol className="space-y-1 text-[12.5px] leading-relaxed text-body-2">
          <li>{zh ? '① RECO 注册核验有效就能直接筛查：在客户表那一行点「发起筛查」，或打开筛查页，上传申请人自愿提交、并书面同意核查的材料；报告按付款能力、信用、租务与司法历史、核验四项打分，附法庭与 LTB 记录，记在你名下' : '① With a verified RECO registration you can screen directly: press Screen on the client’s row or open the screening page, then upload the documents the applicant chose to submit and agreed in writing to have checked; the report scores ability to pay, credit, rental and legal history, and verification, with court and LTB records, and sits under your name'}</li>
          <li>{zh ? '② 想让房东客户在自己的账号里也看到报告：记下书面代表协议与 RECO Information Guide 的日期，点「发起委托」，确认链接会发到客户邮箱；客户确认后，从那一行发起的筛查同时记在客户名下' : '② To let the landlord client see the report in their own account: record the representation agreement and RECO Information Guide dates and Propose delegation; once the client confirms from the emailed link, screenings started from that row are also filed under the client'}</li>
          <li>{zh ? '③ 录取与否由房东本人决定；委托一撤销，你就看不到记在客户名下的报告了' : '③ The landlord makes the decision; revoking the delegation removes your access to reports filed under the client'}</li>
        </ol>
        <Link
          href={`/agent/agent?prompt=${encodeURIComponent(zh ? '给我讲讲代客筛查：委托怎么发、房东客户怎么确认、我能做什么不能做什么？' : 'Explain screening for a client: how the delegation is sent, how the landlord client confirms it, and what I can and cannot do.')}`}
          className="mt-3 inline-block rounded-[8px] border border-line-strong bg-white px-4 py-2 text-[12px] font-semibold text-body transition hover:border-brand hover:text-brand"
        >
          {zh ? '秒懂代客筛查' : 'Screening for clients in 60s'}
        </Link>
      </SectionCard>

      {/* Search */}
      <div className="mb-3 flex items-center gap-2">
        <input
          placeholder={zh ? '搜索客户 / 区域 / 盖章进度' : 'Search clients / area / stamps'}
          className="flex-1 rounded-[10px] border border-line-strong bg-white px-4 py-2 text-[12.5px] outline-none focus:border-brand"
        />
        <button
          onClick={() => setSortByStamps((v) => !v)}
          aria-pressed={sortByStamps}
          className={
            'rounded-[10px] border px-4 py-2 text-[12.5px] font-semibold transition ' +
            (sortByStamps
              ? 'border-brand bg-brand/5 text-brand'
              : 'border-line-strong bg-white text-body hover:border-brand hover:text-brand')
          }
        >
          {zh ? (sortByStamps ? '按 盖章进度 ✓' : '按 盖章进度 ▾') : sortByStamps ? 'By stamps ✓' : 'By stamps ▾'}
        </button>
      </div>

      {/* Client table */}
      <SectionCard padded={false} title={zh ? '在管客户' : 'Active clients'} meta={`${all.length}`}>
        <Table
          head={[
            zh ? '客户' : 'Client',
            zh ? '盖章进度' : 'Stamps',
            zh ? '预算 · 区域' : 'Budget · area',
            zh ? '阶段' : 'Stage',
            zh ? '静默天数' : 'Days quiet',
            zh ? '预计佣金' : 'Expected commission',
            zh ? '下一步' : 'Next step',
            '—',
          ]}
        >
          {clients.map((c) => {
            const ss = STAGE_STYLE[c.stage]
            const deal = PIPELINE_BY_CLIENT.get(c.name)
            const silentTone: PillTone =
              c.silent >= SILENT_DANGER ? 'danger' : c.silent >= SILENT_WARN ? 'warn' : 'neutral'
            return (
              <Tr key={c.name}>
                <Td>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-[11px] text-body-3">{c.last[lang]}</div>
                </Td>
                <Td align="right">
                  <StampBadge tier={c.tier} />
                </Td>
                <Td align="right">
                  <div className="font-semibold">{c.budget}</div>
                  <div className="text-[11.5px] text-body-2">{c.area}</div>
                </Td>
                <Td align="right">
                  <StatusPill tone={ss.tone}>{ss.label[lang]}</StatusPill>
                </Td>
                <Td align="right">
                  <StatusPill tone={silentTone}>{zh ? `${c.silent} 天` : `${c.silent}d`}</StatusPill>
                </Td>
                <Td align="right" mono strong>
                  {deal ? money(deal.gross) : <span className="text-body-3">—</span>}
                </Td>
                <Td align="right" muted>
                  {c.next[lang]}
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1.5 whitespace-nowrap">
                    <Link
                      href={`/agent/agent?prompt=${encodeURIComponent(zh ? `打开客户 ${c.name} 的档案，给我最新进展和下一步建议` : `Open ${c.name}'s client file — latest progress and next-step suggestions`)}`}
                      className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
                    >
                      {zh ? '打开' : 'Open'}
                    </Link>
                    {c.stage === 'applied' || c.stage === 'leased' ? (
                      <Link
                        href="/screening/app"
                        className="rounded-[8px] border border-agent/40 bg-agent/[0.06] px-2.5 py-[5px] text-[11.5px] font-semibold text-agent transition hover:border-agent"
                      >
                        {zh ? '发起筛查' : 'Screen'}
                      </Link>
                    ) : (
                      <Link
                        href={`/agent/agent?prompt=${encodeURIComponent(zh ? `帮我给 ${c.name} 起草一条跟进消息（在看 ${c.area}，预算 ${c.budget}）` : `Draft a follow-up to ${c.name} (looking at ${c.area}, budget ${c.budget})`)}`}
                        className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
                      >
                        {zh ? '跟进' : 'Follow up'}
                      </Link>
                    )}
                  </div>
                </Td>
              </Tr>
            )
          })}
        </Table>
      </SectionCard>

      {/* Closed deals — the CRM used to hide that these clients had already signed. */}
      <SectionCard
        className="mt-4"
        padded={false}
        title={zh ? '已成交客户 / 续约机会' : 'Closed clients / renewal openings'}
        meta={zh ? '佣金明细见「收益」页' : 'Full ledger on Earnings'}
        action={
          <Link href="/agent/earnings" className="text-[12px] font-semibold text-agent underline underline-offset-2">
            {zh ? '打开账本 →' : 'Open ledger →'}
          </Link>
        }
      >
        <Table
          head={[
            zh ? '客户' : 'Client',
            zh ? '房源' : 'Listing',
            zh ? '成交' : 'Closed',
            zh ? '总佣金' : 'Gross',
            zh ? '实收' : 'Kept',
            zh ? '状态' : 'Status',
            zh ? '后续' : 'Next',
          ]}
        >
          {CLOSED_BY_CLIENT.map((d) => (
            <Tr key={d.clientKey}>
              <Td strong>{d.clientKey}</Td>
              <Td align="right" muted>{d.listing}</Td>
              <Td align="right" mono>{d.date}</Td>
              <Td align="right" mono>
                {money(d.gross)}
                <div className="text-[10.5px] text-body-3">−{money(platformFee(d.gross))}</div>
              </Td>
              <Td align="right" mono strong>{money(netCommission(d.gross))}</Td>
              <Td align="right">
                <StatusPill tone="ok">{zh ? '已结算' : 'Settled'}</StatusPill>
              </Td>
              <Td align="right" muted>{d.followUp?.[lang] ?? '—'}</Td>
            </Tr>
          ))}
        </Table>
      </SectionCard>
      </>)}
    </WorkspaceShell>
  )
}

function Aside({ lang, quietest }: { lang: Lang; quietest: { name: string; silent: number } }) {
  const zh = lang === 'zh'
  const aiName = useAIName()
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive
          role="agent"
          variant="rail"
          insights={[
            {
              text: {
                zh: `${quietest.name} 已 ${quietest.silent} 天没有跟进。超过 ${SILENT_DANGER} 天未跟进的客户，流失率超过一半。`,
                en: `${quietest.name} hasn't been followed up in ${quietest.silent} days. Clients quiet for ${SILENT_DANGER}+ days churn more than half the time.`,
              },
              action: {
                label: { zh: '起草跟进', en: 'Draft follow-up' },
                prompt: {
                  zh: `帮我给 ${quietest.name} 起草一条自然的跟进消息，他在看 King West / Liberty Village 的 1B+den。`,
                  en: `Draft a natural follow-up to ${quietest.name} — he's looking at 1B+den units in King West / Liberty Village.`,
                },
              },
            },
          ]}
        />
      </AsideBlock>

      <AsideBlock title={zh ? 'RECO 与执业信息' : 'RECO & licence'}>
        <div className="rounded-xl border border-line-divider bg-white p-3.5 text-[12.5px] text-body-2">
          {zh ? '认证状态与注册信息在' : 'Your verification status and registration live on'} <Link href="/agent/verify" className="font-semibold text-agent underline underline-offset-2">/agent/verify</Link>{zh ? '；Stayloop 不展示评分或评价。' : '; Stayloop shows no ratings or reviews.'}
        </div>
      </AsideBlock>

      <AsideBlock title={zh ? `${aiName} 跟进` : `${aiName} follow-ups`}>
        <div className="space-y-2">
          {[
            { who: 'Anna L.', msg: { zh: '看房后 30 min 内问反馈', en: 'Ask for feedback within 30 min of showing' }, when: { zh: '今天 14:30', en: 'Today 14:30' } },
            { who: 'Jason H.', msg: { zh: '5 套 brief 包等你审', en: '5-listing brief pack awaiting your review' }, when: { zh: '本周内', en: 'This week' } },
            { who: 'Sophie B.', msg: { zh: '约第二次看房', en: 'Book a second viewing' }, when: { zh: '今天', en: 'Today' } },
            { who: 'Kevin Tran', msg: { zh: '续约草稿审阅', en: 'Review renewal draft' }, when: { zh: '5/12 前', en: 'By 5/12' } },
          ].map((f) => (
            <div key={f.who} className="rounded-[10px] border border-line-divider bg-white p-3">
              <div className="text-[12.5px] font-bold">{f.who}</div>
              <div className="mt-0.5 text-[12px] text-body-2">{f.msg[lang]}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-eyebrow text-body-3">{f.when[lang]}</div>
            </div>
          ))}
        </div>
      </AsideBlock>
    </div>
  )
}
