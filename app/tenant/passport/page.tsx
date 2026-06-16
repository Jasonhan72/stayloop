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
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          RENTAL PASSPORT · 共享中
        </div>
        <h3 className="mt-2 text-[22px] font-bold tracking-tight">
          你授权了 4 个人 / 服务看你的资料
        </h3>
        <p className="mt-1 text-[13px] text-body-2">
          每一项都可以一键撤销 · 30 秒生效 · 撤销后立即从对方系统中删除
        </p>
        <div className="mt-5 space-y-3">
          {[
            {
              who: 'Sarah Wang · 房东 · Unit 1207',
              color: '#F97316',
              time: '2026/05/02 14:30 · 通过申请意向',
              see: '认证 2 级 资料 + 房主核定 · 身份 · 你的简短语气',
              noSee: '真他工资、银行流水、驾照全码',
              action: '撤回授权',
              actionStyle: 'text-danger',
            },
            {
              who: 'David Park · Field Agent · 看房',
              color: '#3B82F6',
              time: '2026/05/03 11:48 · 周三 14:00 · 临时',
              see: '你的偏好、你的方式、看房问题清单',
              noSee: '财务资料 · 申请历史',
              action: '看后自动撤销',
              actionStyle: 'text-info',
            },
            {
              who: 'Persona SDK · 身份验证商',
              color: '#8B5CF6',
              time: '2026/04/28 · 永久 · 加密存储',
              see: '为你做了：基础身份核检',
              noSee: '注：他们只看你的护照 + 自拍，不看其他',
              action: '检查',
              actionStyle: 'text-body-3',
            },
            {
              who: 'Flinks · 银行 API',
              color: '#10B981',
              time: '2026/05/04 10:21 · 90 天过期',
              see: '为你做了：认证 3 级 收入与稳定性核验',
              noSee: null,
              action: '撤回授权',
              actionStyle: 'text-danger',
            },
          ].map((g) => (
            <div key={g.who} className="flex items-start gap-4 rounded-xl bg-surface-chip px-5 py-4">
              <span
                className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
                style={{ background: g.color }}
              >
                {g.who[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold">{g.who}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-body-3">{g.time}</div>
                <div className="mt-2 text-[12.5px] leading-relaxed text-body-2">
                  <span className="font-semibold text-brand">能看到：</span>{g.see}
                </div>
                {g.noSee && (
                  <div className="mt-0.5 text-[12.5px] text-body-3">
                    <span className="font-semibold">看不到：</span>{g.noSee}
                  </div>
                )}
              </div>
              <button className={`flex-shrink-0 text-[12.5px] font-semibold hover:underline ${g.actionStyle}`}>
                {g.action}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 text-[12px] text-body-3">
          🔐 完整 audit log · 每一次查看 / 数据导出 / 第三方调用都有时间戳。
          <Link href="#" className="ml-1 font-semibold text-brand hover:underline">查看完整日志 →</Link>
        </div>
      </div>
    </WorkspaceShell>
  )
}
