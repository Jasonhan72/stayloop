'use client'

import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5 ART 26 · Landlord · Maintenance
 * Tickets queue with status lanes (open / in-progress / resolved).
 */

const TICKETS = [
  {
    id: 'M-118',
    title: '厨房水龙头漏水',
    unit: '88 Harbour St #4502',
    tenant: '陈思宇',
    priority: 'high',
    category: '水电',
    status: 'open',
    created: '今天 08:42',
    photos: 3,
  },
  {
    id: 'M-117',
    title: '主卧暖气不热',
    unit: '15 Hanna Ave Loft 312',
    tenant: 'Mike Park',
    priority: 'medium',
    category: 'HVAC',
    status: 'in-progress',
    created: '昨天 13:10',
    photos: 1,
    assignee: 'Toronto HVAC Pros',
    eta: '5/11',
  },
  {
    id: 'M-115',
    title: '走廊灯具更换',
    unit: '432 Brunswick Ave',
    tenant: 'Anna L.',
    priority: 'low',
    category: '电气',
    status: 'in-progress',
    created: '5/3',
    photos: 0,
    assignee: '自处理',
    eta: '5/12',
  },
  {
    id: 'M-110',
    title: '洗碗机不排水',
    unit: '88 Harbour St #4502',
    tenant: '陈思宇',
    priority: 'medium',
    category: '电器',
    status: 'resolved',
    created: '4/28',
    photos: 2,
    assignee: 'GE Repair',
    resolvedAt: '4/30',
  },
]

const PRIORITY_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  high: { bg: 'rgba(220,38,38,0.10)', fg: '#B91C1C', label: '紧急' },
  medium: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: '中等' },
  low: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: '一般' },
}

export default function LandlordMaintenancePage() {
  const open = TICKETS.filter((t) => t.status === 'open')
  const inProgress = TICKETS.filter((t) => t.status === 'in-progress')
  const resolved = TICKETS.filter((t) => t.status === 'resolved')

  return (
    <WorkspaceShell role="landlord" aside={<Aside />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
            LANDLORD · MAINTENANCE
          </div>
          <h1 className="mt-2 text-[36px] font-bold tracking-tight">维修工单</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            租客提交 → Logic 分类 → 你审批 → 自动派工或自处理
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">+ 创建工单</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Counter label="待响应" value={open.length} accent="#B91C1C" sub="超 4 小时未处理 · 自动升级" />
        <Counter label="处理中" value={inProgress.length} accent="#B45309" sub="已派工或自处理中" />
        <Counter label="本月已解决" value={resolved.length + 4} accent="#047857" sub="平均响应 14h · 平均完成 2.1d" />
      </div>

      {/* Lanes */}
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <Lane title="待响应" eyebrow="OPEN" tickets={open} />
        <Lane title="处理中" eyebrow="IN PROGRESS" tickets={inProgress} />
        <Lane title="已解决（近 30 天）" eyebrow="RESOLVED" tickets={resolved} />
      </div>
    </WorkspaceShell>
  )
}

function Counter({
  label,
  value,
  accent,
  sub,
}: {
  label: string
  value: number
  accent: string
  sub: string
}) {
  return (
    <div className="sl-card p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {label}
      </div>
      <div className="mt-1 text-[28px] font-extrabold tracking-tight" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-body-2">{sub}</div>
    </div>
  )
}

function Lane({
  title,
  eyebrow,
  tickets,
}: {
  title: string
  eyebrow: string
  tickets: typeof TICKETS
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
            {eyebrow}
          </div>
          <h3 className="text-[16px] font-bold tracking-tight">
            {title} · {tickets.length}
          </h3>
        </div>
      </div>
      {tickets.length === 0 ? (
        <div className="sl-card p-6 text-center text-[12px] text-body-3">这一栏暂时为空</div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <TicketCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function TicketCard({ t }: { t: (typeof TICKETS)[number] }) {
  const p = PRIORITY_STYLE[t.priority]
  return (
    <div className="sl-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
          {t.id} · {t.created}
        </div>
        <span
          className="font-mono"
          style={{
            background: p.bg,
            color: p.fg,
            padding: '2px 7px',
            borderRadius: 4,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.10em',
          }}
        >
          {p.label}
        </span>
      </div>
      <div className="mt-2 text-[14px] font-bold">{t.title}</div>
      <div className="mt-1 text-[12px] text-body-2">{t.unit}</div>
      <div className="mt-2 text-[11.5px] text-body-3">
        {t.tenant} · {t.category}
        {t.photos > 0 && ` · 📷 ${t.photos}`}
      </div>
      {(t as any).assignee && (
        <div className="mt-3 rounded-[8px] border border-line-divider bg-surface px-3 py-2 text-[11.5px]">
          🛠 {(t as any).assignee}
          {(t as any).eta && (
            <span className="ml-2 font-mono text-[10px] text-body-3">ETA {(t as any).eta}</span>
          )}
          {(t as any).resolvedAt && (
            <span className="ml-2 font-mono text-[10px] text-success">
              完工 {(t as any).resolvedAt}
            </span>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button className="flex-1 rounded-[8px] border border-line-strong bg-white py-[7px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
          打开
        </button>
        {t.status === 'open' && (
          <button className="flex-1 rounded-[8px] bg-ink py-[7px] text-[11.5px] font-semibold text-white">
            派工
          </button>
        )}
      </div>
    </div>
  )
}

function Aside() {
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        服务商
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
        Logic 会按工单类别自动匹配你预设的服务商，或在 Stayloop 服务商网络里推荐。
      </p>
      <div className="mt-3 space-y-2">
        {[
          { name: 'Toronto HVAC Pros', cat: 'HVAC', rating: 4.9 },
          { name: 'GE Repair Toronto', cat: '电器', rating: 4.7 },
          { name: 'Best Plumber GTA', cat: '水电', rating: 4.8 },
        ].map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between rounded-[8px] border border-line-divider bg-white px-3 py-2 text-[12px]"
          >
            <div>
              <div className="font-bold">{s.name}</div>
              <div className="font-mono text-[9.5px] uppercase tracking-eyebrow text-body-3">
                {s.cat}
              </div>
            </div>
            <div className="text-[11px] text-body-2">★ {s.rating}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
