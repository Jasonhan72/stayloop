'use client'
// /history — Tenant Rental History (V3 section 24)
// Production: reads tenancies for the current user, with co-sign request flow.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

interface Tenancy {
  id: string
  address: string
  city: string | null
  monthly_rent: number | null
  start_date: string
  end_date: string | null
  on_time_payments: number
  total_payments: number
  rating_stars: number | null
  landlord_note: string | null
  prior_landlord_name: string | null
  prior_landlord_email: string | null
  is_active: boolean
  verification_status: string
}

interface CoSignModal {
  tenancyId: string | null
  email: string
  note: string
}

function monthsBetween(start: string, end: string | null): number {
  const s = new Date(start)
  const e = end ? new Date(end) : new Date()
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()))
}

export default function HistoryPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user } = useUser({ redirectIfMissing: true })
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [coSignModal, setCoSignModal] = useState<CoSignModal>({ tenancyId: null, email: '', note: '' })
  const [form, setForm] = useState({
    address: '',
    city: 'Toronto',
    monthly_rent: '',
    start_date: '',
    end_date: '',
    prior_landlord_name: '',
    prior_landlord_email: '',
  })

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tenancies')
      .select('*')
      .order('start_date', { ascending: false })
    setTenancies((data as Tenancy[]) || [])
    setLoading(false)
  }

  async function addTenancy() {
    if (!user || !form.address || !form.start_date) return
    await supabase.from('tenancies').insert({
      tenant_user_id: user?.authId,
      address: form.address,
      city: form.city,
      monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      prior_landlord_name: form.prior_landlord_name || null,
      prior_landlord_email: form.prior_landlord_email || null,
      verification_status: form.prior_landlord_email ? 'pending_landlord' : 'unverified',
    })
    setShowAdd(false)
    setForm({ address: '', city: 'Toronto', monthly_rent: '', start_date: '', end_date: '', prior_landlord_name: '', prior_landlord_email: '' })
    void load()
  }

  const totalMonths = tenancies.reduce((m, t) => m + monthsBetween(t.start_date, t.end_date), 0)
  const yrs = (totalMonths / 12).toFixed(1)
  const totalOnTime = tenancies.reduce((s, t) => s + (t.on_time_payments || 0), 0)
  const totalPayments = tenancies.reduce((s, t) => s + (t.total_payments || 0), 0)

  return (
    <PageShell role="tenant">
      <Phone time="14:55">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/passport" style={{ fontSize: 18, color: v3.textMuted, textDecoration: 'none' }}>‹</Link>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isZh ? '租房记录' : 'Rental History'}</span>
          <span
            style={{ fontSize: 16, color: v3.brandStrong, cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setShowAdd(true)}
          >
            +
          </span>
        </div>

        <div style={{ padding: 16 }}>
          {/* Avg rent trend sparkline */}
          {tenancies.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: v3.textMuted, marginBottom: 6 }}>
                {isZh ? '平均租金走势' : 'Avg rent trend'}
              </div>
              <RentSparkline rents={tenancies.map(t => t.monthly_rent || 0).filter(Boolean)} />
            </div>
          )}

          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {isZh ? `${yrs} 年 · ${tenancies.length} 段租约` : `${yrs} years · ${tenancies.length} tenancies`}
          </h1>
          <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 16, fontFamily: 'var(--font-cn), system-ui' }}>
            {isZh
              ? totalPayments > 0
                ? `${totalOnTime} / ${totalPayments} 准时缴租`
                : '从首段租约开始'
              : totalPayments > 0
                ? `${totalOnTime} / ${totalPayments} on-time payments`
                : 'Starting your first tenancy'}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: 14, background: v3.brandSoft, border: `1px solid ${v3.brand}`, borderRadius: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: v3.brandStrong, letterSpacing: '-0.025em' }}>
                {totalPayments > 0 ? `${totalOnTime} / ${totalPayments}` : '—'}
              </div>
              <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                {isZh ? '准时缴租次数' : 'on-time rent payments'}
              </div>
            </div>
            <div style={{ flex: 1, padding: 14, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em' }}>0</div>
              <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                {isZh ? '纠纷' : 'disputes'}
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: v3.textMuted, fontSize: 13 }}>
              {isZh ? '加载中…' : 'Loading…'}
            </div>
          ) : tenancies.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary, marginBottom: 8 }}>
                {isZh ? '还没有租房记录' : 'No tenancies yet'}
              </div>
              <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
                {isZh
                  ? '加一段过往租约，邀请房东核签，让它跟着你的 Passport 走。'
                  : 'Add a past lease and invite the landlord to co-sign — it will follow your Passport.'}
              </div>
              <button
                onClick={() => setShowAdd(true)}
                style={{ padding: '10px 16px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
              >
                + {isZh ? '添加租约' : 'Add tenancy'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tenancies.map((t) => {
                const months = monthsBetween(t.start_date, t.end_date)
                const yearRange = `${new Date(t.start_date).getFullYear()} — ${
                  t.end_date ? new Date(t.end_date).getFullYear() : 'Now'
                }`
                const initials = (t.prior_landlord_name || 'L')
                  .split(' ')
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join('')
                  .toUpperCase()
                const verStatus = t.verification_status
                const isVerified = verStatus === 'verified'
                const isPending = verStatus === 'pending'
                const isUnverified = verStatus === 'unverified'

                return (
                  <div key={t.id} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: v3.textMuted }}>{yearRange}</div>
                      {/* Verification badge */}
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '4px 8px',
                          borderRadius: 4,
                          background: isVerified ? v3.successSoft : isPending ? v3.warningSoft : v3.divider,
                          color: isVerified ? v3.success : isPending ? v3.warning : v3.textMuted,
                        }}
                      >
                        {isVerified ? (isZh ? '✓ 已验证' : '✓ Verified') : isPending ? (isZh ? '⏳ 待验证' : '⏳ Pending') : (isZh ? '未验证' : 'Unverified')}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, marginBottom: 2 }}>{t.address}</div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 10 }}>
                      {t.city ? `${t.city} · ` : ''}{months} {isZh ? '个月' : 'mo'}
                      {t.monthly_rent ? ` · $${Number(t.monthly_rent).toLocaleString()}/mo` : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: v3.surfaceMuted, borderRadius: 8, marginBottom: 8 }}>
                      <span style={{ width: 24, height: 24, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>
                        {initials}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: v3.textPrimary }}>
                          {t.prior_landlord_name || (isZh ? '前房东' : 'Prior landlord')}
                        </div>
                        {t.is_active ? (
                          <div style={{ fontSize: 10, color: v3.brandStrong, fontWeight: 600 }}>
                            {isZh ? '当前 · Stayloop 已核签' : 'Active · Verified by Stayloop'}
                          </div>
                        ) : t.landlord_note ? (
                          <div style={{ fontSize: 10.5, color: v3.textMuted, lineHeight: 1.4, marginTop: 2 }}>"{t.landlord_note}"</div>
                        ) : null}
                      </div>
                      {t.rating_stars && (
                        <div style={{ color: v3.warning, fontSize: 11, letterSpacing: '-0.05em', flexShrink: 0 }}>
                          {'★'.repeat(t.rating_stars)}
                        </div>
                      )}
                    </div>
                    {/* Co-sign request button for unverified tenancies */}
                    {isUnverified && (
                      <button
                        onClick={() => setCoSignModal({ tenancyId: t.id, email: t.prior_landlord_email || '', note: '' })}
                        style={{ width: '100%', padding: '8px 10px', background: v3.brandSoft, border: `1px solid ${v3.brand}`, borderRadius: 8, fontSize: 11, fontWeight: 600, color: v3.brandStrong, cursor: 'pointer' }}
                      >
                        {isZh ? '邀请房东核签' : 'Request co-sign'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add tenancy modal */}
        {showAdd && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}
            onClick={() => setShowAdd(false)}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: v3.surface, borderRadius: 16, padding: 20, maxWidth: 440, width: '100%' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>
                {isZh ? '添加租约' : 'Add a tenancy'}
              </h2>
              {[
                { k: 'address', l_en: 'Address', l_zh: '地址', placeholder: '2350 King St W #1208' },
                { k: 'city', l_en: 'City', l_zh: '城市' },
                { k: 'monthly_rent', l_en: 'Monthly rent (CAD)', l_zh: '月租 (CAD)', type: 'number' },
                { k: 'start_date', l_en: 'Start date', l_zh: '开始日期', type: 'date' },
                { k: 'end_date', l_en: 'End date (blank = current)', l_zh: '结束日期 (空 = 当前)', type: 'date' },
                { k: 'prior_landlord_name', l_en: 'Landlord name', l_zh: '房东姓名' },
                { k: 'prior_landlord_email', l_en: 'Landlord email (for co-sign)', l_zh: '房东邮箱（核签邀请）', type: 'email' },
              ].map((f) => (
                <label key={f.k} style={{ display: 'block', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    {isZh ? f.l_zh : f.l_en}
                  </span>
                  <input
                    type={f.type || 'text'}
                    placeholder={f.placeholder}
                    value={(form as any)[f.k]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.k]: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
                  />
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => setShowAdd(false)}
                  style={{ flex: 1, padding: 12, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={addTenancy}
                  style={{ flex: 1, padding: 12, background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {isZh ? '保存' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Co-sign request modal */}
        {coSignModal.tenancyId && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}
            onClick={() => setCoSignModal({ tenancyId: null, email: '', note: '' })}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: v3.surface, borderRadius: 16, padding: 20, maxWidth: 440, width: '100%' }}>
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
                  value={coSignModal.email}
                  onChange={(e) => setCoSignModal({ ...coSignModal, email: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  {isZh ? '备注 (可选)' : 'Note (optional)'}
                </span>
                <textarea
                  placeholder={isZh ? '补充信息…' : 'Add context…'}
                  value={coSignModal.note}
                  onChange={(e) => setCoSignModal({ ...coSignModal, note: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minHeight: 60, resize: 'none' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setCoSignModal({ tenancyId: null, email: '', note: '' })}
                  style={{ flex: 1, padding: 12, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: v3.textPrimary }}
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    if (!coSignModal.email || !coSignModal.tenancyId) return
                    // TODO: update tenancy with verification_status='pending' and send email
                    alert(isZh ? '邀请已发送 (TODO)' : 'Invitation sent (TODO)')
                    setCoSignModal({ tenancyId: null, email: '', note: '' })
                  }}
                  style={{ flex: 1, padding: 12, background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {isZh ? '发送邀请' : 'Send invitation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Phone>
    </PageShell>
  )
}

function RentSparkline({ rents }: { rents: number[] }) {
  if (rents.length === 0) return null
  const min = Math.min(...rents)
  const max = Math.max(...rents)
  const range = max - min || 1
  const width = 240
  const height = 32
  const padding = 4

  const points = rents.map((r, i) => {
    const x = (i / (rents.length - 1 || 1)) * (width - padding * 2) + padding
    const y = height - padding - ((r - min) / range) * (height - padding * 2)
    return [x, y]
  })

  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 32 }}>
      <path d={pathData} fill="none" stroke={v3.brand} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2} fill={v3.brand} />
      ))}
    </svg>
  )
}
