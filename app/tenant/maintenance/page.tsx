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

function NewTicketModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur sm:items-center">
      <div className="sl-card w-full max-w-md p-7">
        <h3 className="text-[20px] font-bold tracking-tight">提交维修请求</h3>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="sl-eyebrow">问题分类</span>
            <select className="sl-input mt-1">
              <option>水电 · plumbing</option>
              <option>电器 · appliance</option>
              <option>暖通空调 · HVAC</option>
              <option>结构 / 漏水</option>
              <option>其他</option>
            </select>
          </label>
          <label className="block">
            <span className="sl-eyebrow">紧急程度</span>
            <select className="sl-input mt-1">
              <option>非紧急</option>
              <option>影响生活</option>
              <option>紧急 · 24h 内</option>
            </select>
          </label>
          <label className="block">
            <span className="sl-eyebrow">详细描述</span>
            <textarea className="sl-input mt-1 h-24 py-2" placeholder="尽量描述清楚 · Luna 会附在工单里" />
          </label>
          <label className="block">
            <span className="sl-eyebrow">添加照片</span>
            <div className="mt-1 flex h-20 items-center justify-center rounded-[10px] border-2 border-dashed border-line-strong bg-surface-chip text-[12px] text-body-3">
              拖拽或点击上传 · 最多 5 张
            </div>
          </label>
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
