'use client'

import { useState } from 'react'
import WorkspaceShell, { WorkspaceRole } from '@/components/WorkspaceShell'

/**
 * V5.3 ART 30 · Audit Log · SHARED (tenant + landlord)
 * 每一次访问 / 数据流转 都有记录 — 完整事件流 · 不可篡改 · 区块链时间戳。
 * Shared component: each role route renders <AuditLog role="tenant" | "landlord" />.
 */

type Category = 'access' | 'consent' | 'lease' | 'payment'

interface AuditEvent {
  ts: string
  /** bold lead-in shown first */
  lead?: string
  /** remaining detail copy */
  body: string
  who: string
  cat: Category
  hash: string
}

interface AuditDay {
  label: string
  events: AuditEvent[]
}

const DAYS: AuditDay[] = [
  {
    label: '2026/05/15 · 今天',
    events: [
      {
        ts: '18:42',
        lead: '你签署了租约',
        body: 'Unit 1207 · King West · Lse-king1207-mia · 区块链时间戳',
        who: 'SELF',
        cat: 'lease',
        hash: '0x4f…e9c2',
      },
      {
        ts: '18:38',
        lead: 'Luna 起草反提议',
        body: '第 7 条改为 RTA 标准 0.5 个月通知 · 经你确认',
        who: 'LUNA',
        cat: 'lease',
        hash: '0x91…7ab3',
      },
      {
        ts: '14:22',
        body: 'Sarah Wang 查看了你的认证 2 级资料 · 第 3 次 · 停留 2m14s',
        who: 'LANDLORD',
        cat: 'access',
        hash: '0x2c…d740',
      },
      {
        ts: '11:05',
        lead: '下载租约 PDF',
        body: 'Unit 1207 · King West · 含完整 audit log 附录',
        who: 'SELF',
        cat: 'lease',
        hash: '0x6e…1f88',
      },
    ],
  },
  {
    label: '2026/05/04 · 11 天前',
    events: [
      {
        ts: '10:21',
        lead: '你授权 Flinks 访问银行',
        body: '90 天银行流水（只读）· 认证 3 级 升级',
        who: 'SELF · CONSENT',
        cat: 'consent',
        hash: '0xa3…5c01',
      },
      {
        ts: '10:23',
        body: 'Flinks 读取 90 天银行流水（只读）· 收入区间 $9–12k · 稳定性 88/100',
        who: 'FLINKS API',
        cat: 'access',
        hash: '0xb7…9e22',
      },
      {
        ts: '10:24',
        body: 'Persona 完成身份核验（只读）· 认证 2 级 → 3 级',
        who: 'PERSONA API',
        cat: 'access',
        hash: '0xc1…44af',
      },
      {
        ts: '10:25',
        body: 'Stayloop 向 Sarah Wang 发布认证 3 级衍生数据 · 不含具体交易',
        who: 'SYSTEM',
        cat: 'access',
        hash: '0xd9…02e6',
      },
    ],
  },
  {
    label: '2026/05/03 · 12 天前',
    events: [
      {
        ts: '16:10',
        lead: '你撤销了 David Park 的看房授权',
        body: '范围限定数据已即时停止共享',
        who: 'SELF · CONSENT',
        cat: 'consent',
        hash: '0x33…7b90',
      },
      {
        ts: '11:48',
        lead: 'Sarah Wang 批准 David Park 带看',
        body: 'Unit 1207 · King West · $80 Stripe 预授权',
        who: 'LANDLORD',
        cat: 'payment',
        hash: '0x58…ac12',
      },
      {
        ts: '09:22',
        body: '你给 Sarah Wang 发消息（Luna 起草，你确认）',
        who: 'SELF · TENANT',
        cat: 'lease',
        hash: '0x70…e3d5',
      },
    ],
  },
  {
    label: '2026/05/02 · 13 天前',
    events: [
      {
        ts: '14:30',
        lead: '你提交看房意向',
        body: 'Unit 1207 · King West · 认证 2 级资料分享 · 范围限定',
        who: 'SELF · INTENT',
        cat: 'consent',
        hash: '0x8b…51c7',
      },
    ],
  },
]

const FILTERS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'access', label: '数据访问' },
  { key: 'consent', label: '同意/撤销' },
  { key: 'lease', label: '租约动作' },
  { key: 'payment', label: '支付' },
]

export default function AuditLog({ role }: { role: WorkspaceRole }) {
  const [active, setActive] = useState<Category | 'all'>('all')

  const days = DAYS.map((d) => ({
    ...d,
    events: active === 'all' ? d.events : d.events.filter((e) => e.cat === active),
  })).filter((d) => d.events.length > 0)

  return (
    <WorkspaceShell role={role} aside={<Aside />}>
      {/* Heading */}
      <div className="mb-7 max-w-[760px]">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">
          完整事件流 · 不可篡改 · 区块链时间戳
        </div>
        <h1 className="mt-2 text-[34px] font-bold leading-tight tracking-tight">
          每一次访问 / 数据流转 都有记录
        </h1>
        <p className="mt-3 text-body-2 text-[14px] leading-relaxed">
          争议时这是最终证据。租客 / 房东 / 经纪都可调取自己相关事件。
        </p>
      </div>

      {/* Filter chips */}
      <div className="mb-7 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const on = active === f.key
          return (
            <button
              key={f.key}
              onClick={() => setActive(f.key)}
              className={
                'rounded-full px-3.5 py-[6px] text-[12px] font-semibold transition ' +
                (on
                  ? 'bg-ink text-white'
                  : 'border border-line-strong bg-white text-body-2 hover:border-brand hover:text-brand')
              }
            >
              {f.label}
            </button>
          )
        })}
        <button className="ml-auto rounded-full border border-line-strong bg-white px-3.5 py-[6px] text-[12px] font-semibold text-body-2 transition hover:border-brand hover:text-brand">
          下载 PDF
        </button>
      </div>

      {/* Event stream */}
      <section className="sl-card overflow-hidden">
        {days.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px] text-body-3">
            该类别暂无事件。
          </div>
        ) : (
          days.map((day) => (
            <div key={day.label}>
              <div className="border-b border-line-divider bg-surface-chip px-6 py-2.5 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">
                {day.label}
              </div>
              {day.events.map((e, i) => (
                <div
                  key={day.label + i}
                  className="flex items-start gap-4 border-b border-line-divider px-6 py-4 last:border-b-0"
                >
                  <div className="w-[44px] shrink-0 pt-[1px] font-mono text-[12px] font-bold text-body-3">
                    {e.ts}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] leading-snug text-body">
                      {e.lead && <span className="font-bold">{e.lead}</span>}
                      {e.lead && ' '}
                      <span className="text-body-2">{e.body}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">
                        {e.who}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-[4px] font-mono"
                        style={{
                          background: 'rgba(124,58,237,0.08)',
                          color: '#5B21B6',
                          padding: '2px 7px',
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                        }}
                      >
                        <span aria-hidden>⛓</span>
                        留痕 {e.hash}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </WorkspaceShell>
  )
}

function Aside() {
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        留痕保障
      </div>
      <div className="mt-3 sl-card p-4">
        <div className="text-[14px] font-bold">不可篡改 · 区块链时间戳</div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-body-2">
          每条事件都写入链上哈希，任何人无法事后修改或删除。争议进入 LTB 时，这份记录即为最终证据。
        </div>
        <button className="mt-3 w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-[12.5px] font-semibold transition hover:border-brand hover:text-brand">
          下载完整 PDF 报告
        </button>
      </div>

      <div className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        你的数据访问者
      </div>
      <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
        <p>
          👤 <b>Sarah Wang</b> · 房东 · 认证 2 级资料 · 共查看 3 次
        </p>
        <p>
          🏦 <b>Flinks</b> · 90 天银行流水（只读）· 已授权
        </p>
        <p>
          🪪 <b>Persona</b> · 身份核验（只读）· 已完成
        </p>
        <p>
          🔑 <b>David Park</b> · 看房授权 · <span className="text-danger">已撤销</span>
        </p>
      </div>
    </div>
  )
}
