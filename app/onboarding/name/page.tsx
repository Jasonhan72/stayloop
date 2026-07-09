'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import OnboardingStage from '@/components/OnboardingStage'
import { setAIName } from '@/lib/aiName'
import { useAuth } from '@/lib/useAuth'
import { useOnboarded } from '@/lib/useOnboarding'
import { useT } from '@/lib/i18n'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { AgentRole } from '@/lib/agent/types'

const ROLE_CONFIG: Record<AgentRole, {
  default: string
  suggestions: string[]
  color: string
  colorLight: string
  accent: string
  orbBg: string
  orbShadow: string
  desc: { zh: string; en: string }
  preview: { zh: (n: string) => string; en: (n: string) => string }
  helps: { zh: string; en: string }[]
  cta: { zh: (n: string) => string; en: (n: string) => string }
}> = {
  tenant: {
    default: 'Luna',
    suggestions: ['Luna', 'Mia', 'Aria', '小鹿', '木木', 'Echo', 'Nova', '豆包'],
    color: ROLE_THEME.tenant.accent,
    colorLight: ROLE_THEME.tenant.lightRgba,
    accent: ROLE_THEME.tenant.onboardingAccent,
    orbBg: ROLE_THEME.tenant.onboardingOrb,
    orbShadow: ROLE_THEME.tenant.orbShadow,
    desc: {
      zh: '她会读取你的专属记忆、理解你的进度，从这一刻起陪你走完注册 · 找房 · 申请 · 入住 · 以后所有事。',
      en: 'It reads your personal memory, understands your progress, and from this moment walks you through sign-up · finding · applying · moving in · everything after.',
    },
    preview: {
      zh: (n) => `「Hi，我是 ${n}。从现在起,找房、申请、签约、入住,我全程陪你 —— 你提要求,我负责跑腿,关键决策始终是你的。」`,
      en: (n) => `"Hi, I'm ${n}. From now on — finding a place, applying, signing, moving in — I'm with you the whole way. You set the goals, I do the legwork, and the key decisions are always yours."`,
    },
    helps: [
      { zh: '完成注册 · 身份 / 收入 / 推荐人', en: 'Finish sign-up · identity / income / references' },
      { zh: '从你的需求筛房源 · 提看房', en: 'Screen listings to your needs · request showings' },
      { zh: '起草申请 · 跟进 · 准备查问', en: 'Draft applications · follow up · prep for questions' },
      { zh: '入住 / 续约 / 维修 / 退租继续陪跑', en: 'Move-in / renewal / repairs / move-out — stays with you' },
    ],
    cta: {
      zh: (n) => `开始 · 进入 ${n} 工作台 →`,
      en: (n) => `Start · enter ${n}'s workspace →`,
    },
  },
  landlord: {
    default: 'Logic',
    suggestions: ['Logic', 'Atlas', 'Slate', '逻辑', '清和', 'Orion', 'Apex', '稳哥'],
    color: ROLE_THEME.landlord.accent,
    colorLight: ROLE_THEME.landlord.lightRgba,
    accent: ROLE_THEME.landlord.onboardingAccent,
    orbBg: ROLE_THEME.landlord.onboardingOrb,
    orbShadow: ROLE_THEME.landlord.orbShadow,
    desc: {
      zh: '你的专属 AI 房东助手：整理申请、同步尽调、合规把关、起草租约 —— 决定权,始终在你手里。',
      en: 'Your dedicated AI landlord assistant: organizes applications, runs due diligence, ensures compliance, drafts leases — you keep the final say.',
    },
    preview: {
      zh: (n) => `「你好,我是 ${n}。从今天开始,申请审核、尽调、合规、续约这些事交给我;关键的决定,你点头就好。」`,
      en: (n) => `"Hi, I'm ${n}. From today, leave application reviews, due diligence, compliance, and renewals to me — the key decisions are always yours."`,
    },
    helps: [
      { zh: '申请人 Pipeline · 一眼看清所有申请', en: 'Applicant Pipeline · see every application at a glance' },
      { zh: '8 Engine 自动尽调 + 可解释评分', en: '8-Engine auto due diligence + explainable scoring' },
      { zh: '合规教练 · 当场提醒 RTA 雷区', en: 'Compliance coach · real-time RTA reminders' },
      { zh: '一页式决策包 · 租约自动起草', en: 'One-page decision pack · auto-draft leases' },
    ],
    cta: {
      zh: (n) => `开始 · 进入 ${n} 工作台 →`,
      en: (n) => `Start · enter ${n}'s workspace →`,
    },
  },
  agent: {
    default: 'Brief',
    suggestions: ['Brief', 'Scout', 'Relay', '飞书', '小布', 'Dash', 'Pace', '领航'],
    color: ROLE_THEME.agent.accent,
    colorLight: ROLE_THEME.agent.lightRgba,
    accent: ROLE_THEME.agent.onboardingAccent,
    orbBg: ROLE_THEME.agent.onboardingOrb,
    orbShadow: ROLE_THEME.agent.orbShadow,
    desc: {
      zh: '你的专属 AI 经纪助手：整理客户、准备材料、安排看房、现场反馈 —— 行政杂活交给它,你专注做人和判断。',
      en: 'Your dedicated AI broker assistant: manages clients, prepares materials, schedules showings, collects feedback — admin work handled, you focus on people and judgment.',
    },
    preview: {
      zh: (n) => `「你好,我是 ${n}。带看、客户整理、现场反馈、合规提醒 —— 行政杂活我来,你专心做人和判断。」`,
      en: (n) => `"Hi, I'm ${n}. Showings, client management, field feedback, compliance reminders — I handle the admin, you focus on relationships and judgment."`,
    },
    helps: [
      { zh: '客户与房源材料整理', en: 'Client and listing material organization' },
      { zh: '看房 Live · 现场记录 + 反馈', en: 'Showing Live · field notes + feedback' },
      { zh: '佣金拆分 · 团队协作', en: 'Commission splits · team collaboration' },
      { zh: 'RECO 合规提醒 · 自动审计', en: 'RECO compliance reminders · auto audit' },
    ],
    cta: {
      zh: (n) => `开始 · 进入 ${n} 工作台 →`,
      en: (n) => `Start · enter ${n}'s workspace →`,
    },
  },
}

const AGENT_HOME: Record<AgentRole, string> = {
  tenant: '/tenant/agent',
  landlord: '/landlord/agent',
  agent: '/agent/agent',
}

function NamePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setRole } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'

  // The ?role= param survives only the first navigation — Back to /meet and
  // returning loses it (those links carry no query), which silently converted
  // landlords/agents into tenant onboarding. Persist the last seen role so
  // back-navigation keeps it; an explicit param always wins.
  const roleParam = searchParams.get('role') as AgentRole | null
  const storedRole = (typeof window !== 'undefined'
    ? window.sessionStorage.getItem('sl-onboarding-role')
    : null) as AgentRole | null
  const role: AgentRole =
    (roleParam && ROLE_CONFIG[roleParam]) ? roleParam
    : (storedRole && ROLE_CONFIG[storedRole]) ? storedRole
    : 'tenant'
  useEffect(() => {
    try { window.sessionStorage.setItem('sl-onboarding-role', role) } catch {}
  }, [role])

  // Already onboarded for this role → skip the naming flow entirely. A
  // logged-in landlord clicking "免费发布房源" must not be re-asked to name
  // Logic every time.
  const { ready, onboarded, home } = useOnboarded(role)
  useEffect(() => {
    if (ready && onboarded) router.replace(home)
  }, [ready, onboarded, home, router])

  const cfg = ROLE_CONFIG[role]

  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const final = value.trim() || cfg.default

  const submit = (name?: string) => {
    if (submitting) return
    setSubmitting(true)
    setAIName(name ?? final, role)
    setRole(role)
    router.push(AGENT_HOME[role])
  }

  return (
    <OnboardingStage
      step={3}
      totalSteps={4}
      eyebrow="NAME YOUR AGENT"
      back={{ href: '/onboarding/meet', label: zh ? '回上一步' : 'Back' }}
    >
      <span
        className="pulse"
        style={{
          display: 'inline-block',
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: cfg.orbBg,
          boxShadow: cfg.orbShadow,
          marginBottom: 18,
        }}
      />

      <h1 style={{ fontSize: 'clamp(24px, 6.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.18 }}>
        {zh ? '为你的 AI 助手起名' : 'Name your AI assistant'}
      </h1>
      <p style={{ fontSize: 14.5, color: '#3F3F46', lineHeight: 1.6, margin: '12px 0 22px' }}>
        {cfg.desc[lang]}
      </p>

      {/* @-prefixed name input */}
      <div style={{ textAlign: 'left', marginBottom: 18 }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#71717A', marginBottom: 8 }}>
          {zh ? '助手名字' : 'Assistant name'}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 16px',
              border: '1.5px solid #C5BDAA',
              borderRadius: 12,
              background: '#fff',
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, color: cfg.color }}>@</span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={cfg.default}
              autoFocus
              maxLength={20}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '0.01em',
                fontFamily: 'inherit',
                background: 'transparent',
              }}
            />
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: cfg.color,
                background: cfg.colorLight,
                padding: '4px 9px',
                borderRadius: 999,
              }}
            >
              {zh ? '随时可改' : 'Change anytime'}
            </span>
          </div>
        </form>
      </div>

      {/* Suggestion chips */}
      <div style={{ textAlign: 'left', marginBottom: 22 }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#71717A', marginBottom: 8 }}>
          {zh ? '热门选项 ↓' : 'Popular picks ↓'}
        </div>
        <div className="flex flex-wrap gap-2">
          {cfg.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              style={{
                padding: '7px 14px',
                background: value === s ? cfg.color : '#fff',
                color: value === s ? '#fff' : cfg.accent,
                border: `1px solid ${cfg.color}4D`,
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* PREVIEW quote */}
      <div
        style={{
          textAlign: 'left',
          background: `${cfg.color}0D`,
          border: `1px solid ${cfg.color}33`,
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 18,
        }}
      >
        <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: cfg.color, marginBottom: 6 }}>
          {zh ? `PREVIEW · ${final} 会说` : `PREVIEW · ${final} would say`}
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#3F3F46' }}>
          {cfg.preview[lang](final)}
        </p>
      </div>

      {/* Capabilities grid */}
      <div style={{ textAlign: 'left', marginBottom: 22 }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#71717A', marginBottom: 8 }}>
          {zh ? `${final} 会帮你` : `${final} will help you`}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {cfg.helps.map((h, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                background: '#fff',
                border: '1px solid #E7E1D3',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12,
                lineHeight: 1.45,
                color: '#3F3F46',
              }}
            >
              <span style={{ flexShrink: 0, fontWeight: 700, color: cfg.color }}>{i + 1}</span>
              <span>{h[lang]}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => submit()}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '14px',
          background: '#171717',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14.5,
          fontWeight: 700,
          cursor: submitting ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? '...' : cfg.cta[lang](final)}
      </button>

      <button
        type="button"
        onClick={() => submit(cfg.default)}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '12px',
          background: 'transparent',
          color: '#71717A',
          border: 'none',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          marginTop: 8,
        }}
      >
        {zh ? '跳过 · 先用默认名' : 'Skip · use the default name'}
      </button>

      <p style={{ fontSize: 11.5, color: '#71717A', marginTop: 10, fontFamily: 'inherit' }}>
        {zh
          ? '你可以随时在设置 · 助手里重命名 · 调性格 / 语言 / 职责范围。'
          : 'You can rename it anytime in Settings · Assistant, and adjust its personality / language / scope.'}
      </p>
    </OnboardingStage>
  )
}

export default function OnboardingNamePage() {
  return (
    <Suspense>
      <NamePageInner />
    </Suspense>
  )
}
