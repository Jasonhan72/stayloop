'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'

const DIMS = [
  { name: { zh: '证件真实性', en: 'ID authenticity' }, val: 96, w: 20, color: '#7C3AED', note: { zh: '护照 + 自拍均通过 · 与 Persona DB 100% 匹配', en: 'Passport + selfie both passed · 100% match against Persona DB' } },
  { name: { zh: '支付能力', en: 'Ability to pay' },   val: 91, w: 20, color: '#047857', note: { zh: 'Plaid 直连 · DTI 30.8% · 6 个月最低存款 $18,400', en: 'Plaid linked · DTI 30.8% · 6-month low balance $18,400' } },
  { name: { zh: '法庭记录', en: 'Court records' },   val: 100, w: 20, color: '#DC2626', note: { zh: 'CanLII / LTB 无任何相关记录', en: 'No related records on CanLII / LTB' } },
  { name: { zh: '稳定性', en: 'Stability' },     val: 87, w: 15, color: '#2563EB', note: { zh: 'RBC 工作 2.4 年 · 现地址 1.2 年', en: '2.4 yrs at RBC · 1.2 yrs at current address' } },
  { name: { zh: '行为信号', en: 'Behavioral signals' },   val: 88, w: 13, color: '#D97706', note: { zh: '上家房东评价 5/5 · 无违规', en: 'Prior landlord rating 5/5 · no violations' } },
  { name: { zh: '信息一致性', en: 'Information consistency' }, val: 95, w: 12, color: '#0B0B0E', note: { zh: '所有字段在 4 份资料中一致 · 0 异常', en: 'All fields consistent across 4 documents · 0 anomalies' } },
]

const FILES = [
  { name: 'passport.pdf',     type: 'ID',     size: '1.2 MB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'paystub-may.pdf',  type: 'PAY',    size: '320 KB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'plaid-bank.pdf',   type: 'BANK',   size: '500 KB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'rbc-letter.pdf',   type: 'EMP',    size: '180 KB', date: { zh: '2 天前', en: '2 days ago' } },
]

export default function ApplicantDetail() {
  const { lang } = useT()
  const { id } = useParams<{ id: string }>()
  return (
    <WorkspaceShell role="landlord" hideAside>
      <Link href="/landlord/applicants" className="font-mono text-[12px] text-body-3 hover:text-body">
        {lang === 'zh' ? '← 返回所有申请' : '← Back to all applications'}
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
            <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Mia Chen</h1>
            <div className="font-mono text-[11.5px] text-body-3">
              {lang === 'zh'
                ? `申请 #${id} · Unit 1207 · King West · 2 天前提交`
                : `Application #${id} · Unit 1207 · King West · submitted 2 days ago`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tier-badge t3">{lang === 'zh' ? '认证 3 级' : 'Tier 3'}</span>
          <span className="rounded-md bg-success/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-success">
            {lang === 'zh' ? '推荐审批' : 'Recommended'}
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="sl-card p-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[18px] font-bold tracking-tight">{lang === 'zh' ? '六维 AI 评分' : 'Six-dimension AI score'}</h2>
            <div className="text-right">
              <div className="font-mono text-[40px] font-extrabold leading-none text-brand">92</div>
              <div className="font-mono text-[10.5px] uppercase text-body-3">/100</div>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {DIMS.map((d) => (
              <div key={d.name.en}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[13.5px] font-semibold">
                    {d.name[lang]} <span className="font-mono text-[10.5px] text-body-3">· {lang === 'zh' ? '权重' : 'Weight'} {d.w}%</span>
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
                <div className="mt-1 text-[12px] text-body-2">{d.note[lang]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">{lang === 'zh' ? 'Logic 建议' : 'Logic recommends'}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
              {lang === 'zh'
                ? 'Mia 在六个维度全部超过你的政策门槛, 行为信号无负面记录, 与你过去 12 个月签的 7 位 认证 3 级 租客的 profile 高度相似 (88% 续签 / 0 投诉)。'
                : 'Mia clears your policy threshold on all six dimensions, has no negative behavioral signals, and closely matches the profile of the 7 Tier 3 tenants you signed over the past 12 months (88% renewed / 0 complaints).'}
            </p>
            <p className="mt-2 text-[13px] font-semibold text-brand">
              {lang === 'zh'
                ? '建议: 批看房，看完后请她升 认证 3 级 给你完整收入证据，再决定签约。'
                : 'Suggestion: approve the showing, then ask her to upgrade to Tier 3 for full income evidence before deciding on the lease.'}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button className="sl-btn-primary !py-[12px]">
                {lang === 'zh' ? '✓ 批准看房 · 派 David' : '✓ Approve showing · assign David'}
              </button>
              <button className="sl-btn-secondary">{lang === 'zh' ? '★★★ 请她升 认证 3 级' : '★★★ Ask her to upgrade to Tier 3'}</button>
              <button className="sl-btn-secondary">{lang === 'zh' ? '💬 先跟她聊一下（Luna 中介）' : '💬 Chat with her first (via Luna)'}</button>
              <button className="rounded-lg border border-danger/40 bg-white px-4 py-[10px] text-[13.5px] font-semibold text-danger">
                {lang === 'zh' ? '✗ 不合适（需选理由）' : '✗ Not a fit (reason required)'}
              </button>
            </div>
            <p className="mt-3 rounded-lg bg-danger/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-body-2">
              <b className="text-danger">⚠️ {lang === 'zh' ? 'RTA 提示：' : 'RTA notice: '}</b>
              {lang === 'zh'
                ? '「不合适」理由不能是种族 / 国籍 / 来源国 / 家庭情况 / 性取向。Logic 会过滤这些，但你拒绝时仍需具体理由 — 写入 audit log。'
                : 'A "not a fit" reason cannot be race / nationality / country of origin / family status / sexual orientation. Logic filters these out, but you still need a specific reason when declining — it is written to the audit log.'}
            </p>
          </div>

          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">{lang === 'zh' ? '提交的文件' : 'Submitted documents'}</h3>
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
              {lang === 'zh'
                ? '所有文件加密保存 · 你查看 = 在 audit log 留痕'
                : 'All files stored encrypted · your view = logged in the audit log'}
            </p>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
