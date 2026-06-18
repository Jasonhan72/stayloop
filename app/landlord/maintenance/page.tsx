'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useT, type Lang } from '@/lib/i18n'

/**
 * V5 ART 26 · Landlord · Maintenance
 * Tickets queue with status lanes (open / in-progress / resolved).
 */

const TICKETS = [
  {
    id: 'M-118',
    title: { zh: '厨房水龙头漏水', en: 'Kitchen faucet leaking' },
    unit: 'Unit 1207 · King West',
    tenant: 'Mia Chen',
    priority: 'high',
    category: { zh: '水电', en: 'Plumbing' },
    status: 'open',
    created: { zh: '今天 08:42', en: 'Today 08:42' },
    photos: 3,
  },
  {
    id: 'M-117',
    title: { zh: '主卧暖气不热', en: 'Master bedroom heating not working' },
    unit: '15 Hanna Ave Loft 312',
    tenant: 'Kevin Tran',
    priority: 'medium',
    category: { zh: 'HVAC', en: 'HVAC' },
    status: 'in-progress',
    created: { zh: '昨天 13:10', en: 'Yesterday 13:10' },
    photos: 1,
    assignee: { zh: 'Toronto HVAC Pros', en: 'Toronto HVAC Pros' },
    eta: '5/11',
  },
  {
    id: 'M-115',
    title: { zh: '走廊灯具更换', en: 'Hallway light fixture replacement' },
    unit: '432 Brunswick Ave',
    tenant: 'Anna L.',
    priority: 'low',
    category: { zh: '电气', en: 'Electrical' },
    status: 'in-progress',
    created: { zh: '5/3', en: '5/3' },
    photos: 0,
    assignee: { zh: '自处理', en: 'Self-handled' },
    eta: '5/12',
  },
  {
    id: 'M-110',
    title: { zh: '洗碗机不排水', en: 'Dishwasher not draining' },
    unit: 'Unit 1207 · King West',
    tenant: 'Mia Chen',
    priority: 'medium',
    category: { zh: '电器', en: 'Appliance' },
    status: 'resolved',
    created: { zh: '4/28', en: '4/28' },
    photos: 2,
    assignee: { zh: 'GE Repair', en: 'GE Repair' },
    resolvedAt: '4/30',
  },
]

const PRIORITY_STYLE: Record<string, { bg: string; fg: string; label: { zh: string; en: string } }> = {
  high: { bg: 'rgba(220,38,38,0.10)', fg: '#B91C1C', label: { zh: '紧急', en: 'Urgent' } },
  medium: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: { zh: '中等', en: 'Medium' } },
  low: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: { zh: '一般', en: 'Low' } },
}

export default function LandlordMaintenancePage() {
  const { lang } = useT()
  const open = TICKETS.filter((t) => t.status === 'open')
  const inProgress = TICKETS.filter((t) => t.status === 'in-progress')
  const resolved = TICKETS.filter((t) => t.status === 'resolved')

  return (
    <WorkspaceShell role="landlord" aside={<Aside lang={lang} />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
            LANDLORD · MAINTENANCE
          </div>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[36px]">{lang === 'zh' ? '维修工单' : 'Maintenance tickets'}</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            {lang === 'zh'
              ? '租客提交 → Logic 分类 → 你审批 → 自动派工或自处理'
              : 'Tenant submits → Logic categorizes → you approve → auto-dispatch or self-handle'}
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">{lang === 'zh' ? '+ 创建工单' : '+ Create ticket'}</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Counter label={lang === 'zh' ? '待响应' : 'Awaiting response'} value={open.length} accent="#B91C1C" sub={lang === 'zh' ? '超 4 小时未处理 · 自动升级' : 'Unhandled over 4h · auto-escalated'} />
        <Counter label={lang === 'zh' ? '处理中' : 'In progress'} value={inProgress.length} accent="#B45309" sub={lang === 'zh' ? '已派工或自处理中' : 'Dispatched or self-handled'} />
        <Counter label={lang === 'zh' ? '本月已解决' : 'Resolved this month'} value={resolved.length + 4} accent="#047857" sub={lang === 'zh' ? '平均响应 14h · 平均完成 2.1d' : 'Avg response 14h · avg completion 2.1d'} />
      </div>

      {/* Lanes */}
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <Lane title={lang === 'zh' ? '待响应' : 'Awaiting response'} eyebrow="OPEN" tickets={open} lang={lang} />
        <Lane title={lang === 'zh' ? '处理中' : 'In progress'} eyebrow="IN PROGRESS" tickets={inProgress} lang={lang} />
        <Lane title={lang === 'zh' ? '已解决（近 30 天）' : 'Resolved (last 30 days)'} eyebrow="RESOLVED" tickets={resolved} lang={lang} />
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
  lang,
}: {
  title: string
  eyebrow: string
  tickets: typeof TICKETS
  lang: Lang
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
        <div className="sl-card p-6 text-center text-[12px] text-body-3">{lang === 'zh' ? '这一栏暂时为空' : 'This lane is empty for now'}</div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <TicketCard key={t.id} t={t} lang={lang} />
          ))}
        </div>
      )}
    </div>
  )
}

function TicketCard({ t, lang }: { t: (typeof TICKETS)[number]; lang: Lang }) {
  const p = PRIORITY_STYLE[t.priority]
  return (
    <div className="sl-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
          {t.id} · {t.created[lang]}
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
          {p.label[lang]}
        </span>
      </div>
      <div className="mt-2 text-[14px] font-bold">{t.title[lang]}</div>
      <div className="mt-1 text-[12px] text-body-2">{t.unit}</div>
      <div className="mt-2 text-[11.5px] text-body-3">
        {t.tenant} · {t.category[lang]}
        {t.photos > 0 && ` · 📷 ${t.photos}`}
      </div>
      {(t as any).assignee && (
        <div className="mt-3 rounded-[8px] border border-line-divider bg-surface px-3 py-2 text-[11.5px]">
          🛠 {(t as any).assignee[lang]}
          {(t as any).eta && (
            <span className="ml-2 font-mono text-[10px] text-body-3">ETA {(t as any).eta}</span>
          )}
          {(t as any).resolvedAt && (
            <span className="ml-2 font-mono text-[10px] text-success">
              {lang === 'zh' ? '完工' : 'Done'} {(t as any).resolvedAt}
            </span>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button className="flex-1 rounded-[8px] border border-line-strong bg-white py-[7px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
          {lang === 'zh' ? '打开' : 'Open'}
        </button>
        {t.status === 'open' && (
          <button className="flex-1 rounded-[8px] bg-ink py-[7px] text-[11.5px] font-semibold text-white">
            {lang === 'zh' ? '派工' : 'Dispatch'}
          </button>
        )}
      </div>
    </div>
  )
}

function Aside({ lang }: { lang: Lang }) {
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? '服务商' : 'Service providers'}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
        {lang === 'zh'
          ? 'Logic 会按工单类别自动匹配你预设的服务商，或在 Stayloop 服务商网络里推荐。'
          : 'Logic auto-matches your preset providers by ticket category, or recommends one from the Stayloop provider network.'}
      </p>
      <div className="mt-3 space-y-2">
        {[
          { name: 'Toronto HVAC Pros', cat: { zh: 'HVAC', en: 'HVAC' }, rating: 4.9 },
          { name: 'GE Repair Toronto', cat: { zh: '电器', en: 'Appliance' }, rating: 4.7 },
          { name: 'Best Plumber GTA', cat: { zh: '水电', en: 'Plumbing' }, rating: 4.8 },
        ].map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between rounded-[8px] border border-line-divider bg-white px-3 py-2 text-[12px]"
          >
            <div>
              <div className="font-bold">{s.name}</div>
              <div className="font-mono text-[9.5px] uppercase tracking-eyebrow text-body-3">
                {s.cat[lang]}
              </div>
            </div>
            <div className="text-[11px] text-body-2">★ {s.rating}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
