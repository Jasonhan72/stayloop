'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
  Table,
  Td,
  Tr,
} from '@/components/workspace'
import { useT, type Lang } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
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

/** Demo read-only share link (Mia Chen canon — shown to anonymous/preview visitors). */
const DEMO_SHARE_URL = 'stayloop.ai/p/mia-chen-7f3a'

/** 24 random bytes → 32-char base64url token (matches the DB check: ≥32, [A-Za-z0-9_-]). */
function generateShareToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Rent record — same 5 months as /tenant/payments history, oldest first. */
const RENT_RECORD: Array<{ month: Bi; status: 'paid' | 'late' }> = [
  { month: { zh: '1月', en: 'Jan' }, status: 'paid' },
  { month: { zh: '2月', en: 'Feb' }, status: 'late' },
  { month: { zh: '3月', en: 'Mar' }, status: 'paid' },
  { month: { zh: '4月', en: 'Apr' }, status: 'paid' },
  { month: { zh: '5月', en: 'May' }, status: 'paid' },
]

/**
 * Passport view log (demo) — makes good on the promise printed on the share
 * card: "every view lands in your audit log".
 */
const VIEWS: Array<{ when: string; who: Bi; saw: Bi; tone: 'info' | 'neutral' }> = [
  {
    when: '5/14 20:11',
    who: { zh: '站外只读链接', en: 'Off-platform read-only link' },
    saw: { zh: '身份章 ✓ 收入章 ✓', en: 'Identity ✓ Income ✓' },
    tone: 'info',
  },
  {
    when: '5/12 09:40',
    who: { zh: 'Sarah Wang（平台内授权）', en: 'Sarah Wang (in-platform authorization)' },
    saw: { zh: '身份 + 收入章数据', en: 'Identity + income stamp data' },
    tone: 'neutral',
  },
]

/** What is still missing for each un-stamped seal. */
const TODO: Record<number, { need: Bi; status: Bi }> = {
  3: {
    need: { zh: '需要：一次银行流水连接 · 预计 5 分钟', en: 'Needs: one bank connection · about 5 minutes' },
    status: { zh: '当前状态：未开始', en: 'Status: not started' },
  },
  4: {
    need: { zh: '需要：授权信用分与 LTB 法庭记录查询', en: 'Needs: authorize credit score + LTB record lookup' },
    status: { zh: '当前状态：未开始', en: 'Status: not started' },
  },
}

/** Decorative QR placeholder (demo — not scannable). */
function QrPlaceholder() {
  const cells: JSX.Element[] = []
  // deterministic pseudo-random module pattern
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const inFinder = (x < 4 && y < 4) || (x > 6 && y < 4) || (x < 4 && y > 6)
      if (inFinder) continue
      if ((x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0) {
        cells.push(<rect key={`${x}-${y}`} x={x * 6} y={y * 6} width={5} height={5} />)
      }
    }
  }
  const finder = (fx: number, fy: number) => (
    <g key={`f${fx}${fy}`}>
      <rect x={fx} y={fy} width={21} height={21} fill="none" stroke="currentColor" strokeWidth={4} />
      <rect x={fx + 7} y={fy + 7} width={7} height={7} />
    </g>
  )
  return (
    <svg viewBox="-2 -2 70 70" className="h-full w-full" fill="currentColor" aria-hidden>
      {finder(0, 0)}
      {finder(45, 0)}
      {finder(0, 45)}
      {cells}
    </svg>
  )
}

export default function TenantPassport() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const [sharingMode, setSharingMode] = useState<SharingMode>('open')
  const [copied, setCopied] = useState(false)

  // ── Off-platform share token (real rows for logged-in tenants; demo otherwise) ──
  const [shareToken, setShareToken] = useState<{ token: string; expires_at: string } | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareErr, setShareErr] = useState(false)

  // ── Rent-reporting waitlist (user_memories, zero new tables) ──
  const [waitlistJoined, setWaitlistJoined] = useState(false)
  const [waitlistBusy, setWaitlistBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setShareToken(null)
      setWaitlistJoined(false)
      return
    }
    let cancelled = false
    // Active token, if any (RLS scopes to the tenant's own rows).
    supabase
      .from('passport_share_tokens')
      .select('token,expires_at')
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled && data && data.length) setShareToken(data[0])
      })
    // Already on the rent-reporting waitlist?
    supabase
      .from('user_memories')
      .select('id')
      .eq('role', 'tenant')
      .eq('key', 'waitlist_rent_reporting')
      .limit(1)
      .then(({ data }) => {
        if (!cancelled && data && data.length) setWaitlistJoined(true)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const handleGenerate = async () => {
    if (!user || shareBusy) return
    setShareBusy(true)
    setShareErr(false)
    const token = generateShareToken()
    const { data, error } = await supabase
      .from('passport_share_tokens')
      .insert({ token, tenant_user_id: user.id })
      .select('token,expires_at')
      .single()
    if (!error && data) setShareToken(data)
    else setShareErr(true)
    setShareBusy(false)
  }

  const handleRevoke = async () => {
    if (!user || !shareToken || shareBusy) return
    setShareBusy(true)
    const { error } = await supabase
      .from('passport_share_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', shareToken.token)
    if (!error) setShareToken(null)
    setShareBusy(false)
  }

  const handleJoinWaitlist = async () => {
    if (!user || waitlistJoined || waitlistBusy) return
    setWaitlistBusy(true)
    const { error } = await supabase.from('user_memories').upsert(
      {
        user_id: user.id,
        role: 'tenant',
        memory_type: 'system',
        key: 'waitlist_rent_reporting',
        label: '租金上报征信 · 等候名单',
        value: { joined_at: new Date().toISOString() },
        confidence: 1,
        source: 'waitlist',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,role,memory_type,key' }
    )
    if (!error) setWaitlistJoined(true)
    setWaitlistBusy(false)
  }

  // Display path (real token when logged-in with an active row; demo otherwise).
  const isRealShare = !!(user && shareToken)
  const shareUrlDisplay = isRealShare ? `stayloop.ai/p/${shareToken!.token}` : DEMO_SHARE_URL

  const handleCopy = async () => {
    const text = isRealShare
      ? `${window.location.origin}/p/${shareToken!.token}`
      : `https://${DEMO_SHARE_URL}`
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // Fallback for contexts where the async clipboard API is unavailable
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const currentTier = TIERS.find((t) => t.status === 'current') ?? TIERS[2]
  const completedCount = TIERS.filter((t) => t.status === 'done').length
  const progressPercent = (completedCount / TIERS.length) * 100

  const insights: AIInsight[] = [
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
  ]

  return (
    <WorkspaceShell role="tenant" aside={<Aside lang={lang} insights={insights} />}>
      <PageHeader
        title={zh ? '租客护照' : 'Tenant Passport'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-tenant">RENTAL PASSPORT</span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh
              ? '你的 Passport 是你向房东展示可信度的通行证。验证一次 · 处处通行，章越多，房东审批越快。'
              : 'Your Passport proves trustworthiness to landlords. Verify once, travel everywhere — more stamps mean faster approvals.'}
          </>
        }
      />

      <StatStrip
        stats={[
          {
            label: zh ? '盖章进度' : 'Stamps earned',
            value: `${completedCount}/${TIERS.length}`,
            sub: zh ? `下一枚：${currentTier.title.zh}` : `Next: ${currentTier.title.en}`,
          },
          {
            label: zh ? '分享链接被查看' : 'Share link views',
            value: zh ? '7 次' : '7',
            sub: zh ? '每次访问都进审计日志' : 'Every view lands in your audit log',
          },
          {
            label: zh ? '有效授权' : 'Active authorizations',
            value: zh ? '4 项' : '4',
            sub: zh ? '本月被查询 3 次' : '3 queries this month',
          },
          {
            label: zh ? '最近更新' : 'Last updated',
            value: '5/12',
            sub: zh ? '收入章数据刷新' : 'Income stamp data refreshed',
          },
        ]}
      />

      <div className="space-y-4">
        {/* ── Progress card ── */}
        <SectionCard className="p-4 sm:p-5" padded={false}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[20px] font-bold tracking-tight text-tenant">
                  {stampLabel(completedCount, lang)}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-body-2">
                {zh
                  ? `下一枚：${currentTier.title.zh} —— ${currentTier.desc.zh}`
                  : `Next stamp: ${currentTier.title.en} — ${currentTier.desc.en}`}
              </p>
            </div>
            <Link
              href="/onboarding/tier1"
              className="sl-btn-primary shrink-0 !px-4 !py-2 !text-[12.5px]"
            >
              {zh ? '盖这枚章 →' : 'Stamp it →'}
            </Link>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
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
                  background: 'linear-gradient(90deg, #00ACE4 0%, #6B6B8F 100%)',
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
                        ? 'bg-gradient-to-br from-[#C4B5FD] to-tenant shadow-[0_4px_14px_rgba(0,172,228,0.4)]'
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
                  {/* Which fields this stamp covers — verified list, or what's still missing */}
                  <div className="mt-2 border-t border-dashed border-line-divider pt-1.5">
                    <span className="block font-mono text-[9px] tracking-wider text-body-3">
                      {t.status === 'done' ? (zh ? '已验证' : 'VERIFIED') : zh ? '补齐清单' : 'TO COMPLETE'}
                    </span>
                    <ul className="mt-1 space-y-0.5 text-[11.5px] leading-relaxed">
                      {t.fields.map((f) => (
                        <li key={f.en} className="flex items-start gap-1">
                          <span
                            className="mt-[1px] flex-none font-bold"
                            style={t.status === 'done' ? { color: STAMP_CHECK_GREEN } : undefined}
                          >
                            {t.status === 'done' ? '✓' : '○'}
                          </span>
                          <span className={t.status === 'done' ? 'text-body-2' : 'text-body-3'}>{f[lang]}</span>
                        </li>
                      ))}
                    </ul>
                    {t.status !== 'done' && TODO[t.level] && (
                      <div className="mt-1 text-[11px] leading-relaxed text-body-3">
                        <div>{TODO[t.level].need[lang]}</div>
                        <div>{TODO[t.level].status[lang]}</div>
                      </div>
                    )}
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
        </SectionCard>

        {/* ── Off-platform share (read-only snapshot) ── */}
        <SectionCard className="p-4 sm:p-5" padded={false}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-bold tracking-tight">
                {zh ? '分享给站外房东' : 'Share with any landlord'}
              </h2>
              <p className="mt-1 max-w-[460px] text-[13px] leading-relaxed text-body-2">
                {zh
                  ? '房东不在 Stayloop？一条只读链接就够了——对方无需注册，打开即可看到你已盖的章。一本护照，打动所有房东。'
                  : "Landlord not on Stayloop? One read-only link is all it takes — no sign-up needed on their side. One passport that wins over every landlord."}
              </p>

              {/* Link + copy — real token for logged-in tenants, demo otherwise */}
              {user && !shareToken ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={shareBusy}
                    className="sl-btn-primary !px-5 !py-2.5 text-[13px] disabled:opacity-60"
                  >
                    {shareBusy
                      ? zh ? '生成中…' : 'Generating…'
                      : zh ? '生成分享链接' : 'Generate share link'}
                  </button>
                  {shareErr && (
                    <p className="mt-2 text-[12px] text-danger">
                      {zh
                        ? '生成失败，请稍后重试。'
                        : 'Could not generate the link — please try again shortly.'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="min-w-0 max-w-full truncate rounded-lg bg-surface-chip px-3.5 py-2.5 font-mono text-[12.5px] text-body">
                    {shareUrlDisplay}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="sl-btn-secondary shrink-0 !px-4 !py-2.5 text-[13px]"
                  >
                    {copied ? (zh ? '已复制 ✓' : 'Copied ✓') : zh ? '复制链接' : 'Copy link'}
                  </button>
                  {isRealShare && (
                    <button
                      type="button"
                      onClick={handleRevoke}
                      disabled={shareBusy}
                      className="shrink-0 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-60"
                    >
                      {shareBusy ? (zh ? '撤销中…' : 'Revoking…') : zh ? '撤销' : 'Revoke'}
                    </button>
                  )}
                </div>
              )}
              {isRealShare && (
                <p className="mt-2 font-mono text-[10.5px] tracking-wide text-body-3">
                  {zh
                    ? `有效至 ${new Date(shareToken!.expires_at).toLocaleDateString('zh-CN')} · 撤销后立即失效`
                    : `Valid until ${new Date(shareToken!.expires_at).toLocaleDateString('en-CA')} · revoking takes effect immediately`}
                </p>
              )}

              <ul className="mt-4 space-y-1.5 text-[12.5px] leading-relaxed text-body-2">
                {[
                  {
                    zh: '只读快照 —— 只显示验证结果，不含证件原件',
                    en: 'Read-only snapshot — verification results only, never your original documents',
                  },
                  {
                    zh: '由 Stayloop 直发，房东可验真，无法伪造',
                    en: 'Served directly by Stayloop — landlords can verify authenticity, it cannot be forged',
                  },
                  {
                    zh: '可随时失效 · 每次访问都进审计日志',
                    en: 'Revoke any time · every view lands in your audit log',
                  },
                ].map((b) => (
                  <li key={b.en} className="flex items-start gap-2">
                    <span className="mt-[1px] font-bold" style={{ color: STAMP_CHECK_GREEN }}>
                      ✓
                    </span>
                    <span>{zh ? b.zh : b.en}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* QR slot */}
            <div className="shrink-0 self-center sm:self-start">
              <div className="mx-auto flex h-[104px] w-[104px] items-center justify-center rounded-xl border border-line-divider bg-white p-3 text-body">
                <QrPlaceholder />
              </div>
              <div className="mt-2 text-center font-mono text-[10px] tracking-wide text-body-3">
                {zh ? '看房现场出示' : 'Show at viewings'}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── Who viewed the Passport (audit trail for the share link) ── */}
        <SectionCard
          title={zh ? '谁看过我的护照' : 'Who viewed your Passport'}
          meta={zh ? '示范数据' : 'SAMPLE DATA'}
          padded={false}
          action={
            <Link href="/tenant/audit" className="text-[12px] font-semibold text-tenant hover:underline">
              {zh ? '完整审计日志 →' : 'Full audit log →'}
            </Link>
          }
        >
          <Table
            head={[
              zh ? '时间' : 'When',
              zh ? '访问来源' : 'Source',
              zh ? '看到了什么' : 'What they saw',
            ]}
          >
            {VIEWS.map((v) => (
              <Tr key={v.when}>
                <Td mono>{v.when}</Td>
                <Td align="right">
                  <StatusPill tone={v.tone}>{v.who[lang]}</StatusPill>
                </Td>
                <Td align="right" muted>
                  {v.saw[lang]}
                </Td>
              </Tr>
            ))}
          </Table>
        </SectionCard>

        {/* ── Sharing mode ── */}
        <SectionCard className="p-4 sm:p-5" padded={false}>
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight">
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
        </SectionCard>

        {/* ── Sharing summary + link ── */}
        <SectionCard className="p-4 sm:p-5" padded={false}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight">
                {zh ? '授权管理' : 'Authorizations'}
              </h2>
              <p className="mt-1 text-[13px] text-body-2">
                {zh
                  ? '已授权 4 人/服务查看你的数据 · 本月被查询 3 次'
                  : '4 people/services authorized · 3 queries this month'}
              </p>
            </div>
            <Link
              href="/tenant/passport/sharing"
              className="sl-btn-secondary shrink-0 !px-4 !py-2 !text-[12.5px]"
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
        </SectionCard>

        {/* ── Rent record ── */}
        <SectionCard className="p-4 sm:p-5" padded={false}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight">
                {zh ? '租金记录' : 'Rent record'}
              </h2>
              <p className="mt-1 max-w-[520px] text-[13px] leading-relaxed text-body-2">
                {zh
                  ? '每一笔按时租金都写进你的护照——对下一任房东，这是最有说服力的履约证明。经你授权才可见。'
                  : "Every on-time rent payment is written into your Passport — the most convincing proof of reliability for your next landlord. Visible only with your authorization."}
              </p>
            </div>
            <Link href="/tenant/payments" className="sl-btn-secondary shrink-0 !px-4 !py-2 !text-[12.5px]">
              {zh ? '付款历史 →' : 'Payment history →'}
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {RENT_RECORD.map((m) => (
              <div key={m.month.en} className="flex flex-col items-center gap-1.5">
                <span
                  className={
                    'flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-extrabold text-white ' +
                    (m.status === 'late' ? 'bg-warning' : '')
                  }
                  style={m.status === 'paid' ? { background: STAMP_CHECK_GREEN } : undefined}
                >
                  {m.status === 'paid' ? '✓' : '!'}
                </span>
                <span className="font-mono text-[10.5px] text-body-3">{m.month[lang]}</span>
              </div>
            ))}
            <div className="ml-1 text-[12.5px] leading-relaxed text-body-2">
              <span className="font-semibold">
                {zh ? '近 5 个月 4 次准时' : '4 of the last 5 months on time'}
              </span>
              <span className="block text-body-3">
                {zh ? '2 月迟付 3 天 · 已附情况说明（银行转账延迟）' : 'Feb was 3 days late · explanation on file (bank transfer delay)'}
              </span>
            </div>
          </div>

          {/* ── Rent reporting to credit bureau — waitlist ── */}
          <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface-chip p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-bold tracking-tight">
                {zh ? '上报到信用局' : 'Report rent to the credit bureau'}
              </h3>
              <span className="rounded-full bg-tenant/10 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-tenant">
                {zh ? '即将上线' : 'COMING SOON'}
              </span>
            </div>
            <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-body-2">
              {zh
                ? '按时交租也能积累信用：我们正在接入信用局，把你的按时租金记录上报 Equifax，帮你建立加拿大信用历史——对新移民尤其有用。上线后由你自主选择是否开启。'
                : 'On-time rent can build credit too: we are working on reporting your on-time rent payments to Equifax to help build Canadian credit history — especially useful for newcomers. Opt-in only, once it launches.'}
            </p>
            <div className="mt-3">
              {!user ? (
                <Link href="/login" className="sl-btn-secondary inline-flex !px-4 !py-2 text-[13px]">
                  {zh ? '登录后加入等候名单' : 'Log in to join the waitlist'}
                </Link>
              ) : waitlistJoined ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold"
                  style={{ color: STAMP_CHECK_GREEN }}
                >
                  {zh ? '已加入 ✓' : 'Joined ✓'}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleJoinWaitlist}
                  disabled={waitlistBusy}
                  className="sl-btn-secondary !px-4 !py-2 text-[13px] disabled:opacity-60"
                >
                  {waitlistBusy
                    ? zh ? '提交中…' : 'Joining…'
                    : zh ? '加入等候名单' : 'Join the waitlist'}
                </button>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ── Verification history (archive) ── */}
        <SectionCard
          title={zh ? '验证历史' : 'Verification history'}
          meta={zh ? '示范数据' : 'SAMPLE DATA'}
          padded={false}
        >
          <Table
            head={[
              zh ? '章' : 'Stamp',
              zh ? '验证内容' : 'Fields verified',
              zh ? '更新时间' : 'Updated',
              zh ? '状态' : 'Status',
            ]}
          >
            {TIERS.map((t) => (
              <Tr key={t.level}>
                <Td>
                  <div className="font-semibold">{t.title[lang]}</div>
                  <div className="mt-0.5 text-[11.5px] text-body-3">{t.desc[lang]}</div>
                </Td>
                <Td align="right" muted>
                  {t.fields.map((f) => f[lang]).join(' · ')}
                </Td>
                <Td align="right" mono muted>
                  {t.status === 'done' ? (t.level === 1 ? '2025-08-01' : '2026-05-12') : '—'}
                </Td>
                <Td align="right">
                  <StatusPill tone={t.status === 'done' ? 'ok' : t.status === 'current' ? 'pending' : 'neutral'}>
                    {t.status === 'done'
                      ? zh ? '已盖章' : 'Stamped'
                      : t.status === 'current'
                      ? zh ? '下一枚' : 'Next'
                      : zh ? '待盖' : 'Locked'}
                  </StatusPill>
                </Td>
              </Tr>
            ))}
          </Table>
        </SectionCard>

        {/* ── Quick actions ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/tenant/audit"
            className="flex items-center gap-4 rounded-xl border border-line-divider bg-white p-4 transition hover:border-line-strong"
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
            className="flex items-center gap-4 rounded-xl border border-line-divider bg-white p-4 transition hover:border-line-strong"
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

function Aside({ lang, insights }: { lang: Lang; insights: AIInsight[] }) {
  const zh = lang === 'zh'
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive role="tenant" insights={insights} variant="rail" />
      </AsideBlock>

      <AsideBlock title={zh ? '护照怎么用' : 'HOW TO USE IT'}>
        <ul className="space-y-2 text-[12.5px] leading-relaxed text-body-2">
          <li>{zh ? '· 申请房源时自动附上，房东无需再要材料' : '· Attached automatically when you apply — landlords stop asking for documents'}</li>
          <li>{zh ? '· 房东不在 Stayloop？发只读链接或现场出示二维码' : '· Landlord not on Stayloop? Send the read-only link or show the QR at the viewing'}</li>
          <li>{zh ? '· 授权随时可撤回，每次访问都进审计日志' : '· Revoke any authorization at any time — every view lands in your audit log'}</li>
        </ul>
      </AsideBlock>
    </div>
  )
}
