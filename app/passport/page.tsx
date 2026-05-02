'use client'
// /passport — Verified Renter Passport (V3 section 02)
// Production: composes the current user's passport from auth + applications + tenancies.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'

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
      <PageShell role="tenant" allowAnonymous>
        <div style={{ color: v3.textMuted, fontSize: 14, display: 'grid', placeItems: 'center', minHeight: 400 }}>
          {isZh ? '加载护照…' : 'Loading passport…'}
        </div>
      </PageShell>
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
    <PageShell role="tenant" allowAnonymous>
      <div style={{ maxWidth: size.content.wide, margin: '0 auto' }} className="passport-outer">
        {/* V4 layout: main pane (1fr) + right sidebar (320px) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 22 }} className="passport-grid">
          {/* Main content pane */}
          <div style={{ display: 'grid', gap: 18 }}>
          {/* SecHead */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: '10.5px',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {isZh ? '租客护照 · v3' : 'Tenant Passport · v3'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 24,
                  fontWeight: 600,
                  color: v3.textPrimary,
                  letterSpacing: '-0.02em',
                }}
              >
                {fullName} — {isZh ? '租赁护照' : 'Rental Passport'}
              </h2>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    background: '#FFFFFF',
                    color: v3.textPrimary,
                    border: `1px solid ${v3.borderStrong}`,
                    borderRadius: 10,
                    padding: '10px 18px',
                    fontFamily: '"Inter Tight", sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '分享链接' : 'Share link'}
                </button>
                <button
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 10,
                    padding: '11px 20px',
                    fontFamily: '"Inter Tight", sans-serif',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45)',
                  }}
                >
                  {isZh ? '使用护照申请' : 'Apply with Passport'}
                </button>
              </div>
            </div>
            <span style={{ fontSize: 13, color: v3.textMuted }}>
              {isZh ? '今天最后更新 · 可跨列表重用' : 'Last updated today · Reusable across listings'}
            </span>
            <hr
              style={{
                marginTop: 14,
                height: 1,
                background: `linear-gradient(90deg, #047857, rgba(16,185,129,0.32) 60%, transparent)`,
                border: 0,
              }}
            />
          </div>

          {/* Header card */}
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 24,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 18,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: v3.brand,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 24,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    fontFamily: '"Inter Tight", sans-serif',
                    fontSize: 22,
                    fontWeight: 600,
                    color: v3.textPrimary,
                  }}
                >
                  {fullName}
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 9px',
                    borderRadius: 999,
                    border: `1px solid #BBF7D0`,
                    background: '#DCFCE7',
                    color: '#16A34A',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  ✓ {isZh ? '身份验证' : 'Verified ID'}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 9px',
                    borderRadius: 999,
                    border: `1px solid #D7C5FA`,
                    background: '#F3E8FF',
                    color: '#7C3AED',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  AI-{isZh ? '组织' : 'organized'}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4,auto)',
                  gap: 18,
                  fontSize: 12,
                  color: v3.textSecondary,
                  marginTop: 10,
                }}
              >
                <span>
                  <b style={{ color: v3.textPrimary }}>$2,400–3,200</b> · {isZh ? '目标租金' : 'target rent'}
                </span>
                <span>
                  <b style={{ color: v3.textPrimary }}>Sep 1, 2026</b> · {isZh ? '入住' : 'move-in'}
                </span>
                <span>
                  <b style={{ color: v3.textPrimary }}>Toronto · Downtown</b>
                </span>
                <span>
                  <b style={{ color: v3.textPrimary }}>1 {isZh ? '住户' : 'occupant'} · {isZh ? '无宠物' : 'no pets'}</b>
                </span>
              </div>
            </div>
            <div style={{ width: 140 }}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: v3.textMuted,
                    marginBottom: 5,
                  }}
                >
                  <span>{isZh ? '准备就绪' : 'Readiness'}</span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', color: '#7C3AED', fontWeight: 600 }}>
                    78%
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: v3.surfaceMuted,
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `78%`,
                      height: '100%',
                      background: '#7C3AED',
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 8 }}>
                {isZh ? '2 项推荐' : '2 items recommended'}
              </div>
            </div>
          </div>

          {/* Documents section */}
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 22px',
                borderBottom: `1px solid ${v3.border}`,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 17,
                  fontWeight: 600,
                }}
              >
                {isZh ? '文件' : 'Documents'}
              </h3>
              <span style={{ fontSize: 12, color: v3.textMuted, marginLeft: 10 }}>
                {isZh ? '9 个 · AI 提取的字段显示' : '9 of 11 · AI extracted fields shown'}
              </span>
              <div style={{ flex: 1 }} />
              <button
                style={{
                  padding: 0,
                  color: '#047857',
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                + {isZh ? '上传' : 'Upload'}
              </button>
            </div>

            {[
              {
                cat: isZh ? '身份' : 'Identity',
                name: isZh ? 'Passport · CA' : 'Passport · CA',
                status: isZh ? '已验证' : 'Verified',
                tone: 'ok',
                meta: isZh ? '有效期 2031-04 · OCR 匹配' : 'Expiry 2031-04 · OCR matched',
              },
              {
                cat: isZh ? '身份' : 'Identity',
                name: isZh ? "驾驶证 · ON" : "Driver's license · ON",
                status: isZh ? '已上传' : 'Uploaded',
                tone: 'info',
                meta: isZh ? '自动隐蔽 SIN' : 'Auto-redacted SIN',
              },
              {
                cat: isZh ? '收入' : 'Income',
                name: isZh ? '工资单（最近 3 个）' : 'Pay stubs (last 3)',
                status: isZh ? '已验证' : 'Verified',
                tone: 'ok',
                meta: isZh ? '每月 $8,420 总额 · 加拿大丰业银行存款' : '$8,420 / mo gross · TD Bank deposit',
              },
              {
                cat: isZh ? '收入' : 'Income',
                name: isZh ? '就业信函' : 'Employment letter',
                status: isZh ? '缺失' : 'Missing',
                tone: 'warn',
                meta: isZh ? '1 位房东请求 — 推荐' : 'Requested by 1 landlord — recommended',
              },
              {
                cat: isZh ? '收入' : 'Income',
                name: isZh ? 'T1 / NOA 2024' : 'T1 / NOA 2024',
                status: isZh ? '已上传' : 'Uploaded',
                tone: 'info',
                meta: '',
              },
              {
                cat: isZh ? '信用' : 'Credit',
                name: isZh ? '益百利信用报告' : 'Equifax credit report',
                status: isZh ? '已验证' : 'Verified',
                tone: 'ok',
                meta: isZh ? '分数 742 · 14 天同意有效' : 'Score 742 · 14-day consent active',
              },
              {
                cat: isZh ? '租赁历史' : 'Rental hist.',
                name: isZh ? '过去房东推荐（1）' : 'Past landlord reference (1)',
                status: isZh ? '已上传' : 'Uploaded',
                tone: 'info',
                meta: isZh ? 'M. Chen · 3 年租约' : 'M. Chen · 3 yr tenancy',
              },
              {
                cat: isZh ? '租赁历史' : 'Rental hist.',
                name: isZh ? '过去房东推荐（2）' : 'Past landlord reference (2)',
                status: isZh ? '缺失' : 'Missing',
                tone: 'mute',
                meta: isZh ? '可选' : 'Optional',
              },
              {
                cat: isZh ? '其他' : 'Other',
                name: isZh ? '宠物资料' : 'Pet profile',
                status: isZh ? 'N/A' : 'N/A',
                tone: 'mute',
                meta: isZh ? '无宠物' : 'No pets',
              },
            ].map((d, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 110px auto',
                  gap: 14,
                  padding: '12px 22px',
                  borderTop: i ? `1px dashed ${v3.border}` : 'none',
                  alignItems: 'center',
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 10,
                    color: v3.textFaint,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {d.cat}
                </span>
                <div>
                  <div style={{ color: v3.textPrimary, fontWeight: 500 }}>{d.name}</div>
                  {d.meta && (
                    <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                      {d.meta}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 9px',
                    borderRadius: 999,
                    border: `1px solid ${
                      d.tone === 'ok'
                        ? '#BBF7D0'
                        : d.tone === 'warn'
                          ? '#FDE68A'
                          : d.tone === 'info'
                            ? '#BFDBFE'
                            : v3.divider
                    }`,
                    background:
                      d.tone === 'ok'
                        ? '#DCFCE7'
                        : d.tone === 'warn'
                          ? '#FEF3C7'
                          : d.tone === 'info'
                            ? '#DBEAFE'
                            : v3.divider,
                    color:
                      d.tone === 'ok'
                        ? '#16A34A'
                        : d.tone === 'warn'
                          ? '#D97706'
                          : d.tone === 'info'
                            ? '#2563EB'
                            : v3.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {d.status}
                </span>
                <button
                  style={{
                    padding: 0,
                    color: v3.textMuted,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {d.status === 'Missing' ? (isZh ? '上传' : 'Upload') : isZh ? '查看' : 'View'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'grid', gap: 18 }}>
          {/* AI Panel */}
          <div
            style={{
              background: 'linear-gradient(180deg, #F3EEFF 0%, #fff 100%)',
              border: `1px solid #D7C5FA`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: '#7C3AED',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                ✦
              </span>
              <span
                style={{
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  color: v3.textPrimary,
                }}
              >
                AI: {isZh ? '改进你的准备' : 'improve your readiness'}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                {
                  body: isZh
                    ? '添加就业信函以解锁你的范围内的 12 个更多列表。'
                    : 'Add an employment letter to unlock 12 more listings in your range.',
                  cta: isZh ? '使用模板' : 'Use template',
                },
                {
                  body: isZh
                    ? '以 $19 验证收入以显示已验证收入徽章。'
                    : 'Verify income for $19 to display the Verified Income badge.',
                  cta: isZh ? '升级' : 'Upgrade',
                },
                {
                  body: isZh
                    ? '1 个参考过期 — 邀请 M. Chen 刷新。'
                    : '1 reference outdated — invite M. Chen to refresh.',
                  cta: isZh ? '邀请' : 'Invite',
                },
              ].map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                  <span
                    style={{
                      color: '#7C3AED',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    ›
                  </span>
                  <span style={{ flex: 1 }}>
                    <div style={{ color: v3.textSecondary, fontSize: 13 }}>{it.body}</div>
                  </span>
                  <button
                    style={{
                      fontSize: 12,
                      color: '#7C3AED',
                      padding: 0,
                      whiteSpace: 'nowrap',
                      background: 'none',
                      border: 'none',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {it.cta}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Active share links */}
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: '10.5px',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {isZh ? '激活分享链接 · 3' : 'Active share links · 3'}
            </div>
            {[
              {
                name: isZh ? 'Stayloop · 128 Bathurst' : 'Stayloop · 128 Bathurst',
                meta: isZh ? '9 天后过期' : 'Expires in 9 days',
                tone: 'ok',
              },
              {
                name: isZh ? 'Stayloop · 52 Wellesley' : 'Stayloop · 52 Wellesley',
                meta: isZh ? '已查看 3 次 · 6 天剩余' : 'Viewed 3× · 6d left',
                tone: 'info',
              },
              {
                name: 'agent.kim@remax.com',
                meta: isZh ? '自定义范围 · 4 天' : 'Custom scope · 4d',
                tone: 'gold',
              },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderTop: i ? `1px dashed ${v3.border}` : 'none',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background:
                      s.tone === 'ok' ? '#16A34A' : s.tone === 'info' ? '#2563EB' : '#D97706',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, fontSize: 13 }}>
                  <div style={{ color: v3.textPrimary, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: v3.textMuted }}>{s.meta}</div>
                </div>
                <button
                  style={{
                    padding: 0,
                    color: v3.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '撤销' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>

          {/* Compliance */}
          <div
            style={{
              background: v3.surfaceMuted,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: '10.5px',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              {isZh ? '合规' : 'Compliance'}
            </div>
            <div
              style={{
                fontSize: 12,
                color: v3.textSecondary,
                lineHeight: 1.6,
              }}
            >
              {isZh
                ? '我们从不自动分享数据。每个链接都有一个范围、过期时间和审计线索。背景调查需要你的明确同意（根据 PIPEDA）。'
                : 'We never auto-share data. Each link has a scope, expiry, and audit trail. Background checks require your explicit consent under PIPEDA.'}
            </div>
          </div>
        </div>
        {/* End main content pane */}

        {/* Right sidebar (moved here) */}
        <div style={{ display: 'grid', gap: 18 }}>
          {/* AI Panel */}
          <div
            style={{
              background: 'linear-gradient(180deg, #F3EEFF 0%, #fff 100%)',
              border: `1px solid #D7C5FA`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: '#7C3AED',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                ✦
              </span>
              <span
                style={{
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  color: v3.textPrimary,
                }}
              >
                AI: {isZh ? '改进你的准备' : 'improve your readiness'}
              </span>
            </div>
          </div>

          {/* Active share links */}
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: '10.5px',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {isZh ? '激活分享链接 · 3' : 'Active share links · 3'}
            </div>
          </div>

          {/* Compliance */}
          <div
            style={{
              background: v3.surfaceMuted,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: '10.5px',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              {isZh ? '合规' : 'Compliance'}
            </div>
          </div>
        </div>
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 767px) {
          :global(.passport-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </PageShell>
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
