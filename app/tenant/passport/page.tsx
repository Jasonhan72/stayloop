'use client'

import { useState } from 'react'
import Link from 'next/link'
import AIProactive from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'
import { stampForTier, stampLabel, STAMP_CHECK_GREEN } from '@/lib/passportStamps'

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
    title: { zh: '身份章', en: 'Identity stamp' },
    desc: { zh: '扫证件 + 自拍，90 秒 · Persona 验证', en: 'Scan ID + selfie, 90 seconds · Persona verification' },
    status: 'done',
    fields: [
      { zh: '法定姓名', en: 'Legal name' },
      { zh: '身份证件', en: 'ID document' },
      { zh: '邮箱 + 电话', en: 'Email + phone' },
    ],
  },
  {
    level: 2,
    title: { zh: '收入章', en: 'Income stamp' },
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
    title: { zh: '银行章', en: 'Bank stamp' },
    desc: { zh: '连接一次银行流水，约 5 分钟', en: 'Connect your bank once, ~5 minutes' },
    status: 'current',
    fields: [
      { zh: '现金流稳定性', en: 'Cash-flow stability' },
      { zh: '退款记录', en: 'NSF history' },
    ],
  },
  {
    level: 4,
    title: { zh: '信用 + 法庭章', en: 'Credit + court stamp' },
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
              ? '你的 Passport 是你向房东展示可信度的通行证。验证一次 · 处处通行，章越多，房东审批越快。'
              : 'Your Passport proves trustworthiness to landlords. Verify once, travel everywhere — more stamps mean faster approvals.'}
          </p>
        </div>

        <AIProactive
          role="tenant"
          insights={[
            {
              text: {
                zh: '盖上银行章（约 5 分钟）——连接一次银行流水，可解锁多 42% 的房源，房东审批也更快。',
                en: 'Earn your bank stamp (~5 minutes) — one bank connection unlocks 42% more listings and faster approvals.',
              },
              action: {
                label: { zh: '带我盖章', en: 'Walk me through it' },
                prompt: {
                  zh: '帮我盖上银行章，告诉我需要做什么。',
                  en: 'Help me earn the bank stamp — what do I need to do?',
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
                  {stampLabel(completedCount, lang)}
                </span>
              </div>
              <p className="mt-1 text-[13.5px] text-body-2">
                {zh
                  ? `下一枚：${currentTier.title.zh} —— ${currentTier.desc.zh}`
                  : `Next stamp: ${currentTier.title.en} — ${currentTier.desc.en}`}
              </p>
            </div>
            <Link
              href={currentTier.status === 'current' ? '/onboarding/tier1' : '#'}
              className="sl-btn-primary !px-6 !py-3 shrink-0"
            >
              {zh ? '盖这枚章 →' : 'Stamp it →'}
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

          {/* Stamp cards (四枚章位：已盖 / 下一枚 / 待盖) */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TIERS.map((t) => {
              const stamp = stampForTier(t.level)
              return (
                <div
                  key={t.level}
                  className={
                    'relative rounded-xl px-4 py-3 transition ' +
                    (t.status === 'done'
                      ? 'border border-tenant/40 bg-tenant/[0.06]'
                      : t.status === 'current'
                      ? 'border-[1.5px] border-dashed border-warning/50 bg-warning/[0.04]'
                      : 'border-[1.5px] border-dashed border-line-divider bg-surface-chip opacity-60')
                  }
                >
                  <span
                    className={
                      'absolute top-3 right-3 font-mono text-[9px] font-bold tracking-wide ' +
                      (t.status === 'done'
                        ? ''
                        : t.status === 'current'
                        ? 'text-warning'
                        : 'text-body-3')
                    }
                    style={t.status === 'done' ? { color: STAMP_CHECK_GREEN } : undefined}
                  >
                    {t.status === 'done'
                      ? zh ? '✓ 已盖章' : '✓ Stamped'
                      : t.status === 'current'
                      ? zh ? `● 下一枚${stamp.est_zh ? ` · ${stamp.est_zh}` : ''}` : `● Next${stamp.est_en ? ` · ${stamp.est_en}` : ''}`
                      : zh ? '待盖' : 'Locked'}
                  </span>
                  {/* Seal */}
                  <div
                    className={
                      'relative mb-2 flex h-11 w-11 items-center justify-center rounded-full text-[20px] ' +
                      (t.status === 'done'
                        ? 'bg-gradient-to-br from-[#C4B5FD] to-tenant shadow-[0_4px_14px_rgba(124,58,237,0.4)]'
                        : 'bg-surface-chip')
                    }
                    style={t.status === 'done' ? { transform: 'rotate(-8deg)' } : undefined}
                  >
                    <span className={t.status === 'locked' ? 'grayscale opacity-70' : ''}>{stamp.icon}</span>
                    {t.status === 'done' && (
                      <span
                        aria-hidden
                        className="absolute -right-[7px] -bottom-[7px] flex h-[22px] w-[22px] items-center justify-center rounded-full text-[13px] font-extrabold text-white"
                        style={{
                          background: STAMP_CHECK_GREEN,
                          border: '2.5px solid #131118',
                          transform: 'rotate(8deg)',
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] font-semibold tracking-tight">{t.title[lang]}</div>
                  <div className="mt-0.5 text-[11.5px] leading-relaxed text-body-3">
                    {zh ? stamp.what_zh : stamp.what_en}
                  </div>
                  <div className="mt-2 border-t border-dashed border-line-divider pt-1.5 text-[11.5px] leading-relaxed">
                    <span className="block font-mono text-[9px] tracking-wider text-body-3">
                      {zh ? '解锁' : 'UNLOCKS'}
                    </span>
                    <span className={t.status === 'done' ? 'text-tenant' : 'text-body-2'}>
                      {zh ? stamp.gain_zh : stamp.gain_en}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 text-center font-mono text-[10.5px] tracking-wide text-body-3">
            {zh
              ? '支持 护照 · 签证 · 枫叶卡 · 工签 —— 没有加拿大信用记录，也能盖章。'
              : 'Passport · visa · PR card · work permit all supported — no Canadian credit history needed to earn stamps.'}
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
                scope: { zh: '身份 + 收入章数据', en: 'Identity + income stamp data' },
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
