'use client'

import { useState } from 'react'
import WorkspaceShell, { WorkspaceRole } from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'

/**
 * V5.3 ART 30 · Audit Log · SHARED (tenant + landlord)
 * 每一次访问 / 数据流转 都有记录 — 完整事件流 · 不可篡改 · 区块链时间戳。
 * Shared component: each role route renders <AuditLog role="tenant" | "landlord" />.
 */

type Category = 'access' | 'consent' | 'lease' | 'payment'
type Bi = { zh: string; en: string }

interface AuditEvent {
  ts: string
  /** bold lead-in shown first */
  lead?: Bi
  /** remaining detail copy */
  body: Bi
  who: string
  cat: Category
  hash: string
}

interface AuditDay {
  label: Bi
  events: AuditEvent[]
}

const DAYS = (aiName: string): AuditDay[] => [
  {
    label: { zh: '2026/05/15 · 今天', en: '2026/05/15 · Today' },
    events: [
      {
        ts: '18:42',
        lead: { zh: '你签署了租约', en: 'You signed the lease' },
        body: { zh: 'Unit 1207 · King West · Lse-king1207-mia · 区块链时间戳', en: 'Unit 1207 · King West · Lse-king1207-mia · blockchain timestamp' },
        who: 'SELF',
        cat: 'lease',
        hash: '0x4f…e9c2',
      },
      {
        ts: '18:38',
        lead: { zh: `${aiName} 起草反提议`, en: `${aiName} drafted a counter-proposal` },
        body: { zh: '第 7 条改为 RTA 标准 0.5 个月通知 · 经你确认', en: 'Clause 7 changed to the RTA-standard 0.5-month notice · confirmed by you' },
        who: aiName.toUpperCase(),
        cat: 'lease',
        hash: '0x91…7ab3',
      },
      {
        ts: '14:22',
        body: { zh: 'Sarah Wang 查看了你的 身份 + 收入章 资料 · 第 3 次 · 停留 2m14s', en: 'Sarah Wang viewed your identity + income stamp profile · 3rd time · 2m14s' },
        who: 'LANDLORD',
        cat: 'access',
        hash: '0x2c…d740',
      },
      {
        ts: '11:05',
        lead: { zh: '下载租约 PDF', en: 'Downloaded the lease PDF' },
        body: { zh: 'Unit 1207 · King West · 含完整 audit log 附录', en: 'Unit 1207 · King West · includes full audit log appendix' },
        who: 'SELF',
        cat: 'lease',
        hash: '0x6e…1f88',
      },
    ],
  },
  {
    label: { zh: '2026/05/04 · 11 天前', en: '2026/05/04 · 11 days ago' },
    events: [
      {
        ts: '10:21',
        lead: { zh: '你授权 Flinks 访问银行', en: 'You authorized Flinks bank access' },
        body: { zh: '90 天银行流水（只读）· 盖 银行章', en: '90 days of bank transactions (read-only) · bank stamp' },
        who: 'SELF · CONSENT',
        cat: 'consent',
        hash: '0xa3…5c01',
      },
      {
        ts: '10:23',
        body: { zh: 'Flinks 读取 90 天银行流水（只读）· 收入区间 $9–12k · 稳定性 88/100', en: 'Flinks read 90 days of bank transactions (read-only) · income range $9–12k · stability 88/100' },
        who: 'FLINKS API',
        cat: 'access',
        hash: '0xb7…9e22',
      },
      {
        ts: '10:24',
        body: { zh: 'Persona 完成身份核验（只读）· 已盖 2/4 → 3/4 枚章', en: 'Persona completed identity verification (read-only) · 2/4 → 3/4 stamps' },
        who: 'PERSONA API',
        cat: 'access',
        hash: '0xc1…44af',
      },
      {
        ts: '10:25',
        body: { zh: 'Stayloop 向 Sarah Wang 发布 银行章 衍生数据 · 不含具体交易', en: 'Stayloop released bank-stamp derived data to Sarah Wang · no individual transactions' },
        who: 'SYSTEM',
        cat: 'access',
        hash: '0xd9…02e6',
      },
    ],
  },
  {
    label: { zh: '2026/05/03 · 12 天前', en: '2026/05/03 · 12 days ago' },
    events: [
      {
        ts: '16:10',
        lead: { zh: '你撤销了 David Park 的看房授权', en: 'You revoked David Park’s showing authorization' },
        body: { zh: '范围限定数据已即时停止共享', en: 'Scoped data sharing stopped immediately' },
        who: 'SELF · CONSENT',
        cat: 'consent',
        hash: '0x33…7b90',
      },
      {
        ts: '11:48',
        lead: { zh: 'Sarah Wang 批准 David Park 带看', en: 'Sarah Wang approved David Park to show the unit' },
        body: { zh: 'Unit 1207 · King West · 带看任务已确认', en: 'Unit 1207 · King West · showing task confirmed' },
        who: 'LANDLORD',
        cat: 'payment',
        hash: '0x58…ac12',
      },
      {
        ts: '09:22',
        body: { zh: `你给 Sarah Wang 发消息（${aiName} 起草，你确认）`, en: `You messaged Sarah Wang (drafted by ${aiName}, confirmed by you)` },
        who: 'SELF · TENANT',
        cat: 'lease',
        hash: '0x70…e3d5',
      },
    ],
  },
  {
    label: { zh: '2026/05/02 · 13 天前', en: '2026/05/02 · 13 days ago' },
    events: [
      {
        ts: '14:30',
        lead: { zh: '你提交看房意向', en: 'You submitted a showing request' },
        body: { zh: 'Unit 1207 · King West · 身份 + 收入章 资料分享 · 范围限定', en: 'Unit 1207 · King West · identity + income stamp profile shared · scope-limited' },
        who: 'SELF · INTENT',
        cat: 'consent',
        hash: '0x8b…51c7',
      },
    ],
  },
]

const FILTERS: { key: Category | 'all'; label: Bi }[] = [
  { key: 'all', label: { zh: '全部', en: 'All' } },
  { key: 'access', label: { zh: '数据访问', en: 'Data access' } },
  { key: 'consent', label: { zh: '同意/撤销', en: 'Consent / revoke' } },
  { key: 'lease', label: { zh: '租约动作', en: 'Lease actions' } },
  { key: 'payment', label: { zh: '支付', en: 'Payments' } },
]

export default function AuditLog({ role }: { role: WorkspaceRole }) {
  const { lang } = useT()
  const aiName = useAIName(role)
  const [active, setActive] = useState<Category | 'all'>('all')

  const days = DAYS(aiName).map((d) => ({
    ...d,
    events: active === 'all' ? d.events : d.events.filter((e) => e.cat === active),
  })).filter((d) => d.events.length > 0)

  return (
    <WorkspaceShell role={role} aside={<Aside />}>
      {/* Heading */}
      <div className="mb-7 max-w-[760px]">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {lang === 'zh' ? '完整事件流 · 不可篡改 · 区块链时间戳' : 'Complete event stream · immutable · blockchain timestamps'}
        </div>
        <h1 className="mt-2 text-[26px] sm:text-[34px] font-bold leading-tight tracking-tight">
          {lang === 'zh' ? '每一次访问 / 数据流转 都有记录' : 'Every access and data flow is recorded'}
        </h1>
        <p className="mt-3 text-body-2 text-[14px] leading-relaxed">
          {lang === 'zh'
            ? '争议时这是最终证据。租客 / 房东 / 经纪都可调取自己相关事件。'
            : 'In a dispute, this is the final evidence. Tenants, landlords and agents can each pull the events relevant to them.'}
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
              {f.label[lang]}
            </button>
          )
        })}
        <button onClick={() => window.print()} className="ml-auto rounded-full border border-line-strong bg-white px-3.5 py-[6px] text-[12px] font-semibold text-body-2 transition hover:border-brand hover:text-brand">
          {lang === 'zh' ? '下载 PDF' : 'Download PDF'}
        </button>
      </div>

      {/* Event stream */}
      <section className="sl-card overflow-hidden">
        {days.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px] text-body-3">
            {lang === 'zh' ? '该类别暂无事件。' : 'No events in this category yet.'}
          </div>
        ) : (
          days.map((day) => (
            <div key={day.label.en}>
              <div className="border-b border-line-divider bg-surface-chip px-6 py-2.5 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">
                {day.label[lang]}
              </div>
              {day.events.map((e, i) => (
                <div
                  key={day.label.en + i}
                  className="flex items-start gap-3 border-b border-line-divider px-4 py-4 last:border-b-0 sm:gap-4 sm:px-6"
                >
                  <div className="w-[40px] shrink-0 pt-[1px] font-mono text-[12px] font-bold text-body-3 sm:w-[44px]">
                    {e.ts}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] leading-snug text-body">
                      {e.lead && <span className="font-bold">{e.lead[lang]}</span>}
                      {e.lead && ' '}
                      <span className="text-body-2">{e.body[lang]}</span>
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
                        {lang === 'zh' ? '留痕' : 'Trace'} {e.hash}
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
  const { lang } = useT()
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? '留痕保障' : 'Trace guarantee'}
      </div>
      <div className="mt-3 sl-card p-4">
        <div className="text-[14px] font-bold">{lang === 'zh' ? '不可篡改 · 区块链时间戳' : 'Immutable · blockchain timestamps'}</div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-body-2">
          {lang === 'zh'
            ? '每条事件都写入链上哈希，任何人无法事后修改或删除。争议进入 LTB 时，这份记录即为最终证据。'
            : 'Every event is written to an on-chain hash that no one can later alter or delete. If a dispute reaches the LTB, this record is the final evidence.'}
        </div>
        <button onClick={() => window.print()} className="mt-3 w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-[12.5px] font-semibold transition hover:border-brand hover:text-brand">
          {lang === 'zh' ? '下载完整 PDF 报告' : 'Download full PDF report'}
        </button>
      </div>

      <div className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? '你的数据访问者' : 'Who accessed your data'}
      </div>
      <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
        <p>
          👤 <b>Sarah Wang</b> · {lang === 'zh' ? '房东 · 身份 + 收入章 资料 · 共查看 3 次' : 'Landlord · identity + income stamp profile · viewed 3 times'}
        </p>
        <p>
          🏦 <b>Flinks</b> · {lang === 'zh' ? '90 天银行流水（只读）· 已授权' : '90 days of bank transactions (read-only) · authorized'}
        </p>
        <p>
          🪪 <b>Persona</b> · {lang === 'zh' ? '身份核验（只读）· 已完成' : 'Identity verification (read-only) · completed'}
        </p>
        <p>
          🔑 <b>David Park</b> · {lang === 'zh' ? '看房授权 · ' : 'Showing authorization · '}<span className="text-danger">{lang === 'zh' ? '已撤销' : 'revoked'}</span>
        </p>
      </div>
    </div>
  )
}
