'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'

const PHOTO_TILES: { room: string; emoji: string; need: string; done?: number }[] = [
  { room: '客厅', emoji: '🛋️', need: '需 ≥4 张', done: 4 },
  { room: '卧室', emoji: '🛏️', need: '需 ≥4 张', done: 4 },
  { room: '厨房 · 含电器', emoji: '🍳', need: '需 ≥6 张' },
  { room: '卫生间', emoji: '🚿', need: '需 ≥4 张' },
  { room: '已有损耗 · 特写', emoji: '🔍', need: '逐处拍清' },
]

const FACILITIES: { label: string; done: boolean }[] = [
  { label: '大门钥匙 × 2', done: true },
  { label: '信箱钥匙', done: true },
  { label: '健身房卡', done: true },
  { label: '暖气使用说明', done: false },
  { label: 'WiFi 名称 + 密码', done: false },
]

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={
        'flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold ' +
        (on ? 'bg-success text-white' : 'border border-line-divider text-body-3')
      }
    >
      {on ? '✓' : ''}
    </span>
  )
}

export default function TenantMoveInPage() {
  const name = useAIName()
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mx-auto max-w-[760px]">
        <div className="mb-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">
            入住 · DAY 1 · 2026/06/01
          </div>
          <h1 className="mt-2 text-[24px] sm:text-[32px] font-bold tracking-tight">
            欢迎搬入 Unit 1207 · King West
          </h1>
          <p className="mt-2 text-[13.5px] text-body-2">
            Mia，房东 Sarah Wang 已交接。完成这三步，今天就正式安顿好了。
          </p>
        </div>

        {/* ── Luna guidance banner ── */}
        <div className="mb-6 sl-card border border-tenant/30 bg-tenant/[0.04] p-5">
          <div className="flex items-center gap-2">
            <span className="inline-block h-5 w-5 rounded-full bg-tenant/20 text-center text-[11px] leading-5">🟣</span>
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-tenant">
              {name} · 入住向导
            </span>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">
            退租时最常见的纠纷就是押金。今天先把房子的真实状态拍清楚、确认收到的实物、核对押金托管 —
            这三件事做完，你的 <b>$2,800 押金</b>在搬出时就有据可依。
          </p>
        </div>

        {/* ── Task 1 · move-in condition photos ── */}
        <div className="mb-5 sl-card p-5 sm:p-7">
          <h2 className="text-[18px] font-bold tracking-tight">📷 入住状态拍照（关键）</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
            这些照片会被时间戳锁定，作为退租时的对照标准 — 保护你的押金。{name} 会把它们存进
            audit log，搬出时房东无法以「原本就有的损耗」扣你的钱。
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PHOTO_TILES.map((t) => {
              const captured = typeof t.done === 'number'
              return (
                <button
                  key={t.room}
                  className={
                    'flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-5 text-center transition ' +
                    (captured
                      ? 'border-success/40 bg-success/[0.06]'
                      : 'border-dashed border-line-divider bg-surface-chip hover:border-tenant/50 hover:bg-tenant/[0.04]')
                  }
                >
                  <span className="text-[28px] leading-none">{t.emoji}</span>
                  <span className="mt-1 text-[13px] font-semibold">{t.room}</span>
                  {captured ? (
                    <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-success">
                      已拍 {t.done} 张
                    </span>
                  ) : (
                    <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                      {t.need}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-4 rounded-xl bg-surface-chip p-3 text-[12px] text-body-3">
            进度 2 / 5 房间已完成 · 全部拍完后才能提交给 Sarah
          </div>
        </div>

        {/* ── Task 2 · facilities + keys ── */}
        <div className="mb-5 sl-card p-5 sm:p-7">
          <h2 className="text-[18px] font-bold tracking-tight">🔧 设施 + 钥匙</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
            逐项确认收到的实物。打勾即记录交接时间，缺漏的当场告诉 Sarah。
          </p>

          <div className="mt-5 divide-y divide-line-divider rounded-2xl border border-line-divider">
            {FACILITIES.map((f) => (
              <div key={f.label} className="flex items-center gap-3 px-4 py-3">
                <Check on={f.done} />
                <span
                  className={
                    'text-[14px] ' + (f.done ? 'text-body' : 'text-body-2')
                  }
                >
                  {f.label}
                </span>
                {f.done && (
                  <span className="ml-auto font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-success">
                    已确认
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Task 3 · deposit + first month rent ── */}
        <div className="mb-5 sl-card p-5 sm:p-7">
          <h2 className="text-[18px] font-bold tracking-tight">💰 押金 + 第一月租</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
            已自动从你的账户转出 · 由 Stripe 托管 · 见 audit log。
          </p>

          <div className="mt-5 divide-y divide-line-divider rounded-2xl border border-line-divider">
            <div className="flex items-center gap-3 px-4 py-4">
              <Check on />
              <div>
                <div className="text-[14px] font-semibold">首月租 $2,800 · 已支付（6/1）</div>
                <div className="text-[12px] text-body-3">转给 Sarah Wang · Stripe</div>
              </div>
              <span className="ml-auto font-mono text-[11px] font-bold uppercase tracking-eyebrow text-success">
                PAID
              </span>
            </div>
            <div className="flex items-center gap-3 px-4 py-4">
              <Check on />
              <div>
                <div className="text-[14px] font-semibold">押金 $2,800 · Stripe 托管</div>
                <div className="text-[12px] text-body-3">退租前由第三方保管 · 双方任一方不可单独动用</div>
              </div>
              <span className="ml-auto font-mono text-[11px] font-bold uppercase tracking-eyebrow text-success">
                ESCROW
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-surface-chip p-3 font-mono text-[11px] leading-relaxed text-body-3">
            AUDIT LOG · 2026-06-01 09:14 — 押金 $2,800 转入 Stripe 托管账户（Mia Chen → escrow）
            <br />
            AUDIT LOG · 2026-06-01 09:14 — 首月租 $2,800 已结算给 Sarah Wang
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button className="sl-btn-primary px-7 py-3.5">完成入住检查 · 提交给 Sarah</button>
          <button className="sl-btn-ghost px-6 py-3.5">有问题，先暂停</button>
        </div>
      </div>
    </WorkspaceShell>
  )
}
