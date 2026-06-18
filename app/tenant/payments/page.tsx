'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'

const HISTORY = [
  { date: '2026-05-01', amount: 2800, status: 'paid', method: 'Plaid · RBC ****8721' },
  { date: '2026-04-01', amount: 2800, status: 'paid', method: 'Plaid · RBC ****8721' },
  { date: '2026-03-01', amount: 2800, status: 'paid', method: 'e-Transfer' },
  { date: '2026-02-01', amount: 2800, status: 'late', method: '迟付 3 天' },
  { date: '2026-01-01', amount: 2800, status: 'paid', method: 'Plaid · RBC ****8721' },
]

export default function TenantPaymentsPage() {
  const name = useAIName()
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          RENT PAYMENTS
        </div>
        <h1 className="mt-2 text-[26px] sm:text-[36px] font-bold tracking-tight">租金支付</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="sl-card p-7">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            下次扣款
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[44px] font-extrabold tracking-tight">$2,800</span>
            <span className="text-[14px] text-body-3">/ 月</span>
          </div>
          <div className="mt-1 text-[13px] text-body-2">5月22日 · 自动扣款 · RBC ****8721</div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="sl-btn-secondary">立即支付（提前付）</button>
            <button className="sl-btn-ghost">暂停 1 个月（需房东同意）</button>
          </div>

          <div className="mt-6 rounded-xl bg-success/10 p-4 text-[13px] text-success">
            ✓ 你今年所有付款都准时 · 你的还款记录已计入 认证 信任分
          </div>
        </div>

        {/* Right column — matches V5.3 design: 房客信用 + LUNA 续约提醒 */}
        <div className="flex flex-col gap-4">
          <div className="sl-card p-6">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              你的房客信用
            </div>
            <div className="mt-1 text-[40px] font-extrabold leading-none text-success">A+</div>
            <p className="mt-3 text-[13px] leading-relaxed text-body-2">
              10/10 准时 · 优于 92% Stayloop 用户。下个房东会自动看到你的纪录（你授权才能看）。
            </p>
          </div>

          <div className="sl-card border border-tenant/30 bg-tenant/[0.04] p-6">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-5 rounded-full bg-tenant/20 text-center text-[11px] leading-5">🟣</span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-tenant">
                {name} · 续约提醒
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-body-2">
              还有 <b>2 个月</b>到期。市场租金 +6%，房东可能会提议涨租。
            </p>
            <p className="mt-3 text-[13px] text-body-2">我帮你准备续约谈判材料？</p>
            <button className="sl-btn-secondary mt-3 w-full">→ 准备材料</button>
          </div>
        </div>
      </div>

      <div className="mt-8 sl-card overflow-hidden">
        <div className="border-b border-line-divider px-6 py-4">
          <h3 className="text-[16px] font-bold tracking-tight">付款历史</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[13.5px]">
          <thead className="bg-surface-chip">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">日期</th>
              <th className="px-6 py-3 text-right font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">金额</th>
              <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">方式</th>
              <th className="px-6 py-3 text-right font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">状态</th>
            </tr>
          </thead>
          <tbody>
            {HISTORY.map((p) => (
              <tr key={p.date} className="border-t border-line-divider">
                <td className="px-6 py-3 font-mono">{p.date}</td>
                <td className="px-6 py-3 text-right font-mono font-bold">${p.amount.toLocaleString()}</td>
                <td className="px-6 py-3 text-body-2">{p.method}</td>
                <td className="px-6 py-3 text-right">
                  <span
                    className={
                      'rounded-md px-2 py-1 font-mono text-[10.5px] font-bold uppercase ' +
                      (p.status === 'paid'
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning')
                    }
                  >
                    {p.status === 'paid' ? 'PAID' : 'LATE'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </WorkspaceShell>
  )
}
