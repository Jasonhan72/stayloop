'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'

const DIMS = [
  { name: '证件真实性', val: 96, w: 20, color: '#7C3AED', note: '护照 + 自拍均通过 · 与 Persona DB 100% 匹配' },
  { name: '支付能力',   val: 91, w: 20, color: '#047857', note: 'Plaid 直连 · DTI 30.8% · 6 个月最低存款 $18,400' },
  { name: '法庭记录',   val: 100, w: 20, color: '#DC2626', note: 'CanLII / LTB 无任何相关记录' },
  { name: '稳定性',     val: 87, w: 15, color: '#2563EB', note: 'RBC 工作 2.4 年 · 现地址 1.2 年' },
  { name: '行为信号',   val: 88, w: 13, color: '#D97706', note: '上家房东评价 5/5 · 无违规' },
  { name: '信息一致性', val: 95, w: 12, color: '#0B0B0E', note: '所有字段在 4 份资料中一致 · 0 异常' },
]

const FILES = [
  { name: 'passport.pdf',     type: 'ID',     size: '1.2 MB', date: '2 天前' },
  { name: 'paystub-may.pdf',  type: 'PAY',    size: '320 KB', date: '2 天前' },
  { name: 'plaid-bank.pdf',   type: 'BANK',   size: '500 KB', date: '2 天前' },
  { name: 'rbc-letter.pdf',   type: 'EMP',    size: '180 KB', date: '2 天前' },
]

export default function ApplicantDetail() {
  const { id } = useParams<{ id: string }>()
  return (
    <WorkspaceShell role="landlord" hideAside>
      <Link href="/landlord/applicants" className="font-mono text-[12px] text-body-3 hover:text-body">
        ← 返回所有申请
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-[22px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#C4B5FD,#7C3AED)' }}
          >
            M
          </span>
          <div>
            <h1 className="text-[28px] font-bold tracking-tight">Mia Wang</h1>
            <div className="font-mono text-[11.5px] text-body-3">
              申请 #{id} · 88 Harbour St #4502 · 2 天前提交
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tier-badge t3">TIER 3</span>
          <span className="rounded-md bg-success/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-success">
            推荐审批
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="sl-card p-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[18px] font-bold tracking-tight">六维 AI 评分</h2>
            <div className="text-right">
              <div className="font-mono text-[40px] font-extrabold leading-none text-brand">92</div>
              <div className="font-mono text-[10.5px] uppercase text-body-3">/100</div>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {DIMS.map((d) => (
              <div key={d.name}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[13.5px] font-semibold">
                    {d.name} <span className="font-mono text-[10.5px] text-body-3">· 权重 {d.w}%</span>
                  </span>
                  <span className="font-mono text-[14px] font-bold" style={{ color: d.color }}>
                    {d.val}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-divider">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${d.val}%`, background: d.color }}
                  />
                </div>
                <div className="mt-1 text-[12px] text-body-2">{d.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">Logic 建议</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
              Mia 在六个维度全部超过你的政策门槛, 行为信号无负面记录, 与你过去 12 个月签的 7 位 Tier 3 租客的 profile 高度相似 (88% 续签 / 0 投诉)。
            </p>
            <p className="mt-2 text-[13px] font-semibold text-brand">推荐: 邀请看房 + 准备租约。</p>
            <div className="mt-4 flex flex-col gap-2">
              <button className="sl-btn-primary !py-[12px]">
                ✓ 邀请看房 + 准备租约
              </button>
              <button className="sl-btn-secondary">先和 Logic 讨论</button>
              <button className="rounded-lg border border-warning/40 bg-white px-4 py-[10px] text-[13.5px] font-semibold text-warning">
                婉拒
              </button>
            </div>
          </div>

          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">提交的文件</h3>
            <div className="mt-3 space-y-2">
              {FILES.map((f) => (
                <div key={f.name} className="flex items-center gap-3 rounded-lg bg-surface-chip px-3 py-2 text-[12.5px]">
                  <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-brand">
                    {f.type}
                  </span>
                  <span className="flex-1 font-semibold">{f.name}</span>
                  <span className="font-mono text-body-3">{f.size}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] font-mono text-body-3">
              所有文件加密保存 · 你查看 = 在 audit log 留痕
            </p>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
