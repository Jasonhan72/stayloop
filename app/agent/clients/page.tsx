'use client'

import { useState } from 'react'
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

const CLIENTS = (aiName: string) => [
  {
    name: 'Mia Chen',
    tier: 2,
    budget: '$3,800–$4,500',
    area: 'King West',
    stage: 'showing',
    silent: 0,
    next: { zh: '今天 11:00 · Unit 1207 · King West', en: 'Today 11:00 · Unit 1207 · King West' },
    last: { zh: `昨晚和 ${aiName} 聊了 30 min`, en: `Chatted with ${aiName} 30 min last night` },
  },
  {
    name: 'Anna L.',
    tier: 3,
    budget: '$3,800–$4,500',
    area: 'The Annex / Forest Hill',
    stage: 'showing',
    silent: 0,
    next: { zh: '昨天已看 432 Brunswick · 等反馈表', en: 'Viewed 432 Brunswick yesterday · feedback pending' },
    last: { zh: `昨晚和 ${aiName} 聊了 30 min`, en: `Chatted with ${aiName} 30 min last night` },
  },
  {
    name: 'Jason H.',
    tier: 2,
    budget: '$3,200–$3,600',
    area: 'King West / Liberty Village',
    stage: 'searching',
    silent: 5,
    next: { zh: `${aiName} 在筛选 5 套备选`, en: `${aiName} shortlisting 5 options` },
    last: { zh: '5/4 给了 brief 包', en: 'Brief pack delivered 5/4' },
  },
  {
    name: 'Lisa W.',
    tier: 4,
    budget: '$4,500+',
    area: 'Yorkville',
    stage: 'searching',
    silent: 2,
    next: { zh: '等 5/14 看 88 Harbour', en: 'Awaiting 5/14 viewing · 88 Harbour' },
    last: { zh: '明确要 24h concierge', en: 'Specifically wants 24h concierge' },
  },
  {
    name: 'Kevin Tran',
    tier: 2,
    budget: '$2,800–$3,000',
    area: 'Liberty Village',
    stage: 'leased',
    silent: 1,
    next: { zh: '续约草稿 5/12 完成', en: 'Renewal draft due 5/12' },
    last: { zh: '已盖 2/4 枚章 · 12 个月按时', en: '2/4 stamps · 12 months on time' },
  },
  {
    name: 'David Z.',
    tier: 3,
    budget: '$3,400',
    area: 'Distillery District',
    stage: 'applied',
    silent: 3,
    next: { zh: '等房东回复', en: 'Awaiting landlord reply' },
    last: { zh: '5/3 提交完整申请', en: 'Full application submitted 5/3' },
  },
  {
    name: 'Priya S.',
    tier: 2,
    budget: '$2,400',
    area: 'Cabbagetown',
    stage: 'searching',
    silent: 4,
    next: { zh: `${aiName} 在配对小户型`, en: `${aiName} matching small units` },
    last: { zh: '5/2 加入', en: 'Joined 5/2' },
  },
  {
    name: 'Marcus T.',
    tier: 3,
    budget: '$3,600',
    area: 'Leslieville',
    stage: 'applied',
    silent: 3,
    next: { zh: '等房东 5/13 回复', en: 'Awaiting landlord reply 5/13' },
    last: { zh: '5/1 提交申请', en: 'Application submitted 5/1' },
  },
  {
    name: 'Sophie B.',
    tier: 1,
    budget: '$1,800',
    area: 'Bachelor / Cabbagetown',
    stage: 'searching',
    silent: 4,
    next: { zh: '提示她盖上收入章', en: 'Prompt her to earn the income stamp' },
    last: { zh: '4/30 加入', en: 'Joined 4/30' },
  },
  {
    name: 'Eric K.',
    tier: 4,
    budget: '$5,200',
    area: 'Yorkville',
    stage: 'showing',
    silent: 3,
    next: { zh: '5/13 三套连看', en: 'Three back-to-back viewings 5/13' },
    last: { zh: '只看高门槛房源', en: 'Only views high-threshold listings' },
  },
  {
    name: 'Yuki M.',
    tier: 2,
    budget: '$2,950',
    area: 'King West',
    stage: 'leased',
    silent: 1,
    next: { zh: '5/8 成交 · 租约到期 2027-05', en: 'Closed 5/8 · lease ends 2027-05' },
    last: { zh: '4/28 银行透明度通过', en: 'Bank transparency passed 4/28' },
  },
]

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
  const aiName = useAIName('agent')
  const [sortByStamps, setSortByStamps] = useState(false)
  const all = CLIENTS(aiName)
  const clients = sortByStamps ? [...all].sort((a, b) => b.tier - a.tier) : all

  const stageCount = (key: string) => all.filter((c) => c.stage === key).length
  const avgSilent = Math.round((all.reduce((s, c) => s + c.silent, 0) / all.length) * 10) / 10
  // B3 was a ghost: the alert named "Lily Zhang", who is not in this list.
  const quietest = [...all].sort((a, b) => b.silent - a.silent)[0]

  return (
    <WorkspaceShell role="agent" aside={<Aside lang={lang} quietest={quietest} />}>
      <PageHeader
        title={zh ? '客户管理' : 'Client management'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-agent">AGENT · CLIENTS</span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh
              ? `${aiName} 自动 CRM · 按阶段 / 盖章进度 / 静默天数排序`
              : `${aiName} auto-CRM · sorted by stage / stamps / days quiet`}
          </>
        }
        actions={
          <Link
            href={`/agent/agent?prompt=${encodeURIComponent(zh ? '帮我添加一位新客户，记录姓名、预算、目标区域和盖章进度' : 'Add a new client for me — name, budget, target area and stamp progress')}`}
            className="sl-btn-primary !px-4 !py-2 !text-[12.5px]"
          >
            {zh ? '+ 加客户' : '+ Add client'}
          </Link>
        }
      />

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

      {/* Screening workflow — order screening for a client, share it with the landlord */}
      <SectionCard
        className="mb-4"
        title={zh ? '替客户下单背调，报告直接给房东' : 'Order screening for a client — the report goes straight to the landlord'}
        action={
          <Link href="/screening" className="sl-btn-primary !px-4 !py-2 !text-[12px]">
            {zh ? '发起背调 →' : 'Start a screening →'}
          </Link>
        }
      >
        <ol className="space-y-1 text-[12.5px] leading-relaxed text-body-2">
          <li>{zh ? '① 上传客户的申请材料，几分钟出 6 维报告（付款能力 / 信用 / 司法记录）' : '① Upload the client’s application docs — a 6-dimension report (ability to pay / credit / court records) in minutes'}</li>
          <li>{zh ? '② 报告页链接可直接转发房东，不用截图拼图' : '② Send the report link to the landlord directly — no screenshot collages'}</li>
          <li>{zh ? '③ 客户的认证护照（四枚章）随申请一起展示，申请更有说服力' : '③ The client’s verified passport (four stamps) travels with the application and strengthens it'}</li>
        </ol>
        <Link
          href={`/agent/agent?prompt=${encodeURIComponent(zh ? '给我讲讲租客认证护照：四枚章分别验证什么，我怎么帮客户补齐，怎么转发给房东？' : 'Explain the tenant verified passport: what each of the four stamps verifies, how I help a client complete them, and how to forward it to a landlord.')}`}
          className="mt-3 inline-block rounded-[8px] border border-line-strong bg-white px-4 py-2 text-[12px] font-semibold text-body transition hover:border-brand hover:text-brand"
        >
          {zh ? '秒懂认证护照' : 'Passport in 60s'}
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
                        href="/screening"
                        className="rounded-[8px] border border-agent/40 bg-agent/[0.06] px-2.5 py-[5px] text-[11.5px] font-semibold text-agent transition hover:border-agent"
                      >
                        {zh ? '发起背调' : 'Screen'}
                      </Link>
                    ) : (
                      <Link
                        href={`/agent/agent?prompt=${encodeURIComponent(zh ? `查看 ${c.name} 的认证护照进度（已盖 ${c.tier}/4 枚章），列出还缺的章和最快补齐路径` : `Check ${c.name}'s verified passport progress (${c.tier}/4 stamps) — list the missing stamps and the fastest way to complete them`)}`}
                        className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
                      >
                        {zh ? '护照状态' : 'Passport'}
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
    </WorkspaceShell>
  )
}

function Aside({ lang, quietest }: { lang: Lang; quietest: { name: string; silent: number } }) {
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
        <div className="space-y-2 rounded-xl border border-line-divider bg-white p-3.5 text-[12.5px] text-body-2">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">RECO</span>
            <div className="font-semibold text-body">#7892341 · Toronto West</div>
          </div>
          <div>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
              {zh ? '评价' : 'Rating'}
            </span>
            <div className="font-semibold text-body">4.9★ · {zh ? '47 条评价' : '47 reviews'}</div>
          </div>
          <div>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
              {zh ? '主攻区域' : 'Focus areas'}
            </span>
            <div className="font-semibold text-body">Liberty · King West · Annex</div>
          </div>
        </div>
      </AsideBlock>

      <AsideBlock title={zh ? `${aiName} 跟进` : `${aiName} follow-ups`}>
        <div className="space-y-2">
          {[
            { who: 'Anna L.', msg: { zh: '看房后 30 min 内问反馈', en: 'Ask for feedback within 30 min of showing' }, when: { zh: '今天 14:30', en: 'Today 14:30' } },
            { who: 'Jason H.', msg: { zh: '5 套 brief 包等你审', en: '5-listing brief pack awaiting your review' }, when: { zh: '本周内', en: 'This week' } },
            { who: 'Sophie B.', msg: { zh: '提议盖上收入章', en: 'Suggest earning the income stamp' }, when: { zh: '今天', en: 'Today' } },
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
