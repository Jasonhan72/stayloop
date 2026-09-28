'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import OnboardingStage from '@/components/OnboardingStage'
import RoleChooser from '@/components/onboarding/RoleChooser'
import { GENERIC_AI_NAME, setAIName } from '@/lib/aiName'
import { saveAssistantName } from '@/lib/agent/assistantProfile'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'
import { invalidateHats } from '@/lib/useHats'
import { useOnboarded } from '@/lib/useOnboarding'
import { PROVIDER_ONBOARD, isAgentRole, type OnboardingRole } from '@/lib/onboarding/roleChoices'
import { useT } from '@/lib/i18n'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { AgentRole } from '@/lib/agent/types'

// One assistant per account (2026-09-25): the same name under every hat, so one list of picks.
const SUGGESTIONS = ['Nova', 'Atlas', 'Mia', 'Aria', 'Echo', 'Scout', '小鹿', '木木', '清和', '豆包', '小布', '领航']

// Per-hat copy for the naming step. Every line names something that ships
// (V0.7 pass, 2026-09-27: the commission-split, engine-count and live-showing
// promises are gone — the referral engine is frozen and those screens are
// samples). The guard in tests/onboardingRole20260927.spec.tsx keeps it so.
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
    default: GENERIC_AI_NAME,
    suggestions: SUGGESTIONS,
    color: ROLE_THEME.tenant.accent,
    colorLight: ROLE_THEME.tenant.lightRgba,
    accent: ROLE_THEME.tenant.onboardingAccent,
    orbBg: ROLE_THEME.tenant.onboardingOrb,
    orbShadow: ROLE_THEME.tenant.orbShadow,
    desc: {
      zh: '它会记住你的偏好、理解你的进度，从这一刻起陪你走完找房 · 申请 · 签约 · 入住 · 以后所有事。',
      en: 'It remembers your preferences, understands your progress, and from this moment walks you through finding · applying · signing · moving in · everything after.',
    },
    preview: {
      zh: (n) => `「Hi，我是 ${n}。从现在起,找房、申请、签约、入住,我全程陪你 —— 你提要求,我负责跑腿,关键决策始终是你的。」`,
      en: (n) => `"Hi, I'm ${n}. From now on — finding a place, applying, signing, moving in — I'm with you the whole way. You set the goals, I do the legwork, and the key decisions are always yours."`,
    },
    helps: [
      { zh: '备好材料包 · 身份 / 收入 / 租史（租客护照）', en: 'Prepare your document pack · identity / income / rental history (Rental Passport)' },
      { zh: '按你的条件找房 · 提看房 · 向房东提问', en: 'Search to your needs · request showings · ask the landlord' },
      { zh: '提交申请 · 追踪进度（你看不到分数，房东本人决定）', en: 'Submit applications · track progress (no scores; the landlord decides)' },
      { zh: '入住 / 报修 / 续约 / 退租继续陪跑', en: 'Move-in / repairs / renewal / move-out — stays with you' },
    ],
    cta: {
      zh: (n) => `开始 · 进入 ${n} 工作台 →`,
      en: (n) => `Start · enter ${n}'s workspace →`,
    },
  },
  landlord: {
    default: GENERIC_AI_NAME,
    suggestions: SUGGESTIONS,
    color: ROLE_THEME.landlord.accent,
    colorLight: ROLE_THEME.landlord.lightRgba,
    accent: ROLE_THEME.landlord.onboardingAccent,
    orbBg: ROLE_THEME.landlord.onboardingOrb,
    orbShadow: ROLE_THEME.landlord.orbShadow,
    desc: {
      zh: '你的专属 AI 房东助手：整理申请、发起筛查、合规把关、起草租约 —— 决定权,始终在你手里。',
      en: 'Your dedicated AI landlord assistant: organizes applications, runs screening, keeps you compliant, drafts leases — you keep the final say.',
    },
    preview: {
      zh: (n) => `「你好,我是 ${n}。从今天开始,申请整理、筛查、合规、续约这些事交给我;关键的决定,你点头就好。」`,
      en: (n) => `"Hi, I'm ${n}. From today, leave application intake, screening, compliance, and renewals to me — the key decisions are always yours."`,
    },
    helps: [
      { zh: '申请队列 · 一键发起筛查', en: 'Application queue · one-click screening' },
      { zh: '文件取证 + 可解释评分 · 法庭与 LTB 记录', en: 'Document forensics + explainable scoring · court and LTB records' },
      { zh: '安省规则内置 · RTA / OHRC 当场提醒', en: 'Ontario rules built in · RTA / OHRC reminders as you go' },
      { zh: '决定通知 · 标准租约与电子签 · 续约 90/60/30', en: 'Decision notices · standard lease and e-sign · 90/60/30 renewals' },
    ],
    cta: {
      zh: (n) => `开始 · 进入 ${n} 工作台 →`,
      en: (n) => `Start · enter ${n}'s workspace →`,
    },
  },
  agent: {
    default: GENERIC_AI_NAME,
    suggestions: SUGGESTIONS,
    color: ROLE_THEME.agent.accent,
    colorLight: ROLE_THEME.agent.lightRgba,
    accent: ROLE_THEME.agent.onboardingAccent,
    orbBg: ROLE_THEME.agent.onboardingOrb,
    orbShadow: ROLE_THEME.agent.orbShadow,
    desc: {
      zh: '你的专属 AI 经纪助手：整理客户、给房源定价、准备带看、提醒合规边界 —— 行政杂活交给它,你专注做人和判断。',
      en: 'Your dedicated AI broker assistant: manages clients, prices listings, preps showings, flags compliance boundaries — admin work handled, you focus on people and judgment.',
    },
    preview: {
      zh: (n) => `「你好,我是 ${n}。客户整理、定价、带看准备、合规提醒 —— 行政杂活我来,你专心做人和判断。」`,
      en: (n) => `"Hi, I'm ${n}. Client management, pricing, showing prep, compliance reminders — I handle the admin, you focus on relationships and judgment."`,
    },
    helps: [
      { zh: '客户表 · 代表协议与 Information Guide 日期', en: 'Client book · representation agreement and Information Guide dates' },
      { zh: '挂牌定价 · 同区挂牌 + TRREB 数据', en: 'Listing pricing · live comparables + TRREB data' },
      { zh: '带看准备包 · 客户委托后代为发起筛查', en: 'Showing prep pack · screening on a client’s behalf once delegated' },
      { zh: 'RECO / TRESA 合规边界 · 每步留痕', en: 'RECO / TRESA boundaries · every step audited' },
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
  // A new agent lands on the RECO-verification form first (decision
  // 2026-09-13); the workspace itself stays reachable from there.
  agent: '/agent/verify',
}

const ONBOARDING_ROLE_KEY = 'sl-onboarding-role'

function NamePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setRole, user, loading: authLoading, role: rememberedRole } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'

  // Which identity is being onboarded. Sources, in order: an explicit ?role=
  // (the role marketing pages and the auth callback pass it), the identity
  // picked earlier in this tab (the param survives only the first navigation
  // — Back to /meet and returning loses it, which used to silently convert
  // landlords / agents into tenant onboarding), and otherwise NONE — the
  // homepage login card carries no intent, so this page asks first (V0.7,
  // 2026-09-27: the homepage promises「选身份，给助手起个名字」). It no longer
  // defaults a stranger to tenant.
  const roleParam = searchParams.get('role')
  const fromParam: AgentRole | null = isAgentRole(roleParam) ? roleParam : null
  const [fromStored] = useState<AgentRole | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const v = window.sessionStorage.getItem(ONBOARDING_ROLE_KEY)
      return isAgentRole(v) ? v : null
    } catch { return null }
  })
  const [picked, setPicked] = useState<AgentRole | null>(null)
  const [cleared, setCleared] = useState(false) // "换身份" on the naming step reopens the chooser
  const role: AgentRole | null = picked ?? (cleared ? null : fromParam ?? fromStored)
  useEffect(() => {
    if (!role) return
    try { window.sessionStorage.setItem(ONBOARDING_ROLE_KEY, role) } catch {}
  }, [role])

  // Already named the assistant (any hat — it is one assistant) → skip the
  // naming flow entirely. A logged-in landlord clicking "免费发布房源" must
  // not be re-asked to name it every time.
  const { ready, onboarded, home } = useOnboarded(role ?? rememberedRole ?? 'tenant')
  useEffect(() => {
    if (ready && onboarded) router.replace(home)
  }, [ready, onboarded, home, router])

  const pick = (r: OnboardingRole) => {
    if (r === 'provider') {
      // No assistant page for the provider hat yet: the first step is the
      // onboarding form (credentials first). The name can be set later in
      // the assistant panel or /settings.
      router.push(PROVIDER_ONBOARD)
      return
    }
    setCleared(false)
    setPicked(r)
  }
  const changeRole = () => {
    try { window.sessionStorage.removeItem(ONBOARDING_ROLE_KEY) } catch {}
    setPicked(null)
    setCleared(true)
  }

  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!role) {
    return (
      <OnboardingStage step={1} totalSteps={2} eyebrow={zh ? 'PICK YOUR ROLE · 选身份' : 'PICK YOUR ROLE'}>
        <h1 style={{ fontSize: 'clamp(24px, 6.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.18 }}>
          {zh ? '你现在主要是哪种身份？' : 'Which identity are you here as?'}
        </h1>
        <p style={{ fontSize: 14.5, color: '#3F3F46', lineHeight: 1.6, margin: '12px 0 22px' }}>
          {zh
            ? '一个账号可以同时是租客、房东、经纪；之后随时在右上角「我是」菜单里切换或开通。'
            : 'One account can be a tenant, a landlord and an agent at once; switch or activate any of them later from the top-right “I am” menu.'}
        </p>
        <RoleChooser zh={zh} onPick={pick} />
        <p style={{ fontSize: 11.5, color: '#71717A', marginTop: 18, fontFamily: 'inherit' }}>
          {zh ? '下一步：给你的 AI 助理起个名字（只起一次，所有身份共用）。' : 'Next: name your AI assistant (once; every identity shares it).'}
        </p>
      </OnboardingStage>
    )
  }

  const cfg = ROLE_CONFIG[role]
  const final = value.trim() || cfg.default

  const submit = (name?: string) => {
    if (submitting) return
    setSubmitting(true)
    const chosen = name ?? final
    setAIName(chosen, user?.id ?? null) // signed out: unclaimed, adopted by the account that signs in next
    if (user && chosen !== GENERIC_AI_NAME) void saveAssistantName(supabase, user.id, chosen)
    setRole(role)
    // First-time SIGNED-IN landlords land on the aha moment, not a chat
    // shell. Production data (2026-08-12): 33 signups/30d but 3 active
    // screeners — the activation gap lives in this exact hop. Returning
    // users are unaffected (the onboarded-check above skips this page).
    // An ANONYMOUS visitor who just clicked "进入 Logic 工作台" used to be
    // dropped on the screening page's "requires an account" wall — a
    // dead end on an unrelated-looking page (external walkthrough
    // 2026-09-22). They get the workspace they were promised: it runs in
    // preview mode without an account and carries its own sign-in banner.
    const signedIn = !!user && !authLoading
    // Choosing "landlord" here IS the explicit opt-in: grant the hat now
    // (pages no longer claim it on load — three-role test report 2026-09-24).
    if (role === 'landlord' && signedIn) {
      void Promise.resolve(supabase.rpc('claim_landlord')).then(() => { invalidateHats(); router.push('/screening/app') }, () => router.push('/landlord/become?next=/screening/app'))
      return
    }
    router.push(AGENT_HOME[role])
  }

  const roleWord = zh ? ({ tenant: '租客', landlord: '房东', agent: '经纪' } as const)[role] : ({ tenant: 'tenant', landlord: 'landlord', agent: 'agent' } as const)[role]

  return (
    <OnboardingStage
      step={2}
      totalSteps={2}
      eyebrow="NAME YOUR AGENT"
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
        {zh ? '为你的 AI 助理起名' : 'Name your AI assistant'}
      </h1>
      <p style={{ fontSize: 14.5, color: '#3F3F46', lineHeight: 1.6, margin: '12px 0 8px' }}>
        {cfg.desc[lang]}
      </p>
      <p style={{ fontSize: 12.5, color: '#71717A', lineHeight: 1.55, margin: '0 0 6px' }}>
        {zh ? '它是你在 Stayloop 上唯一的助理：租客、房东、经纪的事都由它处理，各身份分开记录。' : 'It is your one assistant on Stayloop: tenant, landlord and agent matters all go to it, each hat kept separate.'}
      </p>
      <p style={{ fontSize: 12.5, color: '#71717A', lineHeight: 1.55, margin: '0 0 22px' }}>
        {zh ? `当前身份：${roleWord} · ` : `Identity: ${roleWord} · `}
        <button type="button" onClick={changeRole} data-testid="change-role" style={{ background: 'none', border: 'none', padding: 0, color: '#00ACE4', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>
          {zh ? '换身份' : 'Change identity'}
        </button>
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
              border: '1.5px solid #9FBBD0',
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
                border: '1px solid #E4EEF6',
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
          ? '随时可以在助手面板或设置里改名、换头像、写人设和说话风格。'
          : 'You can rename it, change its avatar and write its persona and tone any time in the assistant panel or Settings.'}
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
