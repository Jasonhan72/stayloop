'use client'

import AIProactive from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'

const HISTORY = [
  { date: '2026-05-01', amount: 2800, status: 'paid', method: { zh: 'Plaid · RBC ****8721', en: 'Plaid · RBC ****8721' } },
  { date: '2026-04-01', amount: 2800, status: 'paid', method: { zh: 'Plaid · RBC ****8721', en: 'Plaid · RBC ****8721' } },
  { date: '2026-03-01', amount: 2800, status: 'paid', method: { zh: 'e-Transfer', en: 'e-Transfer' } },
  { date: '2026-02-01', amount: 2800, status: 'late', method: { zh: '迟付 3 天', en: '3 days late' } },
  { date: '2026-01-01', amount: 2800, status: 'paid', method: { zh: 'Plaid · RBC ****8721', en: 'Plaid · RBC ****8721' } },
]

export default function TenantPaymentsPage() {
  const name = useAIName()
  const { lang } = useT()
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          RENT PAYMENTS
        </div>
        <h1 className="mt-2 text-[26px] sm:text-[36px] font-bold tracking-tight">{lang === 'zh' ? '租金支付' : 'Rent Payments'}</h1>
      </div>

      <AIProactive
        role="tenant"
        insights={[
          {
            text: {
              zh: '2 月那次迟付 3 天可以补充情况说明（如银行转账延迟），{ai} 帮你写好并归档，避免影响信任分。',
              en: "February's 3-day late payment can carry an explanation (e.g. bank transfer delay). {ai} writes and files it so your trust score isn't dinged.",
            },
            action: {
              label: { zh: '补充说明', en: 'Add explanation' },
              prompt: {
                zh: '帮我为 2 月迟付 3 天写一份情况说明并归档，原因是银行转账延迟。',
                en: 'Write and file an explanation for the February 3-day late payment — cause was a bank transfer delay.',
              },
            },
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="sl-card p-7">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            {lang === 'zh' ? '下次扣款' : 'Next payment'}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[44px] font-extrabold tracking-tight">$2,800</span>
            <span className="text-[14px] text-body-3">{lang === 'zh' ? '/ 月' : '/ mo'}</span>
          </div>
          <div className="mt-1 text-[13px] text-body-2">{lang === 'zh' ? '5月22日 · 自动扣款 · RBC ****8721' : 'May 22 · auto-debit · RBC ****8721'}</div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="sl-btn-secondary">{lang === 'zh' ? '立即支付（提前付）' : 'Pay now (early)'}</button>
            <button className="sl-btn-ghost">{lang === 'zh' ? '暂停 1 个月（需房东同意）' : 'Pause 1 month (needs landlord consent)'}</button>
          </div>

          <div className="mt-6 rounded-xl bg-success/10 p-4 text-[13px] text-success">
            {lang === 'zh'
              ? '✓ 你今年所有付款都准时 · 你的还款记录已计入 护照信任分'
              : '✓ All your payments this year were on time · your payment record counts toward your Passport trust score'}
          </div>
        </div>

        {/* Right column — matches V5.3 design: 房客信用 + LUNA 续约提醒 */}
        <div className="flex flex-col gap-4">
          <div className="sl-card p-6">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {lang === 'zh' ? '你的房客信用' : 'Your tenant credit'}
            </div>
            <div className="mt-1 text-[40px] font-extrabold leading-none text-success">A+</div>
            <p className="mt-3 text-[13px] leading-relaxed text-body-2">
              {lang === 'zh'
                ? '10/10 准时 · 优于 92% Stayloop 用户。下个房东会自动看到你的纪录（你授权才能看）。'
                : '10/10 on time · better than 92% of Stayloop users. Your next landlord will automatically see your record (only with your authorization).'}
            </p>
          </div>

          <div className="sl-card border border-tenant/30 bg-tenant/[0.04] p-6">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-5 rounded-full bg-tenant/20 text-center text-[11px] leading-5">🟣</span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-tenant">
                {lang === 'zh' ? `${name} · 续约提醒` : `${name} · Renewal reminder`}
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-body-2">
              {lang === 'zh' ? (
                <>还有 <b>2 个月</b>到期。市场租金 +6%，房东可能会提议涨租。</>
              ) : (
                <><b>2 months</b> until your lease ends. Market rent is up 6%, so the landlord may propose an increase.</>
              )}
            </p>
            <p className="mt-3 text-[13px] text-body-2">{lang === 'zh' ? '我帮你准备续约谈判材料？' : 'Want me to prepare your renewal negotiation materials?'}</p>
            <button className="sl-btn-secondary mt-3 w-full">{lang === 'zh' ? '→ 准备材料' : '→ Prepare materials'}</button>
          </div>
        </div>
      </div>

      <div className="mt-8 sl-card overflow-hidden">
        <div className="border-b border-line-divider px-6 py-4">
          <h3 className="text-[16px] font-bold tracking-tight">{lang === 'zh' ? '付款历史' : 'Payment history'}</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[13.5px]">
          <thead className="bg-surface-chip">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '日期' : 'Date'}</th>
              <th className="px-6 py-3 text-right font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '金额' : 'Amount'}</th>
              <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '方式' : 'Method'}</th>
              <th className="px-6 py-3 text-right font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '状态' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {HISTORY.map((p) => (
              <tr key={p.date} className="border-t border-line-divider">
                <td className="px-6 py-3 font-mono">{p.date}</td>
                <td className="px-6 py-3 text-right font-mono font-bold">${p.amount.toLocaleString()}</td>
                <td className="px-6 py-3 text-body-2">{p.method[lang]}</td>
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
