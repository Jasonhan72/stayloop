'use client'
// /passport — Verified Renter Passport (V3 section 02)
// Production: composes the current user's passport from auth + applications + tenancies.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import AppHeader from '@/components/AppHeader'

interface Application {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  monthly_income: number | null
  employer_name: string | null
  ai_score: number | null
  doc_authenticity_score: number | null
  payment_ability_score: number | null
  court_records_score: number | null
  stability_score: number | null
  behavior_signals_score: number | null
  info_consistency_score: number | null
  created_at: string
}

interface Tenancy {
  id: string
  on_time_payments: number
  total_payments: number
  verification_status: string
  is_active: boolean
  monthly_rent: number | null
}

interface CoSignInvite {
  showModal: boolean
  email: string
  note: string
}

function passportIdFromUuid(uuid: string): string {
  // SL-YYYY-XXXXX-XXX where the X's are derived from the uuid hash so they're stable.
  const year = new Date().getFullYear()
  const cleaned = uuid.replace(/-/g, '').toUpperCase()
  return `SL-${year}-${cleaned.slice(0, 5)}-${cleaned.slice(5, 8)}`
}

function initialsFrom(name: string | null, email: string | null): string {
  const src = name || email || ''
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'WC'
}

export default function PassportPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [bestApp, setBestApp] = useState<Application | null>(null)
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [loading, setLoading] = useState(true)
  const [coSignInvite, setCoSignInvite] = useState<CoSignInvite>({ showModal: false, email: '', note: '' })

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId])

  async function load() {
    setLoading(true)
    const email = user?.email
    const [{ data: apps }, { data: tens }] = await Promise.all([
      email
        ? supabase
            .from('applications')
            .select('id, first_name, last_name, email, monthly_income, employer_name, ai_score, doc_authenticity_score, payment_ability_score, court_records_score, stability_score, behavior_signals_score, info_consistency_score, created_at')
            .eq('email', email)
            .order('ai_score', { ascending: false, nullsFirst: false })
            .limit(1)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('tenancies').select('id, on_time_payments, total_payments, verification_status, is_active'),
    ])
    setBestApp(((apps as Application[]) || [])[0] || null)
    setTenancies((tens as Tenancy[]) || [])
    setLoading(false)
  }

  if (authLoading || loading) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载护照…' : 'Loading passport…'}</div>
      </main>
    )
  }

  const fullName = bestApp
    ? [bestApp.first_name, bestApp.last_name].filter(Boolean).join(' ') || bestApp.email
    : user?.email || ''
  const passportId = passportIdFromUuid(user?.authId || '00000000-0000-0000-0000-000000000000')
  const initials = initialsFrom(fullName, user?.email || null)
  const score = bestApp?.ai_score || null
  const tier = score == null ? null : score >= 90 ? 1 : score >= 75 ? 8 : 25
  const verified = bestApp != null && score != null
  const verifiedDate = bestApp ? new Date(bestApp.created_at).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  // Compute axis values for hexagon (out of 100, default to 0)
  const axisVals = bestApp
    ? [
        bestApp.payment_ability_score ?? 0,
        bestApp.stability_score ?? 0,
        bestApp.doc_authenticity_score ?? 0,
        bestApp.court_records_score ?? 0,
        bestApp.behavior_signals_score ?? 0,
        bestApp.info_consistency_score ?? 0,
      ].map((v) => v / 100)
    : [0, 0, 0, 0, 0, 0]

  const verifiedTenancies = tenancies.filter((t) => t.verification_status === 'verified')
  const totalOnTime = tenancies.reduce((s, t) => s + (t.on_time_payments || 0), 0)
  const totalPayments = tenancies.reduce((s, t) => s + (t.total_payments || 0), 0)

  // Build claims for detailed row view
  const claimsRowData: Array<{ title_en: string; title_zh: string; source: string; value: string; verified: boolean }> = [
    {
      title_en: 'Identity verified',
      title_zh: '身份已核验',
      source: 'Supabase Auth · email confirmed',
      value: '✓',
      verified: !!user?.email,
    },
    {
      title_en: bestApp?.monthly_income
        ? `Income $${Number(bestApp.monthly_income).toLocaleString()}/mo`
        : 'Income — pending',
      title_zh: bestApp?.monthly_income
        ? `月收入 $${Number(bestApp.monthly_income).toLocaleString()}`
        : '收入待验证',
      source: bestApp?.employer_name ? `Employer · ${bestApp.employer_name}` : 'Submit a screening to verify',
      value: bestApp?.monthly_income ? `$${Number(bestApp.monthly_income).toLocaleString()}` : '—',
      verified: !!bestApp?.monthly_income,
    },
    {
      title_en: 'Credit signals',
      title_zh: '信用信号',
      source: bestApp ? `Stayloop AI · ${bestApp.behavior_signals_score ?? '—'}/100` : 'No screening yet',
      value: bestApp?.behavior_signals_score ? String(bestApp.behavior_signals_score) : '—',
      verified: !!bestApp?.behavior_signals_score,
    },
    {
      title_en:
        verifiedTenancies.length > 0
          ? `${verifiedTenancies.length} verified tenancies`
          : tenancies.length > 0
            ? `${tenancies.length} tenancies (unverified)`
            : 'No tenancy history yet',
      title_zh:
        verifiedTenancies.length > 0
          ? `${verifiedTenancies.length} 段已核签租约`
          : tenancies.length > 0
            ? `${tenancies.length} 段租约 (待核签)`
            : '暂无租房记录',
      source:
        totalPayments > 0 ? `${totalOnTime}/${totalPayments} on-time payments` : 'Add a tenancy in /history',
      value: verifiedTenancies.length > 0 ? 'Clean' : tenancies.length > 0 ? `${tenancies.length}` : '—',
      verified: verifiedTenancies.length > 0,
    },
  ]

  // Build claims for the compact chip row (6 boolean flags)
  const incomeCheck = bestApp?.monthly_income && tenancies.length > 0
    ? bestApp.monthly_income >= (tenancies[0]?.monthly_rent || 1) * 3
    : false
  const noEvictions = tenancies.every(t => t.verification_status !== 'pending_landlord')
  const idVerified = !!user?.email
  const bankConfirmed = !!bestApp?.payment_ability_score
  const courtClean = !!bestApp && bestApp.court_records_score !== null && bestApp.court_records_score > 50
  const coSigned = verifiedTenancies.length > 0

  const claimsChips = [
    { title_en: 'Income ≥ 3× rent', title_zh: '收入 ≥ 3× 租金', verified: incomeCheck },
    { title_en: 'No evictions on record', title_zh: '无驱逐记录', verified: noEvictions },
    { title_en: 'ID verified', title_zh: '身份已验证', verified: idVerified },
    { title_en: 'Bank-confirmed', title_zh: '银行核验', verified: bankConfirmed },
    { title_en: 'Court-clean', title_zh: '法庭清白', verified: courtClean },
    { title_en: 'Co-signed tenancy', title_zh: '有核签租约', verified: coSigned },
  ]

  return (
    <main style={{ background: v3.surface, minHeight: '100vh' }}>
      <AppHeader title="My Passport" titleZh="我的 Passport" />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 64px' }}>
        {/* top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {isZh ? '租客护照' : 'VERIFIED RENTER PASSPORT'}
          </div>
          <div style={{ display: 'flex', gap: 12, color: v3.textMuted, fontSize: 16 }}>
            <button aria-label="share" style={iconBtn}>↑</button>
            <button aria-label="notifications" style={iconBtn}>🔔</button>
          </div>
        </div>

        {/* hero card */}
        <div style={{ background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)', borderRadius: 18, padding: 20, color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>stayloop</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: verified ? v3.brandBright : 'rgba(255,255,255,0.55)',
                background: verified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${verified ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255,255,255,0.12)'}`,
                padding: '4px 10px',
                borderRadius: 999,
              }}
            >
              {verified ? `✓ VERIFIED · ${verifiedDate}` : isZh ? '待验证' : 'PENDING'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              aria-hidden
              style={{ width: 44, height: 44, borderRadius: 999, background: v3.brandBright, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}
            >
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{fullName}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>
                {passportId}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <HexRadar values={axisVals} />
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                Stayloop Score
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                <span
                  style={{
                    fontSize: 56,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: '-0.04em',
                    background: 'linear-gradient(180deg, #ffffff 0%, #34D399 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {score ?? '—'}
                </span>
                <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>/100</span>
              </div>
              <div style={{ fontSize: 12, color: '#34D399', fontWeight: 500, marginTop: 4 }}>
                {tier ? (isZh ? `全国前 ${tier}% 的租客` : `Top ${tier}% of renters`) : isZh ? '完成筛查解锁评分' : 'Complete a screening to unlock'}
              </div>
            </div>
          </div>
        </div>

        {/* Claims chip row */}
        <div style={{ fontSize: 10, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '20px 4px 12px' }}>
          {isZh ? '核心声明' : 'KEY CLAIMS'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {claimsChips.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                borderRadius: 999,
                background: c.verified ? v3.brandSoft : 'rgba(113, 113, 122, 0.1)',
                border: `1px solid ${c.verified ? v3.brand : 'transparent'}`,
                fontSize: 11,
                fontWeight: 600,
                color: c.verified ? v3.brandStrong : v3.textMuted,
                textAlign: 'center',
                opacity: c.verified ? 1 : 0.6,
              }}
            >
              {c.verified ? '✓ ' : '? '}{isZh ? c.title_zh : c.title_en}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '24px 4px 12px' }}>
          {isZh ? '房东可见声明' : 'WHAT LANDLORDS SEE · 房东可见声明'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {claimsRowData.map((c, i) => (
            <ClaimRow key={i} claim={c} isZh={isZh} />
          ))}
        </div>

        {/* QR + share */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: v3.surfaceCard, border: `1px dashed ${v3.borderStrong}`, borderRadius: 14 }}>
          <div aria-hidden style={{ width: 44, height: 44, borderRadius: 8, background: '#fff', border: `1px solid ${v3.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <QrGlyph />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: v3.textPrimary }}>
              {isZh ? '分享你的 Passport' : 'Share your Passport'}
            </div>
            <div style={{ fontSize: 10.5, color: v3.textMuted, fontFamily: 'var(--font-mono), ui-monospace, monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              passport.stayloop.ai/{passportId.toLowerCase().replace(/^sl-/, '')} · {isZh ? '可撤销' : 'revocable'}
            </div>
          </div>
          <button
            onClick={() => {
              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/passport/${passportId}`
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(url)
                alert(isZh ? '已复制' : 'Copied')
              }
            }}
            style={{ padding: '7px 12px', background: v3.textPrimary, color: v3.surface, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            {isZh ? '复制' : 'Copy'}
          </button>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link
            href="/score"
            style={{ display: 'block', textAlign: 'center', fontSize: 13, fontWeight: 600, color: v3.brandStrong, padding: '12px 14px', background: v3.brandSoft, borderRadius: 10, textDecoration: 'none' }}
          >
            {isZh ? '查看评分构成 →' : 'See score breakdown →'}
          </Link>
          <Link
            href="/history"
            style={{ display: 'block', textAlign: 'center', fontSize: 13, fontWeight: 500, color: v3.textSecondary, padding: '12px 14px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, textDecoration: 'none' }}
          >
            {isZh ? '租房记录' : 'Rental history'}
          </Link>
          <button
            onClick={() => setCoSignInvite({ showModal: true, email: '', note: '' })}
            style={{ display: 'block', textAlign: 'center', fontSize: 13, fontWeight: 500, color: v3.textSecondary, padding: '12px 14px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, cursor: 'pointer', width: '100%' }}
          >
            {isZh ? '邀请房东核签' : 'Request co-sign'}
          </button>
          {!bestApp && (
            <Link
              href="/screen"
              style={{ display: 'block', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#fff', padding: '12px 14px', background: v3.brand, borderRadius: 10, textDecoration: 'none' }}
            >
              {isZh ? '完成筛查解锁评分 →' : 'Complete a screening →'}
            </Link>
          )}
        </div>

        {/* Co-sign request modal */}
        {coSignInvite.showModal && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}
            onClick={() => setCoSignInvite({ ...coSignInvite, showModal: false })}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: v3.surfaceCard, borderRadius: 16, padding: 20, maxWidth: 440, width: '100%' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', color: v3.textPrimary }}>
                {isZh ? '邀请房东核签' : 'Request co-sign'}
              </h2>
              <p style={{ fontSize: 13, color: v3.textMuted, margin: '0 0 16px', lineHeight: 1.5 }}>
                {isZh
                  ? '输入你前房东的邮箱，他们会收到核签邀请。'
                  : 'Enter your prior landlord\'s email to invite them to verify your tenancy.'}
              </p>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  {isZh ? '房东邮箱' : 'Landlord email'}
                </span>
                <input
                  type="email"
                  placeholder="landlord@example.com"
                  value={coSignInvite.email}
                  onChange={(e) => setCoSignInvite({ ...coSignInvite, email: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  {isZh ? '备注 (可选)' : 'Note (optional)'}
                </span>
                <textarea
                  placeholder={isZh ? '补充信息…' : 'Add context…'}
                  value={coSignInvite.note}
                  onChange={(e) => setCoSignInvite({ ...coSignInvite, note: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minHeight: 60, resize: 'none' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setCoSignInvite({ ...coSignInvite, showModal: false })}
                  style={{ flex: 1, padding: 12, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: v3.textPrimary }}
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    if (!coSignInvite.email) return
                    // TODO: insert into tenancies table with verification_status='pending'
                    alert(isZh ? '邀请已发送 (TODO)' : 'Invitation sent (TODO)')
                    setCoSignInvite({ showModal: false, email: '', note: '' })
                  }}
                  style={{ flex: 1, padding: 12, background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {isZh ? '发送邀请' : 'Send invitation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function HexRadar({ values }: { values: number[] }) {
  const cx = 70, cy = 70, r = 60
  const ringPath = (mult: number) =>
    values.map((_, i) => {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2
      return [cx + Math.cos(a) * r * mult, cy + Math.sin(a) * r * mult]
    }).map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z'

  const dataPath = values.map((v, i) => {
    const a = (Math.PI * 2 * i) / 6 - Math.PI / 2
    return [cx + Math.cos(a) * r * Math.max(0.05, v), cy + Math.sin(a) * r * Math.max(0.05, v)]
  }).map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z'

  return (
    <svg viewBox="0 0 140 140" width={140} height={140} aria-hidden>
      {[0.25, 0.5, 0.75, 1].map((m) => (
        <path key={m} d={ringPath(m)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      ))}
      {values.map((_, i) => {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      })}
      <path d={dataPath} fill="rgba(16, 185, 129, 0.25)" stroke="#10B981" strokeWidth={1.5} />
      {values.map((v, i) => {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2
        return <circle key={i} cx={cx + Math.cos(a) * r * Math.max(0.05, v)} cy={cy + Math.sin(a) * r * Math.max(0.05, v)} r={2.5} fill="#10B981" />
      })}
    </svg>
  )
}

function ClaimRow({ claim, isZh }: { claim: { title_en: string; title_zh: string; source: string; value: string; verified: boolean }; isZh: boolean }) {
  return (
    <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12, opacity: claim.verified ? 1 : 0.65 }}>
      <div
        aria-hidden
        style={{ width: 22, height: 22, borderRadius: 999, background: claim.verified ? v3.brandSoft : v3.divider, color: claim.verified ? v3.brandStrong : v3.textMuted, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}
      >
        {claim.verified ? '✓' : '·'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, lineHeight: 1.3 }}>
          {isZh ? claim.title_zh : claim.title_en}
        </div>
        <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
          {isZh ? claim.title_en : claim.title_zh}
        </div>
        <div style={{ fontSize: 11, color: v3.textFaint, marginTop: 4, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>
          {claim.source}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: claim.verified ? v3.brandStrong : v3.textMuted, flexShrink: 0, marginTop: 2 }}>
        {claim.value}
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 16,
  cursor: 'pointer',
  color: v3.textMuted,
}

function QrGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} aria-hidden>
      {[[1, 1], [17, 1], [1, 17]].map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width={6} height={6} fill="#0B0B0E" />
          <rect x={x + 1} y={y + 1} width={4} height={4} fill="#fff" />
          <rect x={x + 2} y={y + 2} width={2} height={2} fill="#0B0B0E" />
        </g>
      ))}
      {[[9, 1], [11, 3], [13, 1], [15, 3], [1, 9], [3, 11], [5, 9], [9, 9], [11, 11], [13, 9], [15, 11], [17, 9], [19, 11], [21, 9], [9, 17], [11, 19], [13, 17], [15, 21], [17, 19], [19, 17], [21, 21]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={2} height={2} fill="#0B0B0E" />
      ))}
    </svg>
  )
}
