'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'

/**
 * V5 Agent · Clients
 * CRM-style table grouped by stage: searching / showing / applied / leased.
 */

const STAGES = [
  { key: 'searching', label: { zh: '寻房中', en: 'Searching' }, count: 4, accent: '#7C3AED' },
  { key: 'showing', label: { zh: '看房安排', en: 'Showings booked' }, count: 2, accent: '#2563EB' },
  { key: 'applied', label: { zh: '已申请', en: 'Applied' }, count: 3, accent: '#B45309' },
  { key: 'leased', label: { zh: '已成交', en: 'Leased' }, count: 1, accent: '#047857' },
]

const CLIENTS = (aiName: string) => [
  {
    name: 'Mia Chen',
    tier: 2,
    budget: '$3,800–$4,500',
    area: 'King West',
    stage: 'showing',
    next: { zh: '今天 14:00 · Unit 1207 · King West', en: 'Today 14:00 · Unit 1207 · King West' },
    last: { zh: `昨晚和 ${aiName} 聊了 30 min`, en: `Chatted with ${aiName} 30 min last night` },
  },
  {
    name: 'Anna L.',
    tier: 3,
    budget: '$3,800–$4,500',
    area: 'The Annex / Forest Hill',
    stage: 'showing',
    next: { zh: '今天 14:00 · 432 Brunswick', en: 'Today 14:00 · 432 Brunswick' },
    last: { zh: `昨晚和 ${aiName} 聊了 30 min`, en: `Chatted with ${aiName} 30 min last night` },
  },
  {
    name: 'Jason H.',
    tier: 2,
    budget: '$3,200–$3,600',
    area: 'King West / Liberty Village',
    stage: 'searching',
    next: { zh: `${aiName} 在筛选 5 套备选`, en: `${aiName} shortlisting 5 options` },
    last: { zh: '5/4 给了 brief 包', en: 'Brief pack delivered 5/4' },
  },
  {
    name: 'Lisa W.',
    tier: 4,
    budget: '$4,500+',
    area: 'Yorkville',
    stage: 'searching',
    next: { zh: '等 5/11 看 88 Harbour', en: 'Awaiting 5/11 viewing · 88 Harbour' },
    last: { zh: '明确要 24h concierge', en: 'Specifically wants 24h concierge' },
  },
  {
    name: 'Kevin Tran',
    tier: 2,
    budget: '$2,800–$3,000',
    area: 'Liberty Village',
    stage: 'leased',
    next: { zh: '续约草稿 5/12 完成', en: 'Renewal draft due 5/12' },
    last: { zh: '认证 2 级 · 12 个月按时', en: 'Tier 2 · 12 months on time' },
  },
  {
    name: 'David Z.',
    tier: 3,
    budget: '$3,400',
    area: 'Distillery District',
    stage: 'applied',
    next: { zh: '等房东回复', en: 'Awaiting landlord reply' },
    last: { zh: '5/3 提交完整申请', en: 'Full application submitted 5/3' },
  },
  {
    name: 'Priya S.',
    tier: 2,
    budget: '$2,400',
    area: 'Cabbagetown',
    stage: 'searching',
    next: { zh: `${aiName} 在配对小户型`, en: `${aiName} matching small units` },
    last: { zh: '5/2 加入', en: 'Joined 5/2' },
  },
  {
    name: 'Marcus T.',
    tier: 3,
    budget: '$3,600',
    area: 'Leslieville',
    stage: 'applied',
    next: { zh: '等房东 5/10 回复', en: 'Awaiting landlord reply 5/10' },
    last: { zh: '5/1 提交申请', en: 'Application submitted 5/1' },
  },
  {
    name: 'Sophie B.',
    tier: 1,
    budget: '$1,800',
    area: 'Bachelor / Cabbagetown',
    stage: 'searching',
    next: { zh: '提示她升级到 认证 2 级', en: 'Prompt her to upgrade to Tier 2' },
    last: { zh: '4/30 加入', en: 'Joined 4/30' },
  },
  {
    name: 'Eric K.',
    tier: 4,
    budget: '$5,200',
    area: 'Yorkville',
    stage: 'showing',
    next: { zh: '5/13 三套连看', en: 'Three back-to-back viewings 5/13' },
    last: { zh: '只看高 认证级别 房源', en: 'Only views high-Tier listings' },
  },
  {
    name: 'Yuki M.',
    tier: 2,
    budget: '$2,950',
    area: 'King West',
    stage: 'applied',
    next: { zh: '已签草约', en: 'Draft lease signed' },
    last: { zh: '4/28 银行透明度通过', en: 'Bank transparency passed 4/28' },
  },
]

const STAGE_STYLE: Record<string, { bg: string; fg: string; label: { zh: string; en: string } }> = {
  searching: { bg: 'rgba(124,58,237,0.10)', fg: '#5B21B6', label: { zh: '寻房中', en: 'Searching' } },
  showing: { bg: 'rgba(37,99,235,0.10)', fg: '#1E3A8A', label: { zh: '看房中', en: 'Showing' } },
  applied: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: { zh: '已申请', en: 'Applied' } },
  leased: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: { zh: '已成交', en: 'Leased' } },
}

export default function AgentClientsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('agent')
  return (
    <WorkspaceShell role="agent" aside={<Aside />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
            AGENT · CLIENTS
          </div>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[36px]">{zh ? '客户管理' : 'Client management'}</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            {zh ? `${aiName} 自动 CRM · 按阶段 / 认证级别 / 预算分组 · 跟进自动安排` : `${aiName} auto-CRM · grouped by stage / Tier / budget · follow-ups scheduled automatically`}
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">{zh ? '+ 加客户' : '+ Add client'}</button>
      </div>

      {/* Stage chips */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {STAGES.map((s) => (
          <div key={s.key} className="sl-card p-4">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {s.label[lang]}
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
          placeholder={zh ? '搜索客户 / 区域 / 认证级别' : 'Search clients / area / Tier'}
          className="flex-1 rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] outline-none focus:border-brand"
        />
        <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
          {zh ? '按 认证级别 ▾' : 'By Tier ▾'}
        </button>
      </div>

      {/* Client table */}
      <div className="sl-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead className="bg-surface-chip">
            <tr>
              <Th>{zh ? '客户' : 'Client'}</Th>
              <Th>{zh ? '认证级别' : 'Tier'}</Th>
              <Th>{zh ? '预算 · 区域' : 'Budget · Area'}</Th>
              <Th>{zh ? '阶段' : 'Stage'}</Th>
              <Th>{zh ? '下一步' : 'Next step'}</Th>
              <Th right>—</Th>
            </tr>
          </thead>
          <tbody>
            {CLIENTS(aiName).map((c) => {
              const ss = STAGE_STYLE[c.stage]
              return (
                <tr
                  key={c.name}
                  className="border-t border-line-divider transition hover:bg-surface-chip/40"
                >
                  <td className="px-6 py-3">
                    <div className="text-[13px] font-bold">{c.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                      {c.last[lang]}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`tier-badge t${c.tier}`}>{zh ? `认证 ${c.tier} 级` : `Tier ${c.tier}`}</span>
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
                      {ss.label[lang]}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-[12.5px] text-body-2">{c.next[lang]}</td>
                  <td className="px-6 py-3 text-right">
                    <button className="rounded-[8px] border border-line-strong bg-white px-3 py-[6px] text-[11.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
                      {zh ? '打开' : 'Open'}
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
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('agent')
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {zh ? `${aiName} 跟进` : `${aiName} follow-ups`}
      </div>
      <div className="mt-3 space-y-3">
        {[
          { who: 'Anna L.', msg: { zh: '看房后 30 min 内问反馈', en: 'Ask for feedback within 30 min of showing' }, when: { zh: '今天 14:30', en: 'Today 14:30' } },
          { who: 'Jason H.', msg: { zh: '5 套 brief 包等你审', en: '5-listing brief pack awaiting your review' }, when: { zh: '本周内', en: 'This week' } },
          { who: 'Sophie B.', msg: { zh: '提议升级到 认证 2 级', en: 'Suggest upgrade to Tier 2' }, when: { zh: '今天', en: 'Today' } },
          { who: 'Kevin Tran', msg: { zh: '续约草稿审阅', en: 'Review renewal draft' }, when: { zh: '5/12 前', en: 'By 5/12' } },
        ].map((f, i) => (
          <div key={i} className="rounded-[10px] border border-line-divider bg-white p-3">
            <div className="text-[13px] font-bold">{f.who}</div>
            <div className="mt-1 text-[12px] text-body-2">{f.msg[lang]}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
              {f.when[lang]}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
