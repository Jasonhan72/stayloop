'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useState } from 'react'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'

const STAGES = { zh: ['已报修', '已派单', '维修中', '完成'], en: ['Reported', 'Assigned', 'In repair', 'Done'] }

const TICKETS = [
  {
    id: 'M-104',
    title: { zh: '厨房水龙头滴水', en: 'Kitchen faucet dripping' },
    status: 'in-progress' as const,
    sub: { zh: '2 天前提交', en: 'Submitted 2 days ago' },
    priority: 'medium' as const,
    stage: 1,
    tech: { name: 'Alex 李师傅', rating: 4.9, eta: { zh: '明天 10:00–12:00 上门', en: 'Visit tomorrow 10:00–12:00' } },
    sla: { zh: '响应 1.8h · RTA 48h 标准内', en: 'Responded in 1.8h · within RTA 48h' },
  },
  {
    id: 'M-102',
    title: { zh: '空调出风口异响', en: 'AC vent making noise' },
    status: 'review' as const,
    sub: { zh: '完工 · 等你确认', en: 'Work done · awaiting your confirmation' },
    priority: 'high' as const,
    stage: 3,
    tech: { name: 'Alex 李师傅', rating: 4.9, eta: { zh: '昨天 16:20 完工', en: 'Finished yesterday 16:20' } },
    sla: { zh: '响应 0.9h · 24h 内上门', en: 'Responded in 0.9h · visited within 24h' },
  },
  {
    id: 'M-103',
    title: { zh: '走廊灯泡需更换', en: 'Hallway light bulb needs replacing' },
    status: 'done' as const,
    sub: { zh: '上周完成 · 已确认', en: 'Completed last week · confirmed' },
    priority: 'low' as const,
    stage: 3,
    tech: null,
    sla: { zh: '当天解决', en: 'Resolved same day' },
  },
]

export default function TenantMaintenancePage() {
  const [open, setOpen] = useState(false)
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('tenant')
  const openCount = TICKETS.filter((t) => t.status !== 'done').length

  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
            MAINTENANCE
          </div>
          <h1 className="mt-2 text-[26px] font-bold tracking-tight sm:text-[36px]">{zh ? '维修请求' : 'Maintenance Requests'}</h1>
        </div>
        <button onClick={() => setOpen(true)} className="sl-btn-primary !py-[12px]">
          {zh ? '+ 提交新请求' : '+ New request'}
        </button>
      </div>

      {/* AI watch bar */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-tenant/22 bg-tenant/5 px-4 py-3">
        <span className="h-6 w-6 flex-none rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }} />
        <p className="text-[13px] leading-relaxed text-tenant-deep">
          {zh
            ? <><b>{aiName}</b> 盯着 {openCount} 个进行中的工单 —— 超过 RTA 响应标准会自动催房东,全程留痕可溯。也可以直接对{aiName}说一句"厨房漏水",工单自动生成。</>
            : <><b>{aiName}</b> is watching {openCount} open tickets — landlords get nudged automatically past the RTA response window, and everything is logged. You can also just tell {aiName} "the kitchen is leaking" and a ticket writes itself.</>}
        </p>
      </div>

      <div className="space-y-4">
        {TICKETS.map((t) => {
          const done = t.status === 'done'
          return (
            <div key={t.id} className={'sl-card p-5 sm:p-6 ' + (done ? 'opacity-85' : '')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-4">
                  <span
                    className={
                      'flex h-11 w-11 flex-none items-center justify-center rounded-xl ' +
                      (t.priority === 'high'
                        ? 'bg-danger/10 text-danger'
                        : t.priority === 'medium'
                          ? 'bg-warning/10 text-warning'
                          : 'bg-info/10 text-info')
                    }
                  >
                    <ToolIcon />
                  </span>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-[15.5px] font-bold">{t.title[lang]}</h3>
                      <span className="font-mono text-[10.5px] text-body-3">{t.id}</span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-body-2">{t.sub[lang]} · <span className="text-success">{t.sla[lang]}</span></div>
                  </div>
                </div>
                <span
                  className={
                    'rounded-md px-2 py-1 font-mono text-[10.5px] font-bold uppercase ' +
                    (t.status === 'done'
                      ? 'bg-success/10 text-success'
                      : t.status === 'review'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-info/10 text-info')
                  }
                >
                  {zh
                    ? (t.status === 'done' ? '完成' : t.status === 'review' ? '待确认' : '处理中')
                    : (t.status === 'done' ? 'Done' : t.status === 'review' ? 'To confirm' : 'In progress')}
                </span>
              </div>

              {/* 4-stage progress */}
              <div className="mt-5 flex items-center gap-1.5">
                {STAGES[lang].map((s, i) => (
                  <div key={s} className="flex flex-1 flex-col gap-1.5">
                    <span
                      className={
                        'h-[4px] rounded-full ' +
                        (i < t.stage ? 'bg-success' : i === t.stage ? (done ? 'bg-success' : 'bg-brand') : 'bg-line-divider')
                      }
                    />
                    <span
                      className={
                        'font-mono text-[9.5px] uppercase tracking-eyebrow ' +
                        (i <= t.stage ? (i === t.stage && !done ? 'font-bold text-brand' : 'text-success') : 'text-body-4')
                      }
                    >
                      {s}
                    </span>
                  </div>
                ))}
              </div>

              {/* Technician + actions */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {t.tech ? (
                  <div className="flex items-center gap-2.5 text-[12.5px] text-body-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-chip text-[11px] font-bold">
                      {t.tech.name.slice(0, 1)}
                    </span>
                    <span className="font-semibold text-body">{t.tech.name}</span>
                    <span className="text-warning">★ {t.tech.rating}</span>
                    <span className="text-body-3">· {t.tech.eta[lang]}</span>
                  </div>
                ) : <span />}
                <div className="flex gap-2">
                  {t.status === 'review' && (
                    <>
                      <button className="sl-btn-primary !py-[8px] !px-4 !text-[12.5px]">{zh ? '确认完工 ✓' : 'Confirm done ✓'}</button>
                      <button className="rounded-lg border border-line-strong bg-white px-3.5 py-[7px] text-[12.5px] font-semibold text-body transition hover:border-danger hover:text-danger">
                        {zh ? '有问题,重开' : 'Reopen'}
                      </button>
                    </>
                  )}
                  {t.status === 'in-progress' && (
                    <button className="rounded-lg border border-line-strong bg-white px-3.5 py-[7px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
                      {zh ? '联系师傅' : 'Contact technician'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {open && <NewTicketModal onClose={() => setOpen(false)} />}
    </WorkspaceShell>
  )
}

const CATEGORIES = [
  { id: 'plumbing', icon: '🔧', label: { zh: '水管 / 漏水', en: 'Plumbing / leak' } },
  { id: 'electrical', icon: '⚡', label: { zh: '电器 / 电路', en: 'Appliance / wiring' } },
  { id: 'hvac', icon: '❄️', label: { zh: '暖气 / 空调', en: 'Heating / AC' } },
  { id: 'lock', icon: '🔑', label: { zh: '钥匙 / 锁', en: 'Keys / lock' } },
]

const URGENCY = [
  { id: 'low', label: { zh: '不急 · 7 天内', en: 'Low · within 7 days' } },
  { id: 'medium', label: { zh: '普通 · 48 小时内', en: 'Normal · within 48 hrs' } },
  { id: 'high', label: { zh: '紧急 · 24 小时', en: 'Urgent · 24 hrs' } },
]

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const name = useAIName()
  const { lang } = useT()
  const [cat, setCat] = useState('')
  const [urg, setUrg] = useState('medium')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur sm:items-center">
      <div className="sl-card max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto p-5 sm:p-9">
        <div className="font-mono text-[10.5px] uppercase tracking-eyebrowLg text-body-3">
          {lang === 'zh' ? 'UNIT 1207 · 维修 · 发给 SARAH' : 'UNIT 1207 · MAINTENANCE · TO SARAH'}
        </div>
        <h3 className="mt-2 text-[24px] font-bold tracking-tight">{lang === 'zh' ? '什么情况?' : "What's going on?"}</h3>
        <p className="mt-1 text-[13px] text-body-2">
          {lang === 'zh'
            ? `${name} 会基于你描述的紧急程度给 Sarah 一个建议响应时间。`
            : `${name} will suggest a response time to Sarah based on the urgency you describe.`}
        </p>

        {/* Category pills */}
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={
                'flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-4 text-center transition ' +
                (cat === c.id
                  ? 'border-brand bg-brand/5 text-brand'
                  : 'border-line-strong bg-white text-body hover:border-brand/40')
              }
            >
              <span className="text-[20px]">{c.icon}</span>
              <span className="text-[12px] font-semibold">{c.label[lang]}</span>
            </button>
          ))}
        </div>

        {/* Description */}
        <div className="mt-5">
          <div className="sl-eyebrow">{lang === 'zh' ? '详细描述' : 'Details'}</div>
          <textarea
            className="sl-input mt-1.5 h-24 py-2"
            placeholder={lang === 'zh'
              ? '厨房洗碗机不通电。今早开机没反应，电源指示灯也不亮。其他电器正常。'
              : "The kitchen dishwasher has no power. It didn't respond this morning and the power light is off. Other appliances work fine."}
          />
        </div>

        {/* Urgency pills */}
        <div className="mt-5">
          <div className="sl-eyebrow">{lang === 'zh' ? '紧急程度' : 'Urgency'}</div>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {URGENCY.map((u) => (
              <button
                key={u.id}
                onClick={() => setUrg(u.id)}
                className={
                  'rounded-xl border-2 px-3 py-3 text-center text-[12.5px] font-semibold transition ' +
                  (urg === u.id
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-line-strong bg-white text-body hover:border-brand/40')
                }
              >
                {u.label[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* Photo grid */}
        <div className="mt-5">
          <div className="sl-eyebrow">{lang === 'zh' ? '照片（可选）' : 'Photos (optional)'}</div>
          <div className="mt-1.5 grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-line-strong bg-surface-chip text-[18px] text-body-4 transition hover:border-brand/40 hover:text-brand"
              >
                {i === 0 ? '📷' : '+'}
              </div>
            ))}
          </div>
        </div>

        {/* Luna explanation */}
        <div className="mt-6 rounded-xl border border-tenant/22 bg-tenant/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="h-5 w-5 rounded-full"
              style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }}
            />
            <span className="text-[12px] font-bold text-tenant-deep">{lang === 'zh' ? `${name} · 你提交后会发生什么：` : `${name} · what happens after you submit:`}</span>
          </div>
          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-tenant-deep">
            {lang === 'zh' ? (
              <>
                <li>· Sarah 立即收到 push，我会在 4 小时后追 Sarah 跟进</li>
                <li>· 记录电器故障类型，48 小时内 Sarah 应该安排人上门，RTA 标准</li>
                <li>· 一切留痕，audit log，争议时可溯</li>
              </>
            ) : (
              <>
                <li>· Sarah gets a push notification right away, and I'll follow up with her after 4 hours</li>
                <li>· The appliance fault type is logged; Sarah should arrange a visit within 48 hours, per RTA standard</li>
                <li>· Everything is recorded in the audit log, traceable if a dispute arises</li>
              </>
            )}
          </ul>
        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-[10px] border border-line-strong bg-white py-[12px] text-[14px] font-semibold text-body">
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button onClick={onClose} className="sl-btn-primary flex-1 !py-[12px]">{lang === 'zh' ? '提交' : 'Submit'}</button>
        </div>
      </div>
    </div>
  )
}

function ToolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  )
}
