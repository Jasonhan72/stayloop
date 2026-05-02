'use client'
// V4 Landlord Dashboard — pipeline strip + top applicants + KPIs
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import PageShell from '@/components/v4/PageShell'
import { useIsMobile } from '@/lib/useMediaQuery'
import { Application, Listing } from '@/types'

export default function Dashboard() {
  const { t, lang } = useT()
  const isZh = lang === 'zh'
  const isMobile = useIsMobile()
  const { user: landlord, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [applications, setApplications] = useState<Application[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')
  const [loading, setLoading] = useState(true)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutBanner, setCheckoutBanner] = useState<null | 'pending' | 'success' | 'cancel'>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const qp = new URL(window.location.href).searchParams
      if (qp.get('upgrade') === '1') setShowUpgrade(true)
      const checkout = qp.get('checkout')
      if (checkout === 'success') setCheckoutBanner('pending')
      if (checkout === 'cancel') setCheckoutBanner('cancel')
    }
    if (landlord) fetchAll()
  }, [landlord])

  useEffect(() => {
    if (checkoutBanner !== 'pending' || !landlord) return
    if (plan === 'pro' || plan === 'enterprise') {
      setCheckoutBanner('success')
      setShowUpgrade(false)
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href)
        u.searchParams.delete('checkout')
        u.searchParams.delete('session_id')
        window.history.replaceState({}, '', u.toString())
      }
      return
    }
    let cancelled = false
    let tries = 0
    const tick = async () => {
      if (cancelled) return
      tries += 1
      const { data } = await supabase
        .from('landlords')
        .select('plan')
        .eq('id', landlord.profileId)
        .maybeSingle()
      if (cancelled) return
      if (data?.plan && data.plan !== plan) {
        setPlan(data.plan as 'free' | 'pro' | 'enterprise')
        return
      }
      if (tries >= 20) return
      setTimeout(tick, 1000)
    }
    tick()
    return () => { cancelled = true }
  }, [checkoutBanner, landlord, plan])

  async function startCheckout() {
    setCheckoutLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('not signed in')
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'checkout failed')
      window.location.href = data.url
    } catch (err: any) {
      alert(`Checkout error: ${err?.message || 'unknown'}`)
      setCheckoutLoading(false)
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('not signed in')
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'portal failed')
      window.location.href = data.url
    } catch (err: any) {
      alert(`Billing portal error: ${err?.message || 'unknown'}`)
      setPortalLoading(false)
    }
  }

  async function fetchAll() {
    const [appsRes, listingsRes, planRes] = await Promise.all([
      supabase.from('applications').select('*, listing:listings(*)').order('created_at', { ascending: false }).limit(6),
      supabase.from('listings').select('*').order('created_at', { ascending: false }),
      supabase.from('landlords').select('plan').eq('id', landlord!.profileId).maybeSingle(),
    ])
    if (appsRes.data) setApplications(appsRes.data)
    if (listingsRes.data) setListings(listingsRes.data)
    if (planRes.data?.plan) setPlan(planRes.data.plan)
    setLoading(false)
  }

  if (authLoading || !landlord) {
    return (
      <PageShell role="landlord">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: 10, border: `4px solid rgba(4,120,87,0.2)`, borderTopColor: v3.brand, animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: 12, color: v3.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>Loading...</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </PageShell>
    )
  }

  const topApps = applications.slice(0, 3)

  return (
    <PageShell role="landlord">
      <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
        {/* Eyebrow + Title */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 8 }}>
            {isZh ? '房东工作区' : 'Landlord Workspace · Hudson Living'}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 6 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--f-serif), sans-serif', fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', color: v3.textPrimary }}>
              {applications.length} {isZh ? '份申请待审 · ' : 'applications waiting · '}
              {applications.filter(a => a.status === 'approved').length} {isZh ? '份租赁已就绪' : 'leases ready to send'}
            </h1>
          </div>
          <p style={{ color: v3.textSecondary, fontSize: 14, margin: '6px 0 24px' }}>
            {isZh
              ? 'AI 夜间跑分：4 份新筛查报告，3 份不一致旗标，1 份公平住房警告。'
              : 'AI ran overnight: 4 new screening reports, 3 inconsistency flags, 1 fair-housing language warning.'}
          </p>
        </div>

        {/* KPIs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
          {[
            { en: 'Active listings', zh: '活跃房源', val: listings.filter(l => l.is_active).length, sub: isZh ? '2 份草稿' : '2 drafts', tone: v3.brand },
            { en: 'Apps to review', zh: '待审申请', val: applications.filter(a => a.status !== 'approved' && a.status !== 'declined').length, sub: isZh ? '3 份高就绪' : '3 high readiness', tone: v3.warning },
            { en: 'AI reports / month', zh: 'AI 报告 / 月', val: '38/40', sub: isZh ? 'Plus 计划' : 'Plus plan', tone: v3.trust },
            { en: 'Leases this month', zh: '本月租赁', val: applications.filter(a => a.status === 'approved').length, sub: isZh ? '$5,250 GMV' : '$5,250 GMV', tone: v3.success },
          ].map((kpi, i) => (
            <div key={i} style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 6 }}>
                {isZh ? kpi.zh : kpi.en}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 30, fontWeight: 500, color: kpi.tone, marginTop: 6, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                {kpi.val}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: v3.textMuted }}>{kpi.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Two-column: Pipeline + Right sidebar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18 }}>
          <div style={{ display: 'grid', gap: 18 }}>
            {/* Pipeline strip */}
            <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 22, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
                  {isZh ? '管道 · 本周' : 'Pipeline · this week'}
                </h3>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: '1px solid transparent', color: '#fff', background: v3.trust }}>
                  {isZh ? 'AI 排序' : 'AI-prioritized'}
                </span>
                <div style={{ flex: 1 }} />
                <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  {isZh ? '打开队列 →' : 'Open queue →'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {[
                  { stage: 'New apps', count: applications.filter(a => a.status === 'new').length, tone: v3.warning, note: isZh ? '3 份高就绪' : '3 high readiness' },
                  { stage: 'Screening', count: applications.filter(a => a.status === 'reviewing').length, tone: v3.trust, note: isZh ? '2 份矛盾' : '2 with inconsistencies' },
                  { stage: 'Approved', count: applications.filter(a => a.status === 'approved').length, tone: v3.success, note: isZh ? '发送租赁草稿' : 'Send lease draft' },
                  { stage: 'Lease review', count: 2, tone: v3.brand, note: isZh ? '待租客' : 'Awaiting tenant' },
                  { stage: 'Signed', count: 3, tone: v3.textMuted, note: isZh ? '本月' : 'This month' },
                ].map((c, i) => (
                  <div key={i} style={{ padding: '14px 16px', background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: v3.textMuted, marginBottom: 4 }}>
                      {c.stage}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 28, fontWeight: 600, color: c.tone, letterSpacing: '-0.02em', marginTop: 4 }}>
                      {c.count}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                      {c.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top applicants table */}
            <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
              <div style={{ padding: '14px 22px', borderBottom: `1px solid ${v3.border}`, display: 'flex', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
                  {isZh ? '顶级申请人 · ' : 'Top applicants · '}
                  {topApps.length ? topApps[0].listing?.address : 'N/A'}
                </h3>
                <span style={{ fontSize: 12, color: v3.textMuted, marginLeft: 10 }}>
                  {topApps.length} of {applications.length} shown
                </span>
                <div style={{ flex: 1 }} />
                <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  {isZh ? '比对' : 'Compare'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1.6fr 1fr 1fr 1fr 110px', gap: 12, padding: '10px 22px', background: v3.surfaceMuted, borderBottom: `1px solid ${v3.border}`, fontSize: 10, color: v3.textMuted, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                <span></span><span>Applicant</span><span>Readiness</span><span>Income</span><span>Inconsistency</span><span></span>
              </div>
              {topApps.map((app, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1.6fr 1fr 1fr 1fr 110px', gap: 12, padding: '14px 22px', borderTop: i ? `1px solid ${v3.border}` : 'none', fontSize: 13, alignItems: 'center' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: v3.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {(app.first_name?.[0] || '').toUpperCase()}{(app.last_name?.[0] || '').toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: v3.textPrimary }}>
                      {app.first_name} {app.last_name}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                      {i === 0 ? (isZh ? '⭐ AI 顶级匹配' : '⭐ AI top match') : (isZh ? '通过 Stayloop 申请' : 'Applied via Stayloop')}
                    </div>
                  </div>
                  <div style={{ width: 120 }}>
                    <div style={{ height: 6, background: v3.surfaceMuted, borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
                      <div style={{ width: `${(app.ai_score || 0) / 100 * 100}%`, height: '100%', background: app.ai_score! >= 90 ? v3.success : app.ai_score! >= 80 ? v3.warning : v3.danger }} />
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: v3.textSecondary, fontWeight: 600, marginTop: 3 }}>
                      {app.ai_score || 0}% ready
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: app.monthly_income && app.monthly_income >= 3000 ? v3.success : v3.warning, fontWeight: 500 }}>
                    ${app.monthly_income?.toLocaleString()} / mo
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${app.ltb_records_found ? '#FECACA' : '#BBF7D0'}`, color: app.ltb_records_found ? v3.danger : v3.success, background: app.ltb_records_found ? v3.dangerSoft : v3.successSoft }}>
                    {app.ltb_records_found ? (isZh ? `${app.ltb_records_found} 份记录` : `${app.ltb_records_found} records`) : (isZh ? '无' : 'None')}
                  </span>
                  <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, justifySelf: 'end' }}>
                    {isZh ? '打开报告 →' : 'Open report →'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right sidebar: AI panel + stats */}
          <div style={{ display: 'grid', gap: 18 }}>
            {/* AI Panel */}
            <div style={{ background: `linear-gradient(180deg, ${v3.trustSoft} 0%, #fff 100%)`, border: `1px solid #D7C5FA`, borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: v3.trust, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 11 }}>✦</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>
                  {isZh ? '接下来最好的行动' : 'Next-best-actions'}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[
                  { title: isZh ? '批准 Alex Taylor' : 'Approve Alex Taylor', body: isZh ? 'AI 顶级匹配 · 96% 就绪 · 全部文件已验证。' : 'AI top match · 96% readiness · all docs verified.', cta: isZh ? '批准 →' : 'Approve →' },
                  { title: isZh ? '向 Daniel Okafor 请求就业信' : 'Request employment letter from Daniel Okafor', body: isZh ? '需要 14 York。AI 起草消息已就绪。' : 'Required for 14 York. AI drafted message ready.', cta: isZh ? '发送' : 'Send' },
                  { title: isZh ? '修复房源语言："不要新移民"' : 'Fix listing language: "no newcomers"', body: isZh ? '合规护栏标记 1 套房源。建议改写。' : 'Compliance Guardrail flagged 1 listing. Reword suggested.', cta: isZh ? '打开' : 'Open' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: v3.textPrimary, lineHeight: 1.5 }}>
                    <span style={{ color: v3.trust, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, marginTop: 2 }}>›</span>
                    <span style={{ flex: 1 }}>
                      {item.title && <div style={{ fontWeight: 600 }}>{item.title}</div>}
                      <div style={{ color: v3.textSecondary, fontSize: 13 }}>{item.body}</div>
                    </span>
                    <button style={{ background: 'none', border: 'none', color: v3.trust, fontSize: 12, fontWeight: 600, padding: 0, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                      {item.cta}
                    </button>
                  </div>
                ))}
              </div>
              <button style={{ width: '100%', marginTop: 12, padding: '11px 20px', background: v3.surfaceCard, color: v3.textPrimary, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {isZh ? '打开 AI 副驾驶' : 'Open AI Copilot'}
              </button>
            </div>

            {/* Stats card */}
            <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 8 }}>
                {isZh ? '本月' : 'This month'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                {[
                  { en: 'Listings live', zh: '上线房源', val: listings.filter(l => l.is_active).length },
                  { en: 'New apps', zh: '新申请', val: applications.filter(a => new Date(a.created_at).getMonth() === new Date().getMonth()).length },
                  { en: 'Approval rate', zh: '批准率', val: applications.length > 0 ? Math.round((applications.filter(a => a.status === 'approved').length / applications.length) * 100) + '%' : '—' },
                  { en: 'Days listed (avg)', zh: '平均上架', val: '11' },
                  { en: 'AI hours saved', zh: 'AI 节省小时', val: '17.4' },
                  { en: 'Stripe income', zh: 'Stripe 收入', val: '$5,250' },
                ].map((stat, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 2 }}>
                      {isZh ? stat.zh : stat.en}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 600, color: v3.textPrimary, letterSpacing: '-0.01em', marginTop: 2 }}>
                      {stat.val}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageShell>
  )
}
