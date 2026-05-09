'use client'

import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5 Agent · Clients
 * CRM-style table grouped by stage: searching / showing / applied / leased.
 */

const STAGES = [
  { key: 'searching', label: '寻房中', count: 4, accent: '#7C3AED' },
  { key: 'showing', label: '看房安排', count: 2, accent: '#2563EB' },
  { key: 'applied', label: '已申请', count: 3, accent: '#B45309' },
  { key: 'leased', label: '已成交', count: 1, accent: '#047857' },
]

const CLIENTS = [
  {
    name: 'Anna L.',
    tier: 3,
    budget: '$3,800–$4,500',
    area: 'The Annex / Forest Hill',
    stage: 'showing',
    next: '今天 14:00 · 432 Brunswick',
    last: '昨晚和 Brief 聊了 30 min',
  },
  {
    name: 'Jason H.',
    tier: 2,
    budget: '$3,200–$3,600',
    area: 'King West / Liberty Village',
    stage: 'searching',
    next: 'Brief 在筛选 5 套备选',
    last: '5/4 给了 brief 包',
  },
  {
    name: 'Lisa W.',
    tier: 4,
    budget: '$4,500+',
    area: 'Yorkville',
    stage: 'searching',
    next: '等 5/11 看 88 Harbour',
    last: '明确要 24h concierge',
  },
  {
    name: 'Mike Park',
    tier: 2,
    budget: '$2,800–$3,000',
    area: 'Liberty Village',
    stage: 'leased',
    next: '续约草稿 5/12 完成',
    last: 'Tier 2 · 12 个月按时',
  },
  {
    name: 'David Z.',
    tier: 3,
    budget: '$3,400',
    area: 'Distillery District',
    stage: 'applied',
    next: '等房东回复',
    last: '5/3 提交完整申请',
  },
  {
    name: 'Priya S.',
    tier: 2,
    budget: '$2,400',
    area: 'Cabbagetown',
    stage: 'searching',
    next: 'Brief 在配对小户型',
    last: '5/2 加入',
  },
  {
    name: 'Marcus T.',
    tier: 3,
    budget: '$3,600',
    area: 'Leslieville',
    stage: 'applied',
    next: '等房东 5/10 回复',
    last: '5/1 提交申请',
  },
  {
    name: 'Sophie B.',
    tier: 1,
    budget: '$1,800',
    area: 'Bachelor / Cabbagetown',
    stage: 'searching',
    next: '提示她升级到 Tier 2',
    last: '4/30 加入',
  },
  {
    name: 'Eric K.',
    tier: 4,
    budget: '$5,200',
    area: 'Yorkville',
    stage: 'showing',
    next: '5/13 三套连看',
    last: '只看高 Tier 房源',
  },
  {
    name: 'Yuki M.',
    tier: 2,
    budget: '$2,950',
    area: 'King West',
    stage: 'applied',
    next: '已签草约',
    last: '4/28 银行透明度通过',
  },
]

const STAGE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  searching: { bg: 'rgba(124,58,237,0.10)', fg: '#5B21B6', label: '寻房中' },
  showing: { bg: 'rgba(37,99,235,0.10)', fg: '#1E3A8A', label: '看房中' },
  applied: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: '已申请' },
  leased: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: '已成交' },
}

export default function AgentClientsPage() {
  return (
    <WorkspaceShell role="agent" aside={<Aside />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
            AGENT · CLIENTS
          </div>
          <h1 className="mt-2 text-[36px] font-bold tracking-tight">客户管理</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            Brief 自动 CRM · 按阶段 / Tier / 预算分组 · 跟进自动安排
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">+ 加客户</button>
      </div>

      {/* Stage chips */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {STAGES.map((s) => (
          <div key={s.key} className="sl-card p-4">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {s.label}
            </div>
            <div className="mt-1 text-[24px] font-extrabold" style={{ color: s.accent }}>
              {s.count}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2">
        <input
          placeholder="搜索客户 / 区域 / Tier"
          className="flex-1 rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] outline-none focus:border-brand"
        />
        <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
          按 Tier ▾
        </button>
      </div>

      {/* Client table */}
      <div className="sl-card overflow-hidden">
        <table className="w-full text-[13.5px]">
          <thead className="bg-surface-chip">
            <tr>
              <Th>客户</Th>
              <Th>Tier</Th>
              <Th>预算 · 区域</Th>
              <Th>阶段</Th>
              <Th>下一步</Th>
              <Th right>—</Th>
            </tr>
          </thead>
          <tbody>
            {CLIENTS.map((c) => {
              const ss = STAGE_STYLE[c.stage]
              return (
                <tr
                  key={c.name}
                  className="border-t border-line-divider transition hover:bg-surface-chip/40"
                >
                  <td className="px-6 py-3">
                    <div className="text-[13px] font-bold">{c.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                      {c.last}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`tier-badge t${c.tier}`}>T{c.tier}</span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="font-bold">{c.budget}</div>
                    <div className="text-[12px] text-body-2">{c.area}</div>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="font-mono"
                      style={{
                        background: ss.bg,
                        color: ss.fg,
                        padding: '2px 7px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.10em',
                      }}
                    >
                      {ss.label}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-[12.5px] text-body-2">{c.next}</td>
                  <td className="px-6 py-3 text-right">
                    <button className="rounded-[8px] border border-line-strong bg-white px-3 py-[6px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
                      打开
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </WorkspaceShell>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={
        'px-6 py-3 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3 ' +
        (right ? 'text-right' : 'text-left')
      }
    >
      {children}
    </th>
  )
}

function Aside() {
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        Brief 跟进
      </div>
      <div className="mt-3 space-y-3">
        {[
          { who: 'Anna L.', msg: '看房后 30 min 内问反馈', when: '今天 14:30' },
          { who: 'Jason H.', msg: '5 套 brief 包等你审', when: '本周内' },
          { who: 'Sophie B.', msg: '提议升级到 Tier 2', when: '今天' },
          { who: 'Mike Park', msg: '续约草稿审阅', when: '5/12 前' },
        ].map((f, i) => (
          <div key={i} className="rounded-[10px] border border-line-divider bg-white p-3">
            <div className="text-[13px] font-bold">{f.who}</div>
            <div className="mt-1 text-[12px] text-body-2">{f.msg}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
              {f.when}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
