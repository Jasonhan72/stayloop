'use client'

import WorkspaceShell from '@/components/WorkspaceShell'

const HISTORY = [
  { date: '2026-05-01', amount: 3450, status: 'paid', method: 'Plaid · TD ****1234' },
  { date: '2026-04-01', amount: 3450, status: 'paid', method: 'Plaid · TD ****1234' },
  { date: '2026-03-01', amount: 3450, status: 'paid', method: 'e-Transfer' },
  { date: '2026-02-01', amount: 3450, status: 'late', method: '迟付 3 天' },
  { date: '2026-01-01', amount: 3450, status: 'paid', method: 'Plaid · TD ****1234' },
]

export default function TenantPaymentsPage() {
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          RENT PAYMENTS
        </div>
        <h1 className="mt-2 text-[36px] font-bold tracking-tight">租金支付</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="sl-card p-7">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            下次扣款
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[44px] font-extrabold tracking-tight">$3,450</span>
            <span className="text-[14px] text-body-3">/ 月</span>
          </div>
          <div className="mt-1 text-[13px] text-body-2">2026-06-01 · 自动扣款 · TD ****1234</div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="sl-btn-secondary">提前付款</button>
            <button className="sl-btn-ghost">修改支付方式</button>
          </div>

          <div className="mt-6 rounded-xl bg-success/10 p-4 text-[13px] text-success">
            ✓ 你今年所有付款都准时 · 你的还款记录已计入 Tier 信任分
          </div>
        </div>

        <div className="sl-card p-6">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            本年度总览
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <div className="text-[20px] font-bold text-brand">5</div>
              <div className="font-mono text-[10.5px] uppercase text-body-3">已付月数</div>
            </div>
            <div>
              <div className="text-[20px] font-bold text-warning">1</div>
              <div className="font-mono text-[10.5px] uppercase text-body-3">迟付次数</div>
            </div>
            <div>
              <div className="text-[20px] font-bold">$17,250</div>
              <div className="font-mono text-[10.5px] uppercase text-body-3">YTD</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 sl-card overflow-hidden">
        <div className="border-b border-line-divider px-6 py-4">
          <h3 className="text-[16px] font-bold tracking-tight">付款历史</h3>
        </div>
        <table className="w-full text-[13.5px]">
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
    </WorkspaceShell>
  )
}
