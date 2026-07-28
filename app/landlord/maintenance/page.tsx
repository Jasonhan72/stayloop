'use client'

import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
  EmptyState,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
  type PillTone,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'

/**
 * V5 ART 26 · Landlord · Maintenance
 * Tickets queue with status lanes (open / in-progress / resolved).
 * Layout follows design/v9-workspace-finance.html.
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

// Priority maps onto the shared status vocabulary — labels unchanged.
const PRIORITY_STYLE: Record<string, { tone: PillTone; label: { zh: string; en: string } }> = {
  high: { tone: 'danger', label: { zh: '紧急', en: 'Urgent' } },
  medium: { tone: 'warn', label: { zh: '中等', en: 'Medium' } },
  low: { tone: 'ok', label: { zh: '一般', en: 'Low' } },
}

export default function LandlordMaintenancePage() {
  const { lang } = useT()
  const aiName = useAIName('landlord')
  const open = TICKETS.filter((t) => t.status === 'open')
  const inProgress = TICKETS.filter((t) => t.status === 'in-progress')
  const resolved = TICKETS.filter((t) => t.status === 'resolved')

  const insights: AIInsight[] = [
    {
      text: {
        zh: '厨房水槽工单已等待派单 9 小时。超过 RTA 合理响应窗口会累积风险，{ai} 可以帮你找可上门的师傅。',
        en: 'The kitchen-sink ticket has waited 9 hours unassigned. Slipping past the RTA response window builds risk — {ai} can find available technicians.',
      },
      action: {
        label: { zh: '让 {ai} 找师傅', en: 'Find a technician' },
        prompt: {
          zh: '帮我给厨房水槽漏水的工单找本周可上门的师傅，给我 2-3 个选择。',
          en: 'Find 2-3 technicians available this week for the kitchen sink leak ticket.',
        },
      },
    },
  ]

  return (
    <WorkspaceShell role="landlord" aside={<Aside lang={lang} insights={insights} />}>
      <PageHeader
        title={lang === 'zh' ? '维修工单' : 'Maintenance tickets'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">LANDLORD · MAINTENANCE</span>
            <span className="mx-1.5 text-body-3">·</span>
            {lang === 'zh'
              ? `租客提交 → ${aiName} 分类 → 你审批 → 自动派工或自处理`
              : `Tenant submits → ${aiName} categorizes → you approve → auto-dispatch or self-handle`}
          </>
        }
        actions={
          <Link
            href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? '帮我创建一个新的维修工单' : 'Help me create a new maintenance ticket')}`}
            className="sl-btn-primary !px-4 !py-2 !text-[12.5px]"
          >
            {lang === 'zh' ? '+ 创建工单' : '+ Create ticket'}
          </Link>
        }
      />

      <StatStrip
        stats={[
          {
            label: lang === 'zh' ? '待响应' : 'Awaiting response',
            value: String(open.length),
            sub: lang === 'zh' ? '超 4 小时未处理 · 自动升级' : 'Unhandled over 4h · auto-escalated',
            tone: 'down',
          },
          {
            label: lang === 'zh' ? '处理中' : 'In progress',
            value: String(inProgress.length),
            sub: lang === 'zh' ? '已派工或自处理中' : 'Dispatched or self-handled',
            tone: 'warn',
          },
          {
            label: lang === 'zh' ? '本月已解决' : 'Resolved this month',
            value: String(resolved.length + 4),
            sub: lang === 'zh' ? '平均响应 14h · 平均完成 2.1d' : 'Avg response 14h · avg completion 2.1d',
            tone: 'up',
          },
        ]}
      />

      {/* Lanes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Lane title={lang === 'zh' ? '待响应' : 'Awaiting response'} eyebrow="OPEN" tickets={open} lang={lang} />
        <Lane title={lang === 'zh' ? '处理中' : 'In progress'} eyebrow="IN PROGRESS" tickets={inProgress} lang={lang} />
        <Lane title={lang === 'zh' ? '已解决（近 30 天）' : 'Resolved (last 30 days)'} eyebrow="RESOLVED" tickets={resolved} lang={lang} />
      </div>
    </WorkspaceShell>
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
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[13px] font-bold tracking-tight">
          {title} · {tickets.length}
        </h3>
        <span className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">{eyebrow}</span>
      </div>
      {tickets.length === 0 ? (
        <SectionCard padded={false}>
          <EmptyState>{lang === 'zh' ? '这一栏暂时为空' : 'This lane is empty for now'}</EmptyState>
        </SectionCard>
      ) : (
        <div className="space-y-2.5">
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
    <SectionCard>
      <div className="flex items-start justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
          {t.id} · {t.created[lang]}
        </div>
        <StatusPill tone={p.tone}>{p.label[lang]}</StatusPill>
      </div>
      <div className="mt-2 text-[14px] font-bold">{t.title[lang]}</div>
      <div className="mt-1 text-[12px] text-body-2">{t.unit}</div>
      <div className="mt-1.5 text-[11.5px] text-body-3">
        {t.tenant} · {t.category[lang]}
        {t.photos > 0 && ` · 📷 ${t.photos}`}
      </div>
      {(t as any).assignee && (
        <div className="mt-2.5 rounded-[8px] border border-line-divider bg-surface px-3 py-2 text-[11.5px]">
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
      <div className="mt-2.5 flex gap-2">
        <Link href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? `打开工单 ${t.id}「${t.title.zh}」的详情和处理进度` : `Open ticket ${t.id} "${t.title.en}" — show details and progress`)}`} className="flex-1 rounded-[8px] border border-line-strong bg-white py-[7px] text-center text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
          {lang === 'zh' ? '打开' : 'Open'}
        </Link>
        {t.status === 'open' && (
          <Link href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? `为工单 ${t.id}「${t.title.zh}」派工，帮我推荐师傅和报价` : `Dispatch ticket ${t.id} "${t.title.en}" — recommend a technician and quote`)}`} className="flex-1 rounded-[8px] bg-ink py-[7px] text-center text-[11.5px] font-semibold text-white">
            {lang === 'zh' ? '派工' : 'Dispatch'}
          </Link>
        )}
      </div>
    </SectionCard>
  )
}

function Aside({ lang, insights }: { lang: Lang; insights: AIInsight[] }) {
  const aiName = useAIName('landlord')
  const zh = lang === 'zh'
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive role="landlord" insights={insights} variant="rail" />
      </AsideBlock>

      <AsideBlock title={zh ? '服务商' : 'Service providers'}>
        <p className="text-[12.5px] leading-relaxed text-body-2">
          {zh
            ? `${aiName} 会按工单类别自动匹配你预设的服务商，或在 Stayloop 服务商网络里推荐。`
            : `${aiName} auto-matches your preset providers by ticket category, or recommends one from the Stayloop provider network.`}
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
      </AsideBlock>
    </div>
  )
}
