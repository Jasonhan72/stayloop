'use client'
// /agent/day — Field Agent Day Brief (V3 section 07)
// Production: reads showings + payouts for the current Field Agent.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

interface AgentRow {
  id: string
  display_name: string
  initials: string | null
  reco_number: string | null
  signed_last_12mo: number
  avg_dom_days: number | null
  active_load: number
}

interface Showing {
  id: string
  scheduled_at: string
  duration_min: number
  status: string
  listing: { address: string; unit: string | null; monthly_rent: number | null } | null
  applicant: { first_name: string | null; last_name: string | null; ai_score: number | null; email: string } | null
}

interface Payout {
  id: string
  field_agent_id: string
  period: string
  amount: number
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function isToday(ts: string): boolean {
  const d = new Date(ts)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

export default function AgentDayPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [agent, setAgent] = useState<AgentRow | null>(null)
  const [showings, setShowings] = useState<Showing[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId])

  async function load() {
    setLoading(true)
    const { data: ag } = await supabase
      .from('field_agents')
      .select('id, display_name, initials, reco_number, signed_last_12mo, avg_dom_days, active_load')
      .eq('auth_id', user!.authId)
      .maybeSingle()
    setAgent((ag as AgentRow) || null)
    if (ag) {
      const [{ data: sh }, { data: py }] = await Promise.all([
        supabase
          .from('showings')
          .select('id, scheduled_at, duration_min, status, listing:listings(address, unit, monthly_rent), applicant:applications(first_name, last_name, ai_score, email)')
          .eq('agent_id', (ag as any).id)
          .order('scheduled_at', { ascending: true })
          .limit(20),
        supabase
          .from('payouts')
          .select('id, field_agent_id, period, amount')
          .eq('field_agent_id', (ag as any).id)
          .order('period', { ascending: false })
          .limit(30),
      ])
      setShowings((sh as any[]) || [])
      setPayouts((py as any[]) || [])
    }
    setLoading(false)
  }

  if (authLoading || loading) {
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载…' : 'Loading…'}</div>
      </main>
    )
  }

  if (!agent) {
    return (
      <PageShell role="agent">
        <div style={{ maxWidth: 480, margin: '64px auto 0', textAlign: 'center', background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 16, padding: '40px 24px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            {isZh ? '你还不是 Field Agent' : 'You\u2019re not registered as a Field Agent'}
          </h1>
          <p style={{ color: v3.textMuted, fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
            {isZh
              ? '联系 Stayloop 加入网络。RECO 持牌经纪 + brokerage 关系即可。'
              : 'Contact Stayloop to join the network. RECO-licensed agent + brokerage relationship required.'}
          </p>
          <Link href="mailto:hello@stayloop.ai" style={{ display: 'inline-flex', padding: '12px 22px', background: v3.brand, color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            {isZh ? '联系我们' : 'Get in touch'}
          </Link>
        </div>
      </PageShell>
    )
  }

  const todays = showings.filter((s) => isToday(s.scheduled_at) && s.status !== 'cancelled')
  const todaysDone = todays.filter((s) => s.status === 'completed').length

  return (
    <PageShell role="agent" path={isZh ? '今日任务' : 'Day brief'}>
      <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
        <SecHead
          eyebrow={isZh ? '代理工作区' : 'Field Agent'}
          title={isZh
            ? `${getGreeting(isZh)}，${agent.display_name.split(' ')[0]}`
            : `${getGreeting(isZh)}, ${agent.display_name.split(' ')[0]}`}
          sub={isZh
            ? `今天 ${todays.length} 场带看`
            : `${todays.length} showing${todays.length === 1 ? '' : 's'} today`}
        />

        <PayoutCard payouts={payouts} lang={lang} />

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="ad-grid">
          <section style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{isZh ? '今日任务' : "Today's tasks"}</h2>
              <span style={{ fontSize: 11, color: v3.textMuted }}>
                {todaysDone} of {todays.length} done
              </span>
            </div>
            {todays.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: v3.textMuted, fontSize: 13 }}>
                <div style={{ marginBottom: 12 }}>
                  {isZh ? '今天没有安排带看。' : 'No showings booked today.'}
                </div>
                <a
                  href="/listings/new"
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    background: v3.brand,
                    color: '#fff',
                    borderRadius: 10,
                    textDecoration: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {isZh ? '发现新房源 →' : 'Find new listings →'}
                </a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {todays.map((s) => {
                  const name = s.applicant
                    ? [s.applicant.first_name, s.applicant.last_name].filter(Boolean).join(' ') || s.applicant.email
                    : isZh ? '未指定租客' : 'Unassigned tenant'
                  const addr = s.listing ? `${s.listing.address}${s.listing.unit ? ` · ${s.listing.unit}` : ''}` : '—'
                  const isTopFit = (s.applicant?.ai_score || 0) >= 90
                  return (
                    <Link
                      key={s.id}
                      href={`/agent/showings/${s.id}`}
                      style={{ display: 'flex', gap: 14, padding: 12, background: v3.surfaceMuted, borderRadius: 10, textDecoration: 'none', color: v3.textPrimary }}
                    >
                      <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 60 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
                          {fmtTime(s.scheduled_at)}
                        </div>
                        <div style={{ fontSize: 10, color: v3.textMuted }}>{s.duration_min} min</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>
                            {isZh ? '带看' : 'Tour'} · {addr}
                          </span>
                          {isTopFit && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.06em' }}>
                              Logic Pick
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: v3.textMuted }}>
                          {name}
                          {s.applicant?.ai_score ? ` · Score ${s.applicant.ai_score}` : ''}
                        </div>
                        <details style={{ marginTop: 6, cursor: 'pointer' }}>
                          <summary style={{ fontSize: 10, color: v3.brand, fontWeight: 600, userSelect: 'none' }}>
                            {isZh ? '建议谈点 →' : 'Talking points →'}
                          </summary>
                          <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 16, fontSize: 10, color: v3.textSecondary, lineHeight: 1.5 }}>
                            <li>{isZh ? '确认租客入住日期灵活性' : 'Confirm move-in date flexibility'}</li>
                            <li>{isZh ? '强调交通便利性' : 'Highlight transit access'}</li>
                            <li>{isZh ? '询问宠物情况' : 'Ask about pets'}</li>
                          </ul>
                        </details>
                      </div>
                      <span style={{ alignSelf: 'center', color: v3.textMuted, fontSize: 14 }}>›</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                {isZh ? '近 12 个月' : 'Last 12 months'}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em', marginBottom: 4 }}>
                {agent.signed_last_12mo} <span style={{ fontSize: 12, color: v3.textMuted, fontWeight: 500 }}>{isZh ? '签约' : 'signed'}</span>
              </div>
              <div style={{ fontSize: 11, color: v3.brandStrong, marginBottom: 12 }}>
                {isZh ? `平均挂牌 ${agent.avg_dom_days || '—'} 天` : `${agent.avg_dom_days || '—'}d avg DoM`}
              </div>
              <div style={{ borderTop: `1px solid ${v3.divider}`, paddingTop: 10, fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>
                Active load: {agent.active_load}
              </div>
            </div>
            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {isZh ? 'AI 已为你做了' : 'AI DID FOR YOU'}
              </div>
              {[
                { en: 'Showings booked', zh: '已预约', val: showings.filter((s) => s.status !== 'cancelled').length },
                { en: 'Logic Picks', zh: 'Logic 推荐', val: showings.filter((s) => (s.applicant?.ai_score || 0) >= 90).length },
                { en: 'Awaiting your tour', zh: '待带看', val: showings.filter((s) => s.status === 'requested' || s.status === 'confirmed').length },
              ].map((r) => (
                <div key={r.en} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${v3.divider}` }}>
                  <span style={{ color: v3.textSecondary }}>{isZh ? r.zh : r.en}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{r.val}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <style jsx>{`@media (max-width: 880px){:global(.ad-grid){grid-template-columns:1fr !important;}}`}</style>
    </PageShell>
  )
}

function getGreeting(zh: boolean): string {
  const h = new Date().getHours()
  if (zh) return h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好'
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function PayoutCard({ payouts, lang }: { payouts: Payout[]; lang: 'zh' | 'en' }) {
  const isZh = lang === 'zh'
  const today = new Date().toISOString().split('T')[0]
  const todayPayout = payouts.find((p) => p.period === today)?.amount ?? 0

  // Calculate week-to-date (Mon to today)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const mondayDate = new Date(now)
  mondayDate.setDate(now.getDate() - daysFromMonday)
  const weekStart = mondayDate.toISOString().split('T')[0]

  const weekPayouts = payouts.filter((p) => p.period >= weekStart && p.period <= today)
  const weekTotal = weekPayouts.reduce((sum, p) => sum + p.amount, 0)

  // Calculate month-to-date (1st to today)
  const monthStart = `${today.substring(0, 7)}-01`
  const monthPayouts = payouts.filter((p) => p.period >= monthStart && p.period <= today)
  const monthTotal = monthPayouts.reduce((sum, p) => sum + p.amount, 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
      <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          {isZh ? '今日收入' : "Today's earnings"}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: v3.brand, letterSpacing: '-0.02em' }}>
          ${todayPayout.toLocaleString()}
        </div>
      </div>
      <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          {isZh ? '本周收入' : 'Week to date'}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: v3.brand, letterSpacing: '-0.02em' }}>
          ${weekTotal.toLocaleString()}
        </div>
      </div>
      <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          {isZh ? '本月收入' : 'Month to date'}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: v3.brand, letterSpacing: '-0.02em' }}>
          ${monthTotal.toLocaleString()}
        </div>
      </div>
    </div>
  )
}
