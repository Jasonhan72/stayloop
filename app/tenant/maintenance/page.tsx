'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useState } from 'react'

const TICKETS = [
  { id: 'M-104', title: '厨房水龙头滴水', status: 'in-progress', sub: '2 天前提交 · 已派工', priority: 'medium' },
  { id: 'M-103', title: '走廊灯泡需更换', status: 'done', sub: '上周完成 · 已确认', priority: 'low' },
  { id: 'M-102', title: '空调出风口异响', status: 'review', sub: '完工 · 等你确认', priority: 'high' },
]

export default function TenantMaintenancePage() {
  const [open, setOpen] = useState(false)
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
            MAINTENANCE
          </div>
          <h1 className="mt-2 text-[36px] font-bold tracking-tight">维修请求</h1>
        </div>
        <button onClick={() => setOpen(true)} className="sl-btn-primary !py-[12px]">
          + 提交新请求
        </button>
      </div>

      <div className="space-y-3">
        {TICKETS.map((t) => (
          <div key={t.id} className="sl-card flex items-center gap-4 p-5">
            <span
              className={
                'flex h-12 w-12 items-center justify-center rounded-xl ' +
                (t.priority === 'high'
                  ? 'bg-danger/10 text-danger'
                  : t.priority === 'medium'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-info/10 text-info')
              }
            >
              <ToolIcon />
            </span>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[15px] font-bold">{t.title}</h3>
                <span className="font-mono text-[10.5px] text-body-3">{t.id}</span>
              </div>
              <div className="mt-1 text-[12.5px] text-body-2">{t.sub}</div>
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
              {t.status === 'done' ? '完成' : t.status === 'review' ? '待确认' : '处理中'}
            </span>
          </div>
        ))}
      </div>

      {open && <NewTicketModal onClose={() => setOpen(false)} />}
    </WorkspaceShell>
  )
}

const CATEGORIES = [
  { id: 'plumbing', icon: '🔧', label: '水管 / 漏水' },
  { id: 'electrical', icon: '⚡', label: '电器 / 电路' },
  { id: 'hvac', icon: '❄️', label: '暖气 / 空调' },
  { id: 'lock', icon: '🔑', label: '钥匙 / 锁' },
]

const URGENCY = [
  { id: 'low', label: '不急 · 7 天内' },
  { id: 'medium', label: '普通 · 48 小时内' },
  { id: 'high', label: '紧急 · 24 小时' },
]

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const [cat, setCat] = useState('')
  const [urg, setUrg] = useState('medium')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur sm:items-center">
      <div className="sl-card w-full max-w-lg p-7 sm:p-9">
        <div className="font-mono text-[10.5px] uppercase tracking-eyebrowLg text-body-3">
          UNIT 1207 · 维修 · 发给 SARAH
        </div>
        <h3 className="mt-2 text-[24px] font-bold tracking-tight">什么情况?</h3>
        <p className="mt-1 text-[13px] text-body-2">
          Luna 会基于你描述的紧急程度给 Sarah 一个建议响应时间。
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
              <span className="text-[12px] font-semibold">{c.label}</span>
            </button>
          ))}
        </div>

        {/* Description */}
        <div className="mt-5">
          <div className="sl-eyebrow">详细描述</div>
          <textarea
            className="sl-input mt-1.5 h-24 py-2"
            placeholder="厨房洗碗机不通电。今早开机没反应，电源指示灯也不亮。其他电器正常。"
          />
        </div>

        {/* Urgency pills */}
        <div className="mt-5">
          <div className="sl-eyebrow">紧急程度</div>
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
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photo grid */}
        <div className="mt-5">
          <div className="sl-eyebrow">照片（可选）</div>
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
            <span className="text-[12px] font-bold text-tenant-deep">Luna · 你提交后会发生什么：</span>
          </div>
          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-tenant-deep">
            <li>· Sarah 立即收到 push，我会在 4 小时后追 Sarah 跟进</li>
            <li>· 记录电器故障类型，48 小时内 Sarah 应该安排人上门，RTA 标准</li>
            <li>· 一切留痕，audit log，争议时可溯</li>
          </ul>
        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-[10px] border border-line-strong bg-white py-[12px] text-[14px] font-semibold text-body">
            取消
          </button>
          <button onClick={onClose} className="sl-btn-primary flex-1 !py-[12px]">提交</button>
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
