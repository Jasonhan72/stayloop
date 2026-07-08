'use client'

import { useState } from 'react'
import Link from 'next/link'
import AIProactive from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'

type Bi = { zh: string; en: string }

type SharingMode = 'open' | 'conservative' | 'custom'

interface TierInfo {
  level: 1 | 2 | 3 | 4
  title: Bi
  desc: Bi
  status: 'done' | 'current' | 'locked'
  fields: Bi[]
}

const TIERS: TierInfo[] = [
  {
    level: 1,
    title: { zh: '身份认证', en: 'Identity' },
    desc: { zh: '护照/驾照 + 自拍 · Persona 验证', en: 'Passport/licence + selfie · Persona verification' },
    status: 'done',
    fields: [
      { zh: '法定姓名', en: 'Legal name' },
      { zh: '身份证件', en: 'ID document' },
      { zh: '邮箱 + 电话', en: 'Email + phone' },
    ],
  },
  {
    level: 2,
    title: { zh: '收入验证', en: 'Income' },
    desc: { zh: '连接银行 · 雇主 + 月收入自动核实', en: 'Connect bank · employer + income auto-verified' },
    status: 'done',
    fields: [
      { zh: '月收入', en: 'Monthly income' },
      { zh: '雇主名称', en: 'Employer' },
      { zh: '工作年限', en: 'Years employed' },
    ],
  },
  {
    level: 3,
    title: { zh: '银行透明度', en: 'Banking' },
    desc: { zh: '现金流稳定性 + 退款记录', en: 'Cash-flow stability + NSF history' },
    status: 'current',
    fields: [
      { zh: '现金流评分', en: 'Cash-flow score' },
      { zh: '退款/拒付次数', en: 'Returns / NSF count' },
    ],
  },
  {
    level: 4,
    title: { zh: '信用 + 法庭', en: 'Credit + Court' },
    desc: { zh: 'Equifax 信用分 + LTB 法庭记录', en: 'Equifax credit score + LTB court records' },
    status: 'locked',
    fields: [
      { zh: '信用分', en: 'Credit score' },
      { zh: 'LTB 记录', en: 'LTB records' },
    ],
  },
]

const SHARING_MODES: Array<{ key: SharingMode; title: Bi; desc: Bi }> = [
  {
    key: 'open',
    title: { zh: '宽松', en: 'Open' },
    desc: { zh: '共享全部已验证字段 — 90% 租客选这个', en: 'Share all verified fields — 90% of tenants choose this' },
  },
  {
    key: 'conservative',
    title: { zh: '保守', en: 'Conservative' },
    desc: { zh: '仅共享验证结果 (✓/✗)，不暴露具体数值', en: 'Share verification results only (✓/✗), hide exact values' },
  },
  {
    key: 'custom',
    title: { zh: '自定义', en: 'Custom' },
    desc: { zh: '逐项控制每个字段的可见性', en: 'Control visibility per field' },
  },
]

export default function TenantPassport() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [sharingMode, setSharingMode] = useState<SharingMode>('open')

  const currentTier = TIERS.find((t) => t.status === 'current') ?? TIERS[2]
  const completedCount = TIERS.filter((t) => t.status === 'done').length
  const progressPercent = (completedCount / TIERS.length) * 100

  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
            RENTAL PASSPORT
          </div>
          <h1 className="mt-2 text-[26px] sm:text-[32px] font-bold tracking-tight">
            {zh ? '信任仪表盘' : 'Trust Dashboard'}
          </h1>
          <p className="mt-1.5 max-w-[560px] text-[14px] leading-relaxed text-body-2">
            {zh
              ? '你的 Passport 是你向房东展示可信度的通行证。等级越高，房东审批越快。'
              : 'Your Passport proves trustworthiness to landlords. Higher tiers mean faster approvals.'}
          </p>
        </div>

        <AIProactive
          role="tenant"
          insights={[
            {
              text: {
                zh: '升级到认证 3 级只差银行流水一步（约 5 分钟），可解锁多 42% 的房源，房东审批也更快。',
                en: 'Tier 3 is one bank-transparency step away (~5 minutes) — it unlocks 42% more listings and faster approvals.',
              },
              action: {
                label: { zh: '带我升级', en: 'Walk me through it' },
                prompt: {
                  zh: '帮我升级到认证 3 级，告诉我需要做什么。',
                  en: 'Help me upgrade to Tier 3 — what do I need to do?',
                },
              },
            },
            {
              text: {
                zh: 'Sarah Wang 本月查看了你的资料 3 次 — 通常代表强意向。要不要主动跟进？',
                en: 'Sarah Wang viewed your profile 3 times this month — usually a strong signal. Want to follow up?',
              },
              action: {
                label: { zh: '主动跟进', en: 'Follow up' },
                prompt: {
                  zh: 'Sarah Wang 多次查看我的资料，帮我起草一条得体的跟进消息。',
                  en: 'Sarah Wang keeps viewing my profile — draft a tasteful follow-up message.',
                },
              },
            },
          ]}
        />

        {/* ── Progress card ── */}
        <div className="sl-card p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] sm:text-[42px] font-bold tracking-tight text-tenant">
                  {zh ? `认证 ${completedCount} 级` : `Tier ${completedCount}`}
                </span>
                <span className="text-[14px] text-body-3">/ 4</span>
              </div>
              <p className="mt-1 text-[13.5px] text-body-2">
                {zh
                  ? `下一步：${currentTier.title.zh} — ${currentTier.desc.zh}`
                  : `Next: ${currentTier.title.en} — ${currentTier.desc.en}`}
              </p>
            </div>
            <Link
              href={currentTier.status === 'current' ? '/onboarding/tier1' : '#'}
              className="sl-btn-primary !px-6 !py-3 shrink-0"
            >
              {zh
                ? `升级到认证 ${currentTier.level} 级 →`
                : `Upgrade to Tier ${currentTier.level} →`}
            </Link>
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-body-3 mb-2">
              {TIERS.map((t) => (
                <span key={t.level} className={t.status === 'done' ? 'text-tenant' : ''}>
                  {t.status === 'done' ? '✓' : t.level}
                </span>
              ))}
            </div>
            <div className="h-2 w-full rounded-full bg-line-divider overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, #7C3AED 0%, #A78BFA 100%)',
                }}
              />
            </div>
          </div>

          {/* Tier timeline */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TIERS.map((t) => (
              <div
                key={t.level}
                className={
                  'rounded-xl border px-4 py-3 transition ' +
                  (t.status === 'done'
                    ? 'border-tenant/30 bg-tenant/[0.04]'
                    : t.status === 'current'
                    ? 'border-warning/40 bg-warning/[0.04]'
                    : 'border-line-divider bg-surface-chip opacity-60')
                }
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="font-mono text-[11px] font-bold text-body-3">
                    {t.status === 'done' ? '✓' : t.status === 'current' ? '◐' : '🔒'}{' '}
                    {zh ? `认证 ${t.level} 级` : `Tier ${t.level}`}
                  </span>
                </div>
                <div className="text-[13px] font-semibold tracking-tight">{t.title[lang]}</div>
                <div className="mt-1 space-y-0.5">
                  {t.fields.map((f) => (
                    <div key={f.en} className="text-[11.5px] text-body-3">{f[lang]}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sharing mode ── */}
        <div className="sl-card p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-[18px] font-bold tracking-tight">
                {zh ? '共享策略' : 'Sharing policy'}
              </h2>
              <p className="mt-1 text-[13px] text-body-2">
                {zh
                  ? '申请房源时，房东能看到哪些信息'
                  : 'What landlords can see when you apply'}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {SHARING_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setSharingMode(m.key)}
                className={
                  'rounded-xl border px-4 py-4 text-left transition ' +
                  (sharingMode === m.key
                    ? 'border-tenant bg-tenant/[0.05] ring-1 ring-tenant/30'
                    : 'border-line-divider hover:border-line-strong')
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      'flex h-5 w-5 items-center justify-center rounded-full border-2 transition ' +
                      (sharingMode === m.key
                        ? 'border-tenant bg-tenant'
                        : 'border-line-strong')
                    }
                  >
                    {sharingMode === m.key && (
                      <span className="block h-2 w-2 rounded-full bg-white" />
                    )}
                  </span>
                  <span className="text-[14px] font-bold">{m.title[lang]}</span>
                </div>
                <p className="mt-2 pl-7 text-[12.5px] leading-relaxed text-body-2">
                  {m.desc[lang]}
                </p>
              </button>
            ))}
          </div>
          {sharingMode === 'custom' && (
            <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface-chip px-5 py-4">
              <p className="text-[13px] text-body-2">
                {zh
                  ? '自定义模式：你可以在每次申请时逐项选择共享哪些字段。'
                  : 'Custom mode: you can choose per-field visibility each time you apply.'}
              </p>
            </div>
          )}
        </div>

        {/* ── Sharing summary + link ── */}
        <div className="sl-card p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-bold tracking-tight">
                {zh ? '授权管理' : 'Authorizations'}
              </h2>
              <p className="mt-1 text-[13.5px] text-body-2">
                {zh
                  ? '已授权 4 人/服务查看你的数据 · 本月被查询 3 次'
                  : '4 people/services authorized · 3 queries this month'}
              </p>
            </div>
            <Link
              href="/tenant/passport/sharing"
              className="sl-btn-secondary shrink-0"
            >
              {zh ? '管理授权 →' : 'Manage access →'}
            </Link>
          </div>

          {/* Quick preview — top 2 authorizations */}
          <div className="mt-5 space-y-2.5">
            {[
              {
                name: 'Sarah Wang',
                role: { zh: '房东 · Unit 1207', en: 'Landlord · Unit 1207' },
                scope: { zh: '认证 2 级数据', en: 'Tier 2 data' },
                color: '#F97316',
              },
              {
                name: 'David Park',
                role: { zh: 'Field Agent · 看房', en: 'Field Agent · Showing' },
                scope: { zh: '偏好 + 看房问题', en: 'Preferences + questions' },
                color: '#3B82F6',
              },
            ].map((g) => (
              <div key={g.name} className="flex items-center gap-3 rounded-xl bg-surface-chip px-4 py-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{ background: g.color }}
                >
                  {g.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-[13.5px] font-semibold">{g.name}</span>
                  <span className="ml-2 text-[12px] text-body-3">{g.role[lang]}</span>
                </div>
                <span className="hidden sm:inline text-[11.5px] font-mono text-body-3">{g.scope[lang]}</span>
              </div>
            ))}
            <Link
              href="/tenant/passport/sharing"
              className="block text-center text-[12.5px] font-semibold text-tenant hover:underline pt-1"
            >
              {zh ? '查看全部 4 项授权 →' : 'View all 4 authorizations →'}
            </Link>
          </div>
        </div>

        {/* ── Quick actions ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/tenant/audit"
            className="sl-card flex items-center gap-4 p-5 transition hover:border-line-strong"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-chip text-[18px]">
              📋
            </span>
            <div>
              <div className="text-[14px] font-bold">{zh ? '审计日志' : 'Audit log'}</div>
              <div className="mt-0.5 text-[12.5px] text-body-2">
                {zh ? '查看所有数据访问记录' : 'View all data access records'}
              </div>
            </div>
          </Link>
          <Link
            href="/settings"
            className="sl-card flex items-center gap-4 p-5 transition hover:border-line-strong"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-chip text-[18px]">
              🔐
            </span>
            <div>
              <div className="text-[14px] font-bold">{zh ? '隐私设置' : 'Privacy settings'}</div>
              <div className="mt-0.5 text-[12.5px] text-body-2">
                {zh ? '管理通知偏好与数据保留' : 'Manage notification & data retention'}
              </div>
            </div>
          </Link>
        </div>
      </div>
    </WorkspaceShell>
  )
}
