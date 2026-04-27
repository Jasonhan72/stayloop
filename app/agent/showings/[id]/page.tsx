'use client'
// /agent/showings/[id] — Showing Detail (V3 section 08)
export const runtime = 'edge'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'

interface ShowingDetail {
  id: string
  scheduled_at: string
  duration_min: number
  status: string
  agent_feedback: string | null
  agent_note: string | null
  tenant_questions: Array<{ question: string; answer: string }>
  listing: {
    address: string
    unit: string | null
    city: string
    monthly_rent: number | null
  } | null
  applicant: {
    first_name: string | null
    last_name: string | null
    email: string
    monthly_income: number | null
    employer_name: string | null
    job_title: string | null
    ai_score: number | null
    doc_authenticity_score: number | null
    payment_ability_score: number | null
    court_records_score: number | null
    stability_score: number | null
    behavior_signals_score: number | null
    info_consistency_score: number | null
  } | null
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function ShowingDetailPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [s, setS] = useState<ShowingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !id) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId, id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('showings')
      .select('id, scheduled_at, duration_min, status, agent_feedback, agent_note, tenant_questions, listing:listings(address, unit, city, monthly_rent), applicant:applications(first_name, last_name, email, monthly_income, employer_name, job_title, ai_score, doc_authenticity_score, payment_ability_score, court_records_score, stability_score, behavior_signals_score, info_consistency_score)')
      .eq('id', id)
      .maybeSingle()
    setS((data as any) || null)
    setFeedback((data as any)?.agent_feedback || null)
    setLoading(false)
  }

  async function recordFeedback(value: string) {
    if (!s) return
    setFeedback(value)
    await supabase.from('showings').update({ agent_feedback: value, status: 'completed' }).eq('id', s.id)
  }

  if (authLoading || loading) {
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载…' : 'Loading…'}</div>
      </main>
    )
  }

  if (!s) {
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh', padding: 24 }}>
        <div style={{ color: v3.textMuted, fontSize: 14, textAlign: 'center', marginTop: 64 }}>
          {isZh ? '找不到这场带看。' : 'Showing not found.'}
        </div>
      </main>
    )
  }

  const fullName = s.applicant
    ? [s.applicant.first_name, s.applicant.last_name].filter(Boolean).join(' ') || s.applicant.email
    : '—'
  const initials = fullName.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  const addr = s.listing ? `${s.listing.address}${s.listing.unit ? ` · ${s.listing.unit}` : ''}` : '—'
  const ratio = s.applicant?.monthly_income && s.listing?.monthly_rent
    ? (s.applicant.monthly_income / s.listing.monthly_rent).toFixed(1)
    : null

  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <header style={{ background: v3.surface, borderBottom: `1px solid ${v3.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/agent/day" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: v3.textPrimary }}>
          <span style={{ fontSize: 16 }}>‹</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isZh ? '看房简报' : 'Showing brief'}</span>
        </Link>
        <span style={{ fontSize: 12, color: v3.brand, fontWeight: 700 }}>
          {fmtTime(s.scheduled_at)} · {new Date(s.scheduled_at).toLocaleDateString()}
        </span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24 }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', margin: '4px 0' }}>{addr}</h1>
          <div style={{ fontSize: 12, color: v3.textMuted }}>
            {s.listing?.city || ''}
            {s.listing?.monthly_rent ? ` · $${s.listing.monthly_rent.toLocaleString()}/mo` : ''}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }} className="sd-grid">
          <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ width: 48, height: 48, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>
                {initials}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{fullName}</span>
                  {s.applicant?.ai_score && s.applicant.ai_score >= 75 && (
                    <span style={{ fontSize: 11, color: v3.brandStrong, background: v3.brandSoft, padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>✓ Verified</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: v3.textMuted }}>
                  {s.applicant?.job_title}{s.applicant?.employer_name ? ` @ ${s.applicant.employer_name}` : ''}
                </div>
                {ratio && (
                  <div style={{ fontSize: 11, color: v3.brandStrong, marginTop: 2, fontWeight: 600 }}>
                    {ratio}× rent
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: v3.brandStrong, letterSpacing: '-0.025em', lineHeight: 1 }}>
                  {s.applicant?.ai_score ?? '—'}
                </div>
                <div style={{ fontSize: 9, color: v3.textMuted, fontWeight: 600, letterSpacing: '0.08em' }}>SCORE</div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${v3.divider}`, paddingTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {isZh ? '六维拆解' : 'SIX-AXIS BREAKDOWN'}
              </div>
              {[
                { label: isZh ? '材料真实' : 'Document', val: s.applicant?.doc_authenticity_score },
                { label: isZh ? '支付能力' : 'Payment', val: s.applicant?.payment_ability_score },
                { label: isZh ? '法庭记录' : 'Court', val: s.applicant?.court_records_score },
                { label: isZh ? '稳定性' : 'Stability', val: s.applicant?.stability_score },
                { label: isZh ? '行为信号' : 'Behavior', val: s.applicant?.behavior_signals_score },
                { label: isZh ? '信息一致' : 'Consistency', val: s.applicant?.info_consistency_score },
              ].map((r) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${v3.divider}` }}>
                  <span style={{ color: v3.textSecondary }}>{r.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: v3.textPrimary, fontWeight: 600 }}>{r.val ?? '—'}/100</span>
                </div>
              ))}
            </div>

            {s.tenant_questions && s.tenant_questions.length > 0 && (
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                  ✦ {isZh ? 'Echo · 租客问过的问题' : 'ECHO · WHAT THEY ASKED'}
                </div>
                {s.tenant_questions.map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${v3.divider}` }}>
                    <span style={{ color: v3.textSecondary, fontStyle: 'italic' }}>"{row.question}"</span>
                    <span style={{ color: v3.brandStrong, fontWeight: 600 }}>→ {row.answer}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                {isZh ? '看完后 · 1 键反馈' : 'AFTER TOUR · 1-CLICK FEEDBACK'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { v: 'will_apply', label: '🟢 ' + (isZh ? '会申请' : 'Will apply') },
                  { v: 'thinking', label: '🟡 ' + (isZh ? '在考虑' : 'Thinking') },
                  { v: 'not_for_me', label: '🔴 ' + (isZh ? '不合适' : 'Not for me') },
                  { v: 'note', label: '✏️ ' + (isZh ? '备注' : 'Note') },
                ].map((b) => (
                  <button
                    key={b.v}
                    onClick={() => recordFeedback(b.v)}
                    style={{
                      padding: '8px 12px',
                      background: feedback === b.v ? v3.brandSoft : v3.surfaceMuted,
                      border: `1px solid ${feedback === b.v ? v3.brand : v3.border}`,
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      color: feedback === b.v ? v3.brandStrong : v3.textPrimary,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              {feedback && (
                <div style={{ marginTop: 10, fontSize: 11, color: v3.brandStrong, fontWeight: 600 }}>
                  ✓ {isZh ? '已记录' : 'Recorded'}
                </div>
              )}
            </div>

            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {isZh ? '快捷操作' : 'QUICK ACTIONS'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.listing?.address || '')}`}
                  target="_blank" rel="noreferrer"
                  style={{ padding: '10px 14px', background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 8, textAlign: 'center', textDecoration: 'none', color: v3.textPrimary, fontSize: 13, fontWeight: 600 }}
                >
                  📍 {isZh ? '导航' : 'Navigate'}
                </a>
                {s.applicant?.email && (
                  <a
                    href={`mailto:${s.applicant.email}`}
                    style={{ padding: '10px 14px', background: v3.brand, color: '#fff', borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                  >
                    💬 {isZh ? '联系租客' : 'Email tenant'}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`@media (max-width: 880px){:global(.sd-grid){grid-template-columns:1fr !important;}}`}</style>
    </main>
  )
}
