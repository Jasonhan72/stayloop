'use client'

// V5 VOL2 · Tenant · 租约审阅 + 第 6 页 · 签名 (Ontario Standard Lease / LTB).
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'

const CLAUSES = [
  {
    num: 4,
    title: '租金',
    body: '月租 CAD $2,800,每月 1 号前付清。延期 5 天以上,房东有权按 LTB N4 流程发出通知。',
    explain: 'Luna 解释: 这是 Ontario 标准 RTA 第 109 条要求,延期 5 天是法律允许的 grace period。',
  },
  {
    num: 7,
    title: '提前退租',
    body: '若你需要在租期内提前搬走,须提前 60 天书面通知 + 协助找新租客。',
    explain: 'Luna 提醒: 60 天通知是 Ontario 法定要求 (RTA s.47),"协助找新租客"是合理但非强制条款。',
    warn: true,
  },
  {
    num: 12,
    title: '宠物',
    body: '允许一只小型猫,需缴 $500 保证金 (退租时按损耗扣除)。',
    explain: 'Luna 注意: Ontario RTA 不允许 no-pet 条款,但允许 reasonable 的损耗费。$500 在合理范围。',
  },
  {
    num: 18,
    title: '终止',
    body: '租期届满后转 month-to-month,除非任一方按 RTA 提前发出有效通知终止。',
    explain: 'Luna 解释: 这是 Ontario 默认续期规则 (RTA s.38),对你有利 —— 房东不能在租期内随意赶你走。',
  },
]

export default function TenantLeasePage() {
  return (
    <WorkspaceShell role="tenant" aside={<SigningAside />}>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          LEASE · 6 / 6 页 · 签名页
        </div>
        <h1 className="mt-2 text-[36px] font-bold tracking-tight">Unit 1207 · King West 租约</h1>
        <p className="mt-2 text-[14px] text-body-2">
          Luna 已经读完整份租约,标出了 4 条你需要特别注意的条款。看完后,在底部签名。
        </p>
      </div>

      <div className="mx-auto max-w-[760px] sl-card p-8 sm:p-10">
        <div className="border-b border-line-divider pb-4">
          <h2 className="text-[20px] font-bold">Ontario Standard Lease · LTB 标准表</h2>
          <p className="mt-1 text-[12px] font-mono uppercase text-body-3">
            房东: Sarah Wang · 租客: Mia Chen · 租期 12mo · 起 2026/06/01
          </p>
        </div>

        {CLAUSES.map((c) => (
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
                第 {c.num} 条 · {c.title}
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-body">{c.body}</p>
            </div>
            <div className="mt-2 grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-tenant/22 bg-tenant/5 px-3 py-3">
              <span
                className="h-5 w-5 rounded-full"
                style={{
                  background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)',
                }}
              />
              <p className="text-[12.5px] leading-relaxed text-tenant-deep">{c.explain}</p>
            </div>
          </div>
        ))}

        {/* 第 6 页 · 签名 */}
        <div className="mt-10 border-t border-line-divider pt-8">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            第 6 页 · 签名
          </div>
          <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-body-2">
            <p>
              本 Residential Tenancy Agreement 由租客与房东在自愿、知情、平等基础上达成。双方确认已阅读并理解所有条款,
              包括但不限于第 4 条（租金）、第 7 条（提前退租）、第 12 条（宠物）、第 18 条（终止）。
            </p>
            <p>
              本协议自双方签署之日起生效,受 Ontario Residential Tenancies Act, 2006 (RTA) 约束。任何与 RTA 相抵触的条款均无效。
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-tenant/30 bg-tenant/5 p-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-tenant">租客</div>
              <div className="mt-2 font-[cursive] text-[24px] italic text-tenant-deep">Mia Chen</div>
              <div className="mt-1 font-mono text-[10.5px] text-body-3">✓ 已签 · 2026/05/15 18:42</div>
            </div>
            <div className="rounded-xl border border-dashed border-line-strong bg-white p-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">房东</div>
              <div className="mt-2 text-[16px] font-semibold text-body-3">待 Sarah 签</div>
              <div className="mt-1 font-mono text-[10.5px] text-body-3">⏱ 等签 · ~2 小时内</div>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-surface-chip px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-body-3">
            本签名采用 Ontario eDocuments &amp; Electronic Signatures Act 标准 · 哈希值 0x4f...e9c2 ·
            时间戳由独立时间戳服务器锁定 · 该签名在 Ontario 法庭具同等效力。
          </p>

          <div className="mt-6 grid gap-2">
            <button className="sl-btn-primary !py-[14px] !text-[14.5px]">
              ✓ 确认签署 · 已完成
            </button>
            <Link
              href="/tenant/move-in"
              className="rounded-[10px] border border-tenant/30 bg-tenant/5 px-5 py-[12px] text-center text-[14px] font-semibold text-tenant transition hover:bg-tenant/10"
            >
              双方签完 → 进入入住 Day-1 清单 →
            </Link>
            <button className="rounded-[10px] border border-line-strong bg-white px-5 py-[12px] text-[14px] font-semibold text-body">
              下载 PDF 给法务看
            </button>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}

function SigningAside() {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }}
        />
        <div>
          <div className="text-[14px] font-bold">Luna 在这里 · SIGNING</div>
          <div className="font-mono text-[10.5px] text-body-3">最后确认 · 帮你核对</div>
        </div>
      </div>

      <div className="mt-4 sl-card p-4">
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
          签前最后确认
        </div>
        <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
          <li>✓ 月租 $2,800 · 每月 1 号前</li>
          <li>✓ 押金 $2,800 · Stripe 托管(非 damage deposit)</li>
          <li>✓ 一只猫 · $500 损耗保证金</li>
          <li>✓ 提前退租 60 天通知</li>
        </ul>
      </div>

      <div className="mt-6 font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
        签署进度
      </div>
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-[11px] font-bold text-success">✓</span>
          <div className="text-[12.5px]">
            <span className="font-semibold">Mia Chen</span>
            <span className="ml-1 font-mono text-[10.5px] text-body-3">5/15 18:42</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-chip text-[11px] text-body-3">⏱</span>
          <div className="text-[12.5px]">
            <span className="font-semibold text-body-3">Sarah Wang</span>
            <span className="ml-1 font-mono text-[10.5px] text-body-3">等签 · ~2 小时内</span>
          </div>
        </div>
      </div>
    </div>
  )
}
