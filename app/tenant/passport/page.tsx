'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import Link from 'next/link'

interface FieldGroup {
  title: string
  tier: 1 | 2 | 3 | 4
  status: 'verified' | 'pending' | 'locked'
  source: string
  fields: Array<{ k: string; v: string; shared: boolean }>
}

const GROUPS: FieldGroup[] = [
  {
    title: '身份',
    tier: 1,
    status: 'verified',
    source: 'Persona · Apr 28, 2026',
    fields: [
      { k: '法定姓名', v: 'Mia Wang', shared: true },
      { k: '出生日期', v: '1996-03-12', shared: false },
      { k: '证件号码', v: 'CA P*****-****-3-04', shared: false },
      { k: '验证时间', v: '2026-04-28 14:32 EST', shared: true },
    ],
  },
  {
    title: '联系',
    tier: 1,
    status: 'verified',
    source: '邮箱 + 短信验证',
    fields: [
      { k: '邮箱', v: 'mia.wang@****.com', shared: true },
      { k: '电话', v: '+1 (416) ***-7821', shared: false },
    ],
  },
  {
    title: '收入',
    tier: 2,
    status: 'verified',
    source: 'Plaid · 实时连接 · TD Canada Trust',
    fields: [
      { k: '月收入', v: 'CAD 11,200', shared: true },
      { k: '雇主', v: 'Royal Bank of Canada', shared: true },
      { k: '工作年数', v: '2.4 年', shared: true },
      { k: '近 6 个月最低存款', v: 'CAD 18,400', shared: false },
    ],
  },
  {
    title: '银行透明度',
    tier: 3,
    status: 'pending',
    source: '点击连接 Plaid',
    fields: [
      { k: '现金流稳定度', v: '尚未连接', shared: false },
      { k: '退款 / 拒付次数', v: '尚未连接', shared: false },
    ],
  },
  {
    title: '信用 + 法庭',
    tier: 4,
    status: 'locked',
    source: 'Equifax + CanLII (升级到 Tier 4 后启用)',
    fields: [
      { k: '信用分', v: '----', shared: false },
      { k: 'LTB 法庭记录', v: '----', shared: false },
    ],
  },
]

export default function TenantPassport() {
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          RENTAL PASSPORT
        </div>
        <h1 className="mt-2 text-[36px] font-bold tracking-tight">你的 Passport · Mia Wang</h1>
        <p className="mt-2 max-w-[680px] text-[14.5px] leading-relaxed text-body-2">
          你的 Passport 由 Stayloop 加密保存。每个字段都是你说了算 — 房东只能看到你勾选了 ✓ 的部分。
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="tier-badge t1">TIER 1 ✓</span>
          <span className="tier-badge t2">TIER 2 ✓</span>
          <span className="tier-badge t3" style={{ opacity: 0.6 }}>TIER 3 · 部分</span>
          <span className="tier-badge t4" style={{ opacity: 0.4 }}>TIER 4 · 锁定</span>
          <span className="ml-auto text-[12px] text-body-3">最近更新 · 5 分钟前</span>
        </div>
      </div>

      <div className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g.title} className="sl-card p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[18px] font-bold tracking-tight">{g.title}</h3>
              <span className={`tier-badge t${g.tier}`}>TIER {g.tier}</span>
              {g.status === 'verified' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-brand">
                  ✓ VERIFIED
                </span>
              )}
              {g.status === 'pending' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-warning">
                  待完成
                </span>
              )}
              {g.status === 'locked' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-line-divider px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-body-3">
                  🔒 锁定
                </span>
              )}
              <span className="ml-auto font-mono text-[11px] text-body-3">{g.source}</span>
            </div>

            <div className="mt-5 divide-y divide-dashed divide-line-divider">
              {g.fields.map((f) => (
                <div key={f.k} className="grid grid-cols-[140px_1fr_120px] items-center gap-4 py-3">
                  <span className="font-mono text-[12px] font-semibold text-body-2">{f.k}</span>
                  <span className="text-[14px] font-semibold">{f.v}</span>
                  <span
                    className={
                      'inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider ' +
                      (f.shared
                        ? 'border-brand/30 bg-brand/5 text-brand'
                        : 'border-line text-body-3')
                    }
                  >
                    {f.shared ? '✓ 共享' : '🔒 私有'}
                  </span>
                </div>
              ))}
            </div>

            {g.status !== 'verified' && (
              <button className="mt-4 sl-btn-primary !text-[13px] !py-[10px] !px-4">
                {g.status === 'pending' ? '继续完成' : '升级到 Tier ' + g.tier}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 sl-card p-6">
        <h3 className="text-[16px] font-bold tracking-tight">活跃授权</h3>
        <p className="mt-1 text-[13px] text-body-2">
          这些房东 / 经纪 当前可以查看你的部分 Passport · 你可以随时撤销
        </p>
        <div className="mt-4 space-y-2">
          {[
            { who: 'Mike Park (88 Harbour) · 房东', scope: 'Tier 1 + 收入 + 月入', exp: '2026-05-22 后失效' },
            { who: 'Sarah Chen · Field Agent', scope: 'Tier 1 · 联系方式', exp: '看房后 24 小时' },
          ].map((g) => (
            <div key={g.who} className="flex items-center justify-between rounded-xl bg-surface-chip px-4 py-3">
              <div>
                <div className="text-[14px] font-semibold">{g.who}</div>
                <div className="font-mono text-[11px] text-body-3">{g.scope} · {g.exp}</div>
              </div>
              <button className="text-[12.5px] font-semibold text-danger hover:underline">
                撤销
              </button>
            </div>
          ))}
        </div>
      </div>
    </WorkspaceShell>
  )
}
