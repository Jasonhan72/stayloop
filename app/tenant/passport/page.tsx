'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import Link from 'next/link'
import { useT } from '@/lib/i18n'

type Bi = { zh: string; en: string }

interface FieldGroup {
  title: Bi
  tier: 1 | 2 | 3 | 4
  status: 'verified' | 'pending' | 'locked'
  source: Bi
  fields: Array<{ k: Bi; v: Bi; shared: boolean }>
}

const GROUPS: FieldGroup[] = [
  {
    title: { zh: '身份', en: 'Identity' },
    tier: 1,
    status: 'verified',
    source: { zh: 'Persona · Apr 28, 2026', en: 'Persona · Apr 28, 2026' },
    fields: [
      { k: { zh: '法定姓名', en: 'Legal name' }, v: { zh: 'Mia Chen', en: 'Mia Chen' }, shared: true },
      { k: { zh: '出生日期', en: 'Date of birth' }, v: { zh: '1996-03-12', en: '1996-03-12' }, shared: false },
      { k: { zh: '证件号码', en: 'Document number' }, v: { zh: 'CA P*****-****-3-04', en: 'CA P*****-****-3-04' }, shared: false },
      { k: { zh: '验证时间', en: 'Verified at' }, v: { zh: '2026-04-28 14:32 EST', en: '2026-04-28 14:32 EST' }, shared: true },
    ],
  },
  {
    title: { zh: '联系', en: 'Contact' },
    tier: 1,
    status: 'verified',
    source: { zh: '邮箱 + 短信验证', en: 'Email + SMS verified' },
    fields: [
      { k: { zh: '邮箱', en: 'Email' }, v: { zh: 'mia.chen@****.com', en: 'mia.chen@****.com' }, shared: true },
      { k: { zh: '电话', en: 'Phone' }, v: { zh: '+1 (416) ***-7821', en: '+1 (416) ***-7821' }, shared: false },
    ],
  },
  {
    title: { zh: '收入', en: 'Income' },
    tier: 2,
    status: 'verified',
    source: { zh: 'Plaid · 实时连接 · TD Canada Trust', en: 'Plaid · live connection · TD Canada Trust' },
    fields: [
      { k: { zh: '月收入', en: 'Monthly income' }, v: { zh: 'CAD 11,200', en: 'CAD 11,200' }, shared: true },
      { k: { zh: '雇主', en: 'Employer' }, v: { zh: 'Royal Bank of Canada', en: 'Royal Bank of Canada' }, shared: true },
      { k: { zh: '工作年数', en: 'Years employed' }, v: { zh: '2.4 年', en: '2.4 yrs' }, shared: true },
      { k: { zh: '近 6 个月最低存款', en: 'Min. balance (last 6 mo)' }, v: { zh: 'CAD 18,400', en: 'CAD 18,400' }, shared: false },
    ],
  },
  {
    title: { zh: '银行透明度', en: 'Banking transparency' },
    tier: 3,
    status: 'pending',
    source: { zh: '点击连接 Plaid', en: 'Tap to connect Plaid' },
    fields: [
      { k: { zh: '现金流稳定度', en: 'Cash-flow stability' }, v: { zh: '尚未连接', en: 'Not connected yet' }, shared: false },
      { k: { zh: '退款 / 拒付次数', en: 'Returns / NSF count' }, v: { zh: '尚未连接', en: 'Not connected yet' }, shared: false },
    ],
  },
  {
    title: { zh: '信用 + 法庭', en: 'Credit + court' },
    tier: 4,
    status: 'locked',
    source: { zh: 'Equifax + CanLII (升级到 认证 4 级 后启用)', en: 'Equifax + CanLII (unlocked after upgrading to Tier 4)' },
    fields: [
      { k: { zh: '信用分', en: 'Credit score' }, v: { zh: '----', en: '----' }, shared: false },
      { k: { zh: 'LTB 法庭记录', en: 'LTB court records' }, v: { zh: '----', en: '----' }, shared: false },
    ],
  },
]

export default function TenantPassport() {
  const { lang } = useT()
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          RENTAL PASSPORT
        </div>
        <h1 className="mt-2 text-[26px] sm:text-[36px] font-bold tracking-tight">{lang === 'zh' ? '你的 Passport · Mia Chen' : 'Your Passport · Mia Chen'}</h1>
        <p className="mt-2 max-w-[680px] text-[14.5px] leading-relaxed text-body-2">
          {lang === 'zh'
            ? '你的 Passport 由 Stayloop 加密保存。每个字段都是你说了算 — 房东只能看到你勾选了 ✓ 的部分。'
            : 'Your Passport is encrypted and stored by Stayloop. You control every field — landlords only see the items you have checked ✓.'}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="tier-badge t1">{lang === 'zh' ? '认证 1 级 ✓' : 'Tier 1 ✓'}</span>
          <span className="tier-badge t2">{lang === 'zh' ? '认证 2 级 ✓' : 'Tier 2 ✓'}</span>
          <span className="tier-badge t3" style={{ opacity: 0.6 }}>{lang === 'zh' ? '认证 3 级 · 部分' : 'Tier 3 · partial'}</span>
          <span className="tier-badge t4" style={{ opacity: 0.4 }}>{lang === 'zh' ? '认证 4 级 · 锁定' : 'Tier 4 · locked'}</span>
          <span className="ml-auto text-[12px] text-body-3">{lang === 'zh' ? '最近更新 · 5 分钟前' : 'Last updated · 5 min ago'}</span>
        </div>
      </div>

      {/* Identity verification — deferred out of onboarding, started here. */}
      <Link
        href="/onboarding/tier1"
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-tenant/30 bg-tenant/[0.05] px-6 py-4 transition hover:bg-tenant/10"
      >
        <div>
          <div className="text-[15px] font-bold tracking-tight">{lang === 'zh' ? '完成 认证 1 级 · 90 秒验明身份' : 'Complete Tier 1 · verify your identity in 90 seconds'}</div>
          <div className="mt-0.5 text-[12.5px] text-body-2">
            {lang === 'zh'
              ? '护照 / 驾照 + 一张自拍,Persona 帮你安全完成 · 软查不影响信用 · 比 90% 的询盘更让房东放心。'
              : 'Passport / licence + a quick selfie, securely handled by Persona · soft check, no credit impact · more reassuring to landlords than 90% of inquiries.'}
          </div>
        </div>
        <span className="rounded-[10px] bg-tenant px-4 py-[10px] text-[13.5px] font-semibold text-white">{lang === 'zh' ? '开始验证 →' : 'Start verification →'}</span>
      </Link>

      <div className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g.title.en} className="sl-card p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[18px] font-bold tracking-tight">{g.title[lang]}</h3>
              <span className={`tier-badge t${g.tier}`}>{lang === 'zh' ? `认证 ${g.tier} 级` : `Tier ${g.tier}`}</span>
              {g.status === 'verified' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-brand">
                  ✓ VERIFIED
                </span>
              )}
              {g.status === 'pending' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-warning">
                  {lang === 'zh' ? '待完成' : 'To complete'}
                </span>
              )}
              {g.status === 'locked' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-line-divider px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-body-3">
                  {lang === 'zh' ? '🔒 锁定' : '🔒 Locked'}
                </span>
              )}
              <span className="ml-auto font-mono text-[11px] text-body-3">{g.source[lang]}</span>
            </div>

            <div className="mt-5 divide-y divide-dashed divide-line-divider">
              {g.fields.map((f) => (
                <div key={f.k.en} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[140px_1fr_120px] sm:gap-4">
                  <span className="font-mono text-[12px] font-semibold text-body-2">{f.k[lang]}</span>
                  <span className="order-3 col-span-2 text-[14px] font-semibold sm:order-none sm:col-span-1">{f.v[lang]}</span>
                  <span
                    className={
                      'inline-flex items-center justify-center gap-1 justify-self-end whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider sm:justify-self-auto ' +
                      (f.shared
                        ? 'border-brand/30 bg-brand/5 text-brand'
                        : 'border-line text-body-3')
                    }
                  >
                    {f.shared ? (lang === 'zh' ? '✓ 共享' : '✓ Shared') : (lang === 'zh' ? '🔒 私有' : '🔒 Private')}
                  </span>
                </div>
              ))}
            </div>

            {g.status !== 'verified' && (
              <button className="mt-4 sl-btn-primary !text-[13px] !py-[10px] !px-4">
                {g.status === 'pending'
                  ? (lang === 'zh' ? '继续完成' : 'Continue')
                  : (lang === 'zh' ? '升级到 认证 ' + g.tier + ' 级' : 'Upgrade to Tier ' + g.tier)}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 sl-card p-6">
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {lang === 'zh' ? 'RENTAL PASSPORT · 共享中' : 'RENTAL PASSPORT · SHARING'}
        </div>
        <h3 className="mt-2 text-[22px] font-bold tracking-tight">
          {lang === 'zh' ? '你授权了 4 个人 / 服务看你的资料' : 'You have authorized 4 people / services to view your data'}
        </h3>
        <p className="mt-1 text-[13px] text-body-2">
          {lang === 'zh'
            ? '每一项都可以一键撤销 · 30 秒生效 · 撤销后立即从对方系统中删除'
            : 'Each one can be revoked with one tap · effective in 30 seconds · deleted from their system immediately after revoking'}
        </p>
        <div className="mt-5 space-y-3">
          {[
            {
              who: { zh: 'Sarah Wang · 房东 · Unit 1207', en: 'Sarah Wang · Landlord · Unit 1207' },
              color: '#F97316',
              time: { zh: '2026/05/02 14:30 · 通过申请意向', en: '2026/05/02 14:30 · via application intent' },
              see: { zh: '认证 2 级 资料 · 雇主验证 · 偏好 · 你的回复语气', en: 'Tier 2 data · employer verification · preferences · your reply tone' },
              noSee: { zh: '具体工资 · 银行流水 · 家庭背景', en: 'exact salary · bank statements · family background' },
              action: { zh: '撤回授权', en: 'Revoke access' },
              actionStyle: 'text-danger',
            },
            {
              who: { zh: 'David Park · Field Agent · 看房', en: 'David Park · Field Agent · Showing' },
              color: '#3B82F6',
              time: { zh: '2026/05/03 11:48 · 周三 14:00 · 临时', en: '2026/05/03 11:48 · Wed 14:00 · temporary' },
              see: { zh: '你的偏好、你的方式、看房问题清单', en: 'your preferences, your approach, showing question list' },
              noSee: { zh: '财务资料 · 申请历史', en: 'financial data · application history' },
              action: { zh: '看后自动撤销', en: 'Auto-revokes after showing' },
              actionStyle: 'text-info',
            },
            {
              who: { zh: 'Persona SDK · 身份验证商', en: 'Persona SDK · Identity verifier' },
              color: '#8B5CF6',
              time: { zh: '2026/04/28 · 永久 · 加密存储', en: '2026/04/28 · permanent · encrypted storage' },
              see: { zh: '为你做了：基础身份核检', en: 'Done for you: basic identity check' },
              noSee: { zh: '注：他们只看你的护照 + 自拍，不看其他', en: 'Note: they only see your passport + selfie, nothing else' },
              action: { zh: '系统级 · 不可撤', en: 'System-level · cannot revoke' },
              actionStyle: 'text-body-3',
            },
            {
              who: { zh: 'Flinks · 银行 API', en: 'Flinks · Banking API' },
              color: '#10B981',
              time: { zh: '2026/05/04 10:21 · 90 天过期', en: '2026/05/04 10:21 · expires in 90 days' },
              see: { zh: '为你做了：认证 3 级 收入与稳定性核验', en: 'Done for you: Tier 3 income and stability verification' },
              noSee: null as Bi | null,
              action: { zh: '撤回授权', en: 'Revoke access' },
              actionStyle: 'text-danger',
            },
          ].map((g) => (
            <div key={g.who.en} className="flex items-start gap-4 rounded-xl bg-surface-chip px-5 py-4">
              <span
                className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
                style={{ background: g.color }}
              >
                {g.who.en[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold">{g.who[lang]}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-body-3">{g.time[lang]}</div>
                <div className="mt-2 text-[12.5px] leading-relaxed text-body-2">
                  <span className="font-semibold text-brand">{lang === 'zh' ? '能看到：' : 'Can see: '}</span>{g.see[lang]}
                </div>
                {g.noSee && (
                  <div className="mt-0.5 text-[12.5px] text-body-3">
                    <span className="font-semibold">{lang === 'zh' ? '看不到：' : 'Cannot see: '}</span>{g.noSee[lang]}
                  </div>
                )}
              </div>
              <button className={`flex-shrink-0 text-[12.5px] font-semibold hover:underline ${g.actionStyle}`}>
                {g.action[lang]}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 text-[12px] text-body-3">
          {lang === 'zh'
            ? '🔐 完整 audit log · 每一次查看 / 数据导出 / 第三方调用都有时间戳。'
            : '🔐 Full audit log · every view / data export / third-party call is timestamped.'}
          <Link href="#" className="ml-1 font-semibold text-brand hover:underline">{lang === 'zh' ? '查看完整日志 →' : 'View full log →'}</Link>
        </div>
      </div>
    </WorkspaceShell>
  )
}
