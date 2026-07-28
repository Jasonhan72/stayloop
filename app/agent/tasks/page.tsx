'use client'

import { useMemo, useState } from 'react'
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
  type PillTone,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'
import { demoSession } from '@/lib/agent/demo'
import { FIELD_WEEK, SHOWING_FEE, WEEK_UNSETTLED_FEES, money } from '@/lib/demo/agentBook'

/**
 * V5 ART 14 / 49 · Agent · Tasks — layout follows design/v9-workspace-finance.html.
 *
 * Two things the queue never showed even though agent_tasks carries them:
 * `payout_cents` (a dispatched showing is paid work) and the
 * `authorized_actions` / `unauthorized_actions` pair (the RECO compliance
 * lifeline). Both are on the row now; the authorization copy is reused from
 * the agent's pending action in lib/agent/demo.ts rather than re-written here.
 */

interface TaskRow {
  id: string
  type: 'showing' | 'screening' | 'package' | 'lease'
  showingSlug?: string
  title: { zh: string; en: string }
  client: { zh: string; en: string }
  sla: { zh: string; en: string }
  priority: 'now' | 'high' | 'medium' | 'low'
  note: { zh: string; en: string }
  /** Flat fee for a dispatched showing (agent_tasks.payout_cents); null = internal work. */
  payoutCents: number | null
}

const TASKS = (aiName: string): TaskRow[] => [
  {
    id: 'T-301',
    type: 'showing',
    showingSlug: 'sh-1207-mia',
    title: { zh: '今天 11:00 · Unit 1207 · King West 看房', en: 'Today 11:00 · Unit 1207 · King West showing' },
    client: { zh: 'Mia Chen · Tenant', en: 'Mia Chen · Tenant' },
    sla: { zh: '1h 后开始', en: 'Starts in 1h' },
    priority: 'now',
    note: { zh: '客户已盖 3/4 枚章 · 看房后 30 min 内反馈', en: 'Client has 3/4 stamps · feedback within 30 min of showing' },
    payoutCents: SHOWING_FEE * 100,
  },
  {
    id: 'T-298',
    type: 'screening',
    title: { zh: '完成 Kevin Tran 收入复核', en: 'Complete Kevin Tran income re-check' },
    client: { zh: 'Kevin Tran · Tenant', en: 'Kevin Tran · Tenant' },
    sla: { zh: '今天前', en: 'By today' },
    priority: 'high',
    note: { zh: '4/29 银行流水已上传，等你确认', en: 'Bank statements uploaded 4/29, awaiting your confirmation' },
    payoutCents: null,
  },
  {
    id: 'T-295',
    type: 'package',
    title: { zh: '3 套备选 — Jason 客户 brief 包', en: '3 options — Jason client brief pack' },
    client: { zh: 'Jason H. · Tenant', en: 'Jason H. · Tenant' },
    sla: { zh: '本周内', en: 'This week' },
    priority: 'medium',
    note: { zh: `客户预算 $3.2k–$3.6k · 已盖 2/4 枚章 · 1B+den · ${aiName} 已筛出 5 套`, en: `Client budget $3.2k–$3.6k · 2/4 stamps · 1B+den · ${aiName} shortlisted 5` },
    payoutCents: null,
  },
  {
    id: 'T-291',
    type: 'lease',
    title: { zh: '房东 AI 草稿 → 你审 → 发租客签字', en: "Landlord's AI drafts → you review → send to tenant for signing" },
    client: { zh: '15 Hanna Ave · Kevin Tran 续约', en: '15 Hanna Ave · Kevin Tran renewal' },
    sla: { zh: '5/12 前', en: 'By 5/12' },
    priority: 'medium',
    note: { zh: 'Ontario LTB 租约 + AI 风险审查通过', en: 'Ontario LTB lease + AI risk review passed' },
    payoutCents: null,
  },
  {
    id: 'T-285',
    type: 'showing',
    showingSlug: 'sh-harbour-lisa',
    title: { zh: '5/14 11:00 · 88 Harbour St #4502 看房', en: '5/14 11:00 · 88 Harbour St #4502 showing' },
    client: { zh: 'Lisa W. · Tenant', en: 'Lisa W. · Tenant' },
    sla: { zh: '2 天后', en: 'In 2 days' },
    priority: 'low',
    note: { zh: '客户已完成盖章验证', en: 'Client has verified stamps' },
    payoutCents: SHOWING_FEE * 100,
  },
]

const PRIORITY: Record<string, { tone: PillTone; label: string }> = {
  now: { tone: 'danger', label: 'NOW' },
  high: { tone: 'danger', label: 'HIGH' },
  medium: { tone: 'warn', label: 'MED' },
  low: { tone: 'ok', label: 'LOW' },
}

const TYPE_ICON: Record<string, string> = {
  showing: '🔑',
  screening: '🪪',
  package: '📦',
  lease: '✍️',
}

const TYPE_LABEL: Record<string, { zh: string; en: string }> = {
  showing: { zh: '带看', en: 'Showing' },
  screening: { zh: '背调复核', en: 'Screening' },
  package: { zh: 'brief 包', en: 'Brief pack' },
  lease: { zh: '租约', en: 'Lease' },
}

/** Closed out this week — the queue only ever showed live rows. */
const HISTORY = [
  {
    id: 'T-284',
    type: 'showing',
    client: 'Eric K.',
    when: { zh: '5/9 15:30 完成', en: 'Completed 5/9 15:30' },
    payout: money(SHOWING_FEE),
    status: { tone: 'ok' as PillTone, label: { zh: '已结算', en: 'Settled' } },
  },
  {
    id: 'T-279',
    type: 'package',
    client: 'Priya S.',
    when: { zh: '已延期至 5/15', en: 'Deferred to 5/15' },
    payout: '—',
    status: { tone: 'warn' as PillTone, label: { zh: '已延期', en: 'Deferred' } },
  },
]

export default function AgentTasksPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('agent')
  const filters = zh
    ? ['全部', '看房', '审核', '租约', 'brief 包']
    : ['All', 'Showings', 'Screening', 'Leases', 'Prep packs']
  const FILTER_TYPES = [null, 'showing', 'screening', 'lease', 'package'] as const
  const [filterIdx, setFilterIdx] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  const all = TASKS(aiName)
  const visibleTasks = all.filter((t) => FILTER_TYPES[filterIdx] === null || t.type === FILTER_TYPES[filterIdx])
  const nowCount = all.filter((t) => t.priority === 'now').length

  // The authorized / not-authorized Q&A boundary is canon copy — reuse the
  // agent's pending action instead of writing a second version of it.
  const scope = useMemo(() => {
    const action = demoSession('agent', lang).pendingActions[0]
    return {
      allowed: action?.data_scope ?? [],
      denied: action?.excluded_data ?? [],
    }
  }, [lang])

  return (
    <WorkspaceShell role="agent" aside={<Aside lang={lang} />}>
      <PageHeader
        title={zh ? '任务队列' : 'Task queue'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-agent">AGENT · TASKS</span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh
              ? `${aiName} 按 SLA 排序 · 每单标注报酬与授权回答边界`
              : `${aiName} sorts by SLA · each row shows its fee and the authorized-answer boundary`}
          </>
        }
        actions={
          <Link
            href={`/agent/agent?prompt=${encodeURIComponent(zh ? '帮我创建一个新任务，排进今天的队列' : 'Create a new task for me and slot it into today’s queue')}`}
            className="sl-btn-primary !px-4 !py-2 !text-[12.5px]"
          >
            {zh ? '+ 新任务' : '+ New task'}
          </Link>
        }
      />

      <StatStrip
        stats={[
          {
            label: zh ? '今日任务' : 'Tasks today',
            value: String(all.length),
            sub: zh ? '平均响应 11 min' : 'Avg response 11 min',
          },
          {
            label: 'NOW',
            value: String(nowCount),
            sub: zh ? '1 小时内开始' : 'Starts within the hour',
            tone: 'down',
          },
          {
            label: zh ? '本周完成' : 'Done this week',
            value: '12',
            sub: zh ? '完成率 94%' : 'Completion rate 94%',
            tone: 'up',
          },
          {
            label: zh ? '待结带看费' : 'Showing fees unsettled',
            value: money(WEEK_UNSETTLED_FEES),
            sub: zh
              ? `${FIELD_WEEK.unsettledShowings} 场 × ${money(SHOWING_FEE)} · 完成确认后结算`
              : `${FIELD_WEEK.unsettledShowings} × ${money(SHOWING_FEE)} · settles after confirmation`,
            tone: 'warn',
          },
        ]}
      />

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {filters.map((f, i) => (
          <button
            key={f}
            onClick={() => setFilterIdx(i)}
            aria-pressed={i === filterIdx}
            className={
              'rounded-[8px] border px-3 py-[6px] text-[12.5px] font-semibold transition ' +
              (i === filterIdx
                ? 'border-ink bg-ink text-white'
                : 'border-line-strong bg-white text-body hover:border-brand hover:text-brand')
            }
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
          <span>{zh ? '排序' : 'Sort'}</span>
          <span className="text-body underline">SLA ↑</span>
        </div>
      </div>

      <SectionCard
        padded={false}
        title={zh ? '待办' : 'Open tasks'}
        meta={zh ? `${visibleTasks.length} 项` : `${visibleTasks.length} items`}
      >
        {visibleTasks.length === 0 ? (
          <EmptyState>{zh ? '这个筛选下没有任务' : 'No tasks under this filter'}</EmptyState>
        ) : (
          visibleTasks.map((t, i) => {
            const p = PRIORITY[t.priority]
            const open = openId === t.id
            return (
              <div key={t.id} className={i > 0 ? 'border-t border-line-divider' : ''}>
                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-3.5 sm:gap-4">
                  <div className="text-[18px]">{TYPE_ICON[t.type]}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={p.tone}>{p.label}</StatusPill>
                      <span className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                        {t.id} · {t.sla[lang]}
                      </span>
                      <span className="font-mono text-[10.5px] font-bold text-body-2">
                        {t.payoutCents
                          ? `${money(t.payoutCents / 100)} · ${TYPE_LABEL[t.type][lang]}`
                          : zh
                            ? '内部任务 · 无独立报酬'
                            : 'Internal task · no separate fee'}
                      </span>
                    </div>
                    <div className="mt-1 text-[13.5px] font-bold">{t.title[lang]}</div>
                    <div className="text-[12px] text-body-2">{t.client[lang]}</div>
                    <div className="mt-0.5 text-[11.5px] text-body-3">{t.note[lang]}</div>
                    <button
                      onClick={() => setOpenId(open ? null : t.id)}
                      aria-expanded={open}
                      className="mt-1.5 text-[11.5px] font-semibold text-agent underline underline-offset-2"
                    >
                      {open
                        ? zh ? '收起授权边界' : 'Hide answer boundary'
                        : zh ? '查看授权回答边界' : 'Show answer boundary'}
                    </button>
                    {open && (
                      <div className="mt-2 grid gap-2 rounded-[10px] border border-line-divider bg-surface-chip p-3 sm:grid-cols-2">
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-success">
                            {zh ? '可答' : 'Authorized'}
                          </div>
                          <ul className="mt-1 space-y-1 text-[11.5px] leading-relaxed text-body-2">
                            {scope.allowed.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-danger">
                            {zh ? '不可答' : 'Not authorized'}
                          </div>
                          <ul className="mt-1 space-y-1 text-[11.5px] leading-relaxed text-body-2">
                            {scope.denied.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        <p className="text-[11px] text-body-3 sm:col-span-2">
                          {zh
                            ? '越界的问题请走 Stayloop 流程转给房东 —— RECO 合规要求。'
                            : 'Anything outside this list routes to the landlord through Stayloop — a RECO compliance requirement.'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {t.type === 'showing' && t.showingSlug ? (
                      <Link
                        href={`/agent/showings/${t.showingSlug}`}
                        className="rounded-[8px] bg-ink px-3 py-[7px] text-center text-[11.5px] font-semibold text-white"
                      >
                        {zh ? '看房现场 →' : 'Showing live →'}
                      </Link>
                    ) : t.type === 'screening' ? (
                      <Link
                        href="/screening"
                        className="rounded-[8px] bg-ink px-3 py-[7px] text-center text-[11.5px] font-semibold text-white"
                      >
                        {zh ? '打开背调 →' : 'Open screening →'}
                      </Link>
                    ) : (
                      <Link
                        href={`/agent/agent?prompt=${encodeURIComponent(zh ? `开始任务 ${t.id}「${t.title.zh}」，带我过一遍要做的事` : `Start task ${t.id} "${t.title.en}" — walk me through what's needed`)}`}
                        className="rounded-[8px] bg-ink px-3 py-[7px] text-center text-[11.5px] font-semibold text-white"
                      >
                        {zh ? '开始' : 'Start'}
                      </Link>
                    )}
                    <Link
                      href={`/agent/agent?prompt=${encodeURIComponent(zh ? `帮我把任务 ${t.id}「${t.title.zh}」延期，并通知相关客户` : `Defer task ${t.id} "${t.title.en}" and notify the client involved`)}`}
                      className="rounded-[8px] border border-line-strong bg-white px-3 py-[7px] text-center text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
                    >
                      {zh ? '延期' : 'Defer'}
                    </Link>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </SectionCard>

      <SectionCard
        className="mt-4"
        padded={false}
        title={zh ? '已完成 / 已延期' : 'Completed / deferred'}
        meta={zh ? '本周' : 'This week'}
      >
        <Table
          head={[
            zh ? '任务' : 'Task',
            zh ? '类型' : 'Type',
            zh ? '客户' : 'Client',
            zh ? '时间' : 'When',
            zh ? '报酬' : 'Fee',
            zh ? '状态' : 'Status',
          ]}
        >
          {HISTORY.map((h) => (
            <Tr key={h.id}>
              <Td mono strong>{h.id}</Td>
              <Td align="right" muted>{TYPE_LABEL[h.type][lang]}</Td>
              <Td align="right">{h.client}</Td>
              <Td align="right" muted>{h.when[lang]}</Td>
              <Td align="right" mono>{h.payout}</Td>
              <Td align="right">
                <StatusPill tone={h.status.tone}>{h.status.label[lang]}</StatusPill>
              </Td>
            </Tr>
          ))}
        </Table>
      </SectionCard>
    </WorkspaceShell>
  )
}

function Aside({ lang }: { lang: Lang }) {
  const zh = lang === 'zh'
  const aiName = useAIName('agent')
  const route = [
    { time: '09:30', where: { zh: '训练点', en: 'Training spot' }, leg: null as string | null },
    { time: '11:00', where: { zh: 'Unit 1207 · King West 带看', en: 'Unit 1207 · King West showing' }, leg: '12 min' },
    { time: '16:00', where: { zh: 'King West 租约签字', en: 'King West lease signing' }, leg: '8 min' },
  ]
  const commute = 20

  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive
          role="agent"
          variant="rail"
          insights={[
            {
              text: {
                zh: '11:00 King West 带看的材料包已备好，但你还没确认。出发前 {ai} 可以带你过一遍授权问答边界。',
                en: 'The 11am King West showing pack is ready but unconfirmed. {ai} can run you through the authorized-Q&A boundaries before you leave.',
              },
              action: {
                label: { zh: '过一遍材料包', en: 'Review the pack' },
                prompt: {
                  zh: '帮我过一遍今天 11:00 King West 带看的材料包和授权问答边界。',
                  en: "Walk me through today's 11am King West showing pack and the authorized Q&A boundaries.",
                },
              },
            },
          ]}
        />
      </AsideBlock>

      <AsideBlock title={zh ? '今日路线' : "Today's route"}>
        <div className="rounded-xl border border-line-divider bg-white p-3.5">
          <ol className="space-y-2">
            {route.map((r, i) => (
              <li key={r.time} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="font-mono text-[11px] text-body-3">{i + 1}</span>
                <span className="font-mono text-[11.5px] font-bold">{r.time}</span>
                <span className="min-w-0 flex-1 text-body-2">{r.where[lang]}</span>
                {r.leg && <span className="font-mono text-[10.5px] text-body-3">{r.leg}</span>}
              </li>
            ))}
          </ol>
          <div className="mt-2.5 border-t border-line-divider pt-2 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
            {zh ? `总通勤 ${commute} min · 示范数据` : `${commute} min total commute · sample data`}
          </div>
        </div>
      </AsideBlock>

      <AsideBlock title={zh ? '本周节奏' : "This week's pace"}>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { l: { zh: '本周完成', en: 'Done this week' }, v: '12' },
            { l: { zh: '完成率', en: 'Completion rate' }, v: '94%' },
            { l: { zh: '平均响应', en: 'Avg response' }, v: '11min' },
            { l: { zh: '客户净推荐', en: 'Client NPS' }, v: '+62' },
          ].map((s) => (
            <div key={s.l.en} className="rounded-[10px] border border-line-divider bg-white p-2.5">
              <div className="font-mono text-[9.5px] uppercase tracking-eyebrow text-body-3">{s.l[lang]}</div>
              <div className="mt-0.5 text-[17px] font-extrabold tracking-tight">{s.v}</div>
            </div>
          ))}
        </div>
      </AsideBlock>

      <AsideBlock title={zh ? `${aiName} 提示` : `${aiName} tips`}>
        <div className="space-y-2 text-[12.5px] leading-relaxed text-body-2">
          <p>
            {zh
              ? '🪪 Kevin Tran 的银行流水里有一笔大额可疑存款，建议在确认前问一下。'
              : '🪪 Kevin Tran’s bank statements show a large suspicious deposit — worth asking before you confirm.'}
          </p>
          <p>
            {zh
              ? '📦 Jason 客户 — Liberty Village 没有匹配的 1B+den，可能要扩大到 King West。'
              : '📦 Jason client — no matching 1B+den in Liberty Village; may need to widen to King West.'}
          </p>
          <p>
            {zh
              ? '🔑 带看费按场结算（$80/场），完成反馈表后进入结算队列。'
              : '🔑 Showing fees are per visit ($80); submitting the feedback form moves one into the settlement queue.'}
          </p>
        </div>
      </AsideBlock>
    </div>
  )
}
