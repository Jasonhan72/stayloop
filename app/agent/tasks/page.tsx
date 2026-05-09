'use client'

import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5 ART 14 / 49 · Agent · Tasks
 * Task queue with filters and SLA banner.
 */

const TASKS = [
  {
    id: 'T-301',
    type: 'showing',
    title: '今天 14:00 · 432 Brunswick Ave 看房',
    client: 'Anna L. · Tenant',
    sla: '1h 后开始',
    priority: 'now',
    note: '客户 Tier 3 · 看房后 30 min 内反馈',
  },
  {
    id: 'T-298',
    type: 'screening',
    title: '完成 Mike Park 收入复核',
    client: 'Mike Park · Tenant',
    sla: '今天前',
    priority: 'high',
    note: '4/29 银行流水已上传，等你确认',
  },
  {
    id: 'T-295',
    type: 'package',
    title: '3 套备选 — Jason 客户 brief 包',
    client: 'Jason H. · Tenant',
    sla: '本周内',
    priority: 'medium',
    note: '客户预算 $3.2k–$3.6k · Tier 2 · 1B+den',
  },
  {
    id: 'T-291',
    type: 'lease',
    title: 'Logic 草稿 → 你审 → 发租客签字',
    client: '15 Hanna Ave · Mike Park 续约',
    sla: '5/12 前',
    priority: 'medium',
    note: 'OREA Form 400 + Logic 风险审查通过',
  },
  {
    id: 'T-285',
    type: 'showing',
    title: '5/11 11:00 · 88 Harbour St #4502 看房',
    client: 'Lisa W. · Tenant',
    sla: '2 天后',
    priority: 'low',
    note: '客户已通过 Tier 验证',
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
  return (
    <WorkspaceShell role="agent" aside={<Aside />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
            AGENT · TASKS
          </div>
          <h1 className="mt-2 text-[36px] font-bold tracking-tight">任务队列</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            Brief 按 SLA 排序 — 越上面越紧急。完成一个就消失一个。
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">+ 新任务</button>
      </div>

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {['全部', '看房', '审核', '租约', 'brief 包'].map((f, i) => (
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
          <span>排序</span>
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
          1 个任务 1 小时内开始（看房）— Brief 已自动生成路线和客户档案。
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
                'grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-4 transition hover:bg-surface-chip/40 ' +
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
                    {t.id} · {t.sla}
                  </span>
                </div>
                <div className="mt-1 text-[14px] font-bold">{t.title}</div>
                <div className="text-[12px] text-body-2">{t.client}</div>
                <div className="mt-1 text-[11.5px] text-body-3">{t.note}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button className="rounded-[8px] bg-ink px-3 py-[7px] text-[11.5px] font-semibold text-white">
                  开始
                </button>
                <button className="rounded-[8px] border border-line-strong bg-white px-3 py-[7px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
                  延期
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
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        本周节奏
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[
          { l: '今日任务', v: '5', acc: '#1E3A8A' },
          { l: '完成率', v: '94%', acc: '#047857' },
          { l: '平均响应', v: '11min', acc: '#B45309' },
          { l: '客户净推荐', v: '+62', acc: '#7C3AED' },
        ].map((s) => (
          <div key={s.l} className="sl-card p-3">
            <div className="font-mono text-[9.5px] uppercase tracking-eyebrow text-body-3">
              {s.l}
            </div>
            <div className="mt-1 text-[18px] font-extrabold" style={{ color: s.acc }}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-7 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        Brief 提示
      </div>
      <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
        <p>📍 14:00 看房在 The Annex — 离你 09:30 训练点 8 min。</p>
        <p>🪪 Mike Park 的银行流水里有一笔大额可疑存款，建议在确认前问一下。</p>
        <p>📦 Jason 客户 — Liberty Village 没有匹配的 1B+den，可能要扩大到 King West。</p>
      </div>
    </div>
  )
}
