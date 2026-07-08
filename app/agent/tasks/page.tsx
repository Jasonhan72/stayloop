'use client'

import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'

/**
 * V5 ART 14 / 49 · Agent · Tasks
 * Task queue with filters and SLA banner.
 */

const TASKS = [
  {
    id: 'T-301',
    type: 'showing',
    showingSlug: 'sh-1207-mia',
    title: { zh: '今天 14:00 · Unit 1207 · King West 看房', en: 'Today 14:00 · Unit 1207 · King West showing' },
    client: { zh: 'Mia Chen · Tenant', en: 'Mia Chen · Tenant' },
    sla: { zh: '1h 后开始', en: 'Starts in 1h' },
    priority: 'now',
    note: { zh: '客户 认证 2 级 · 看房后 30 min 内反馈', en: 'Client Tier 2 · feedback within 30 min of showing' },
  },
  {
    id: 'T-298',
    type: 'screening',
    title: { zh: '完成 Kevin Tran 收入复核', en: 'Complete Kevin Tran income re-check' },
    client: { zh: 'Kevin Tran · Tenant', en: 'Kevin Tran · Tenant' },
    sla: { zh: '今天前', en: 'By today' },
    priority: 'high',
    note: { zh: '4/29 银行流水已上传，等你确认', en: 'Bank statements uploaded 4/29, awaiting your confirmation' },
  },
  {
    id: 'T-295',
    type: 'package',
    title: { zh: '3 套备选 — Jason 客户 brief 包', en: '3 options — Jason client brief pack' },
    client: { zh: 'Jason H. · Tenant', en: 'Jason H. · Tenant' },
    sla: { zh: '本周内', en: 'This week' },
    priority: 'medium',
    note: { zh: '客户预算 $3.2k–$3.6k · 认证 2 级 · 1B+den', en: 'Client budget $3.2k–$3.6k · Tier 2 · 1B+den' },
  },
  {
    id: 'T-291',
    type: 'lease',
    title: { zh: 'Logic 草稿 → 你审 → 发租客签字', en: 'Logic drafts → you review → send to tenant for signing' },
    client: { zh: '15 Hanna Ave · Kevin Tran 续约', en: '15 Hanna Ave · Kevin Tran renewal' },
    sla: { zh: '5/12 前', en: 'By 5/12' },
    priority: 'medium',
    note: { zh: 'Ontario LTB 租约 + Logic 风险审查通过', en: 'Ontario LTB lease + Logic risk review passed' },
  },
  {
    id: 'T-285',
    type: 'showing',
    showingSlug: 'sh-harbour-lisa',
    title: { zh: '5/11 11:00 · 88 Harbour St #4502 看房', en: '5/11 11:00 · 88 Harbour St #4502 showing' },
    client: { zh: 'Lisa W. · Tenant', en: 'Lisa W. · Tenant' },
    sla: { zh: '2 天后', en: 'In 2 days' },
    priority: 'low',
    note: { zh: '客户已通过 认证级别 验证', en: 'Client has passed Tier verification' },
  },
]

const PRIORITY_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  now: { bg: '#171717', fg: '#fff', label: 'NOW' },
  high: { bg: 'rgba(220,38,38,0.10)', fg: '#B91C1C', label: 'HIGH' },
  medium: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: 'MED' },
  low: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: 'LOW' },
}

const TYPE_ICON: Record<string, string> = {
  showing: '🔑',
  screening: '🪪',
  package: '📦',
  lease: '✍️',
}

export default function AgentTasksPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const filters = zh
    ? ['全部', '看房', '审核', '租约', 'brief 包']
    : ['All', 'Showings', 'Screening', 'Leases', 'Brief packs']
  return (
    <WorkspaceShell role="agent" aside={<Aside />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
            AGENT · TASKS
          </div>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[36px]">{zh ? '任务队列' : 'Task queue'}</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            {zh ? 'Brief 按 SLA 排序 — 越上面越紧急。完成一个就消失一个。' : 'Brief sorts by SLA — the higher up, the more urgent. Finish one and it disappears.'}
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">{zh ? '+ 新任务' : '+ New task'}</button>
      </div>

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {filters.map((f, i) => (
          <button
            key={f}
            className={
              'rounded-[8px] border px-3 py-[6px] text-[12.5px] font-semibold transition ' +
              (i === 0
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

      {/* SLA banner */}
      <div
        className="mb-5 flex items-center gap-3 rounded-[12px] border px-5 py-4 text-[13px]"
        style={{ background: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.30)' }}
      >
        <span className="font-mono font-bold" style={{ color: '#B91C1C' }}>
          ⚡ NOW
        </span>
        <span className="text-body-2">
          {zh ? '1 个任务 1 小时内开始（看房）— Brief 已自动生成路线和客户档案。' : '1 task starts within the hour (showing) — Brief has auto-generated the route and client profile.'}
        </span>
      </div>

      {/* Task list */}
      <div className="sl-card overflow-hidden">
        {TASKS.map((t, i) => {
          const p = PRIORITY_STYLE[t.priority]
          return (
            <div
              key={t.id}
              className={
                'grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-4 transition hover:bg-surface-chip/40 sm:gap-4 sm:px-6 ' +
                (i > 0 ? 'border-t border-line-divider' : '')
              }
            >
              <div className="text-[20px]">{TYPE_ICON[t.type]}</div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono"
                    style={{
                      background: p.bg,
                      color: p.fg,
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.10em',
                    }}
                  >
                    {p.label}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                    {t.id} · {t.sla[lang]}
                  </span>
                </div>
                <div className="mt-1 text-[14px] font-bold">{t.title[lang]}</div>
                <div className="text-[12px] text-body-2">{t.client[lang]}</div>
                <div className="mt-1 text-[11.5px] text-body-3">{t.note[lang]}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                {t.type === 'showing' && t.showingSlug ? (
                  <Link
                    href={`/agent/showings/${t.showingSlug}`}
                    className="rounded-[8px] bg-ink px-3 py-[7px] text-center text-[11.5px] font-semibold text-white"
                  >
                    {zh ? '看房现场 →' : 'Showing live →'}
                  </Link>
                ) : (
                  <button className="rounded-[8px] bg-ink px-3 py-[7px] text-[11.5px] font-semibold text-white">
                    {zh ? '开始' : 'Start'}
                  </button>
                )}
                <button className="rounded-[8px] border border-line-strong bg-white px-3 py-[7px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
                  {zh ? '延期' : 'Defer'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </WorkspaceShell>
  )
}

function Aside() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {zh ? '本周节奏' : 'This week’s pace'}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[
          { l: { zh: '今日任务', en: 'Tasks today' }, v: '5', acc: '#1E3A8A' },
          { l: { zh: '完成率', en: 'Completion rate' }, v: '94%', acc: '#047857' },
          { l: { zh: '平均响应', en: 'Avg response' }, v: '11min', acc: '#B45309' },
          { l: { zh: '客户净推荐', en: 'Client NPS' }, v: '+62', acc: '#7C3AED' },
        ].map((s) => (
          <div key={s.l.en} className="sl-card p-3">
            <div className="font-mono text-[9.5px] uppercase tracking-eyebrow text-body-3">
              {s.l[lang]}
            </div>
            <div className="mt-1 text-[18px] font-extrabold" style={{ color: s.acc }}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-7 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {zh ? 'Brief 提示' : 'Brief tips'}
      </div>
      <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
        <p>{zh ? '📍 14:00 看房在 The Annex — 离你 09:30 训练点 8 min。' : '📍 14:00 showing in The Annex — 8 min from your 09:30 training spot.'}</p>
        <p>{zh ? '🪪 Kevin Tran 的银行流水里有一笔大额可疑存款，建议在确认前问一下。' : '🪪 Kevin Tran’s bank statements show a large suspicious deposit — worth asking before you confirm.'}</p>
        <p>{zh ? '📦 Jason 客户 — Liberty Village 没有匹配的 1B+den，可能要扩大到 King West。' : '📦 Jason client — no matching 1B+den in Liberty Village; may need to widen to King West.'}</p>
      </div>
    </div>
  )
}
