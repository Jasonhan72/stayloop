'use client'

import WorkspaceShell from '@/components/WorkspaceShell'

const CLAUSES = [
  {
    title: '租金',
    body: '月租 CAD $3,450,每月 1 号前付清。延期 5 天以上,房东有权按 LTB N4 流程发出通知。',
    explain: 'Luna 解释: 这是 Ontario 标准 RTA 第 109 条要求,延期 5 天是法律允许的 grace period。',
  },
  {
    title: '押金',
    body: '入住前缴付一个月押金 (last month rent),按 OREA 标准条款,带 prime rate 的利息计算。',
    explain: 'Luna 解释: Ontario 不允许收 damage deposit,只能收 last month rent。这条合规。',
  },
  {
    title: '宠物',
    body: '允许一只小型猫,需缴 $500 保证金 (退租时按损耗扣除)。',
    explain: 'Luna 注意: Ontario RTA 不允许 no-pet 条款,但允许 reasonable 的损耗费。$500 在合理范围。',
    warn: false,
  },
  {
    title: '提前终止',
    body: '若你需要在租期内提前搬走,须提前 60 天书面通知 + 协助找新租客。',
    explain: 'Luna 提醒: 60 天通知是 Ontario 法定要求 (RTA s.47),"协助找新租客"是合理但非强制条款。',
    warn: true,
  },
]

export default function TenantLeasePage() {
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          LEASE REVIEW
        </div>
        <h1 className="mt-2 text-[36px] font-bold tracking-tight">88 Harbour St 租约</h1>
        <p className="mt-2 text-[14px] text-body-2">
          Luna 已经读完整份租约,标出了 4 条你需要特别注意的条款。
        </p>
      </div>

      <div className="mx-auto max-w-[760px] sl-card p-8 sm:p-10">
        <div className="border-b border-line-divider pb-4">
          <h2 className="text-[20px] font-bold">Ontario Standard Lease · OREA Form 400</h2>
          <p className="mt-1 text-[12px] font-mono uppercase text-body-3">
            房东: Mike Park · 租客: Mia Wang · 租期 12mo · 起 2026-05-22
          </p>
        </div>

        {CLAUSES.map((c, i) => (
          <div key={c.title} className="mt-6">
            <div
              className={
                'rounded-r-lg border-l-[3px] px-4 py-3 ' +
                (c.warn ? 'bg-warning/5 border-warning' : 'bg-surface-chip border-brand')
              }
            >
              <div
                className={
                  'font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg ' +
                  (c.warn ? 'text-warning' : 'text-brand')
                }
              >
                CLAUSE {i + 1} · {c.title}
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-body">{c.body}</p>
            </div>
            <div className="mt-2 grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-tenant/22 bg-tenant/5 px-3 py-3">
              <span
                className="h-5 w-5 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)',
                }}
              />
              <p className="text-[12.5px] leading-relaxed text-tenant-deep">{c.explain}</p>
            </div>
          </div>
        ))}

        <div className="mt-10 border-t border-line-divider pt-6">
          <div className="grid gap-2">
            <button className="sl-btn-primary !py-[14px] !text-[14.5px]">
              ✓ 我同意 · 进入电子签名
            </button>
            <button className="rounded-[10px] border border-line-strong bg-white px-5 py-[12px] text-[14px] font-semibold text-body">
              下载 PDF 给法务看
            </button>
            <button className="rounded-[10px] border border-warning/40 bg-white px-5 py-[12px] text-[14px] font-semibold text-warning">
              先和 Luna 讨论
            </button>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
