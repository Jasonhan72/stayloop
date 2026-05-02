'use client'
// /disputes — list of the user's disputes (V3 section 17)
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'

interface Dispute {
  id: string
  case_number: string
  title: string
  category: string
  status: string
  amount_disputed: number | null
  opened_at: string
  deadline_at: string | null
}

export default function DisputesListPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ category: 'deposit_return', title: '', tenant_claim: '', amount: '' })

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('disputes')
      .select('id, case_number, title, category, status, amount_disputed, opened_at, deadline_at')
      .order('opened_at', { ascending: false })
    setDisputes((data as Dispute[]) || [])
    setLoading(false)
  }

  async function createDispute() {
    if (!user || !form.title) return
    const caseNum = `DSP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 14)
    await supabase.from('disputes').insert({
      case_number: caseNum,
      tenant_user_id: user?.authId,
      category: form.category,
      title: form.title,
      tenant_claim: form.tenant_claim,
      amount_disputed: form.amount ? Number(form.amount) : null,
      status: 'open',
      deadline_at: deadline.toISOString(),
    })
    setShowNew(false)
    setForm({ category: 'deposit_return', title: '', tenant_claim: '', amount: '' })
    void load()
  }

  if (authLoading || loading) {
    return (
      <PageShell role="tenant">
        <div style={{ color: v3.textMuted, fontSize: 14, display: 'grid', placeItems: 'center', minHeight: 400 }}>
          {isZh ? '加载…' : 'Loading…'}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell role="tenant">

      <div style={{ maxWidth: size.content.default, margin: '0 auto', padding: 24 }}>
        {disputes.length === 0 ? (
          <div style={{ background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
              {isZh ? '没有进行中的纠纷' : 'No open disputes'}
            </h1>
            <p style={{ color: v3.textMuted, fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
              {isZh
                ? 'Mediator agent 调解 14 天，超时升级到 LTB。'
                : 'Mediator AI runs a 14-day window before LTB escalation. Open one if there\u2019s an active conflict.'}
            </p>
            <button
              onClick={() => setShowNew(true)}
              style={{ padding: '12px 22px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              + {isZh ? '新建纠纷' : 'New dispute'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {disputes.map((d) => {
              const daysLeft = d.deadline_at
                ? Math.max(0, Math.ceil((new Date(d.deadline_at).getTime() - Date.now()) / 86400000))
                : null
              return (
                <Link
                  key={d.id}
                  href={`/disputes/${d.id}`}
                  style={{ display: 'block', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16, textDecoration: 'none', color: v3.textPrimary }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{d.title}</span>
                    <span style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>{d.case_number}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: v3.textMuted, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: d.status === 'resolved' ? v3.brandStrong : v3.warning, background: d.status === 'resolved' ? v3.brandSoft : v3.warningSoft, padding: '3px 9px', borderRadius: 999 }}>
                      {d.status}
                    </span>
                    <span>{d.category.replace('_', ' ')}</span>
                    {d.amount_disputed && <span>${d.amount_disputed.toLocaleString()}</span>}
                    {daysLeft != null && d.status !== 'resolved' && (
                      <span style={{ marginLeft: 'auto', fontWeight: 600, color: daysLeft <= 3 ? v3.danger : v3.textSecondary }}>
                        {isZh ? `还有 ${daysLeft} 天` : `${daysLeft} days left`}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: v3.surface, borderRadius: 16, padding: 20, maxWidth: 460, width: '100%' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>{isZh ? '新建纠纷' : 'Open a new dispute'}</h2>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {isZh ? '类别' : 'Category'}
              </span>
              <select
                value={form.category}
                onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13 }}
              >
                <option value="deposit_return">{isZh ? '押金返还' : 'Deposit return'}</option>
                <option value="repair">{isZh ? '维修' : 'Repair'}</option>
                <option value="noise">{isZh ? '噪音' : 'Noise'}</option>
                <option value="other">{isZh ? '其他' : 'Other'}</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {isZh ? '标题' : 'Title'}
              </span>
              <input
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                placeholder={isZh ? '简单描述纠纷' : 'Brief description'}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {isZh ? '你的主张' : 'Your claim'}
              </span>
              <textarea
                value={form.tenant_claim}
                onChange={(e) => setForm((s) => ({ ...s, tenant_claim: e.target.value }))}
                rows={4}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {isZh ? '争议金额 (CAD, 选填)' : 'Amount disputed (CAD, optional)'}
              </span>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: 12, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button onClick={createDispute} style={{ flex: 1, padding: 12, background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {isZh ? '提交' : 'Open dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
