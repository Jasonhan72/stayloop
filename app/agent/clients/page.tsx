'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import PageShell from '@/components/v4/PageShell'

interface Client {
  n: string
  role: 'Tenant' | 'Landlord'
  rent: string
  loc: string
  status: string
  tone: string
  readiness: number
  docs: string
}

export default function AgentClientsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'tenant' | 'landlord' | 'archived'>('all')

  if (user && user.role !== 'agent') {
    const roleDisplay = user.role === 'tenant' ? (isZh ? '租客' : 'Tenant') : (isZh ? '房东' : 'Landlord')
    return (
      <PageShell role="agent">
        <div style={{ maxWidth: 480, margin: '64px auto', textAlign: 'center', background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 16, padding: 40 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            {isZh ? '此页面仅供经纪使用' : 'Agent access only'}
          </h1>
          <p style={{ color: v3.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
            {isZh
              ? `你的账户身份是${roleDisplay}，看不到这个页面。如果身份错了，去账户设置里改。`
              : `Your account is ${roleDisplay}. If that's wrong, update it in Account settings.`}
          </p>
          <button
            onClick={() => window.location.href = '/'}
            style={{ display: 'inline-flex', padding: '10px 20px', background: v3.brand, color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: 'none', cursor: 'pointer' }}
          >
            {isZh ? '返回首页' : 'Go home'} →
          </button>
        </div>
      </PageShell>
    )
  }

  const clients: Client[] = [
    { n: 'Jamie Liu', role: 'Tenant', rent: '$2,000–2,600', loc: 'Yonge & Eg', status: 'Package sent', tone: 'gold', readiness: 88, docs: '8/9' },
    { n: 'R. Patel', role: 'Tenant', rent: '$3,200–3,800', loc: 'Liberty Village', status: 'Awaiting consent', tone: 'warn', readiness: 64, docs: '5/9' },
    { n: 'Mei Chen', role: 'Tenant', rent: '$2,800–3,200', loc: 'Harbourfront', status: 'Approved', tone: 'ok', readiness: 91, docs: '9/9' },
    { n: 'D. Robinson', role: 'Tenant', rent: '$2,500–2,800', loc: 'Distillery', status: 'Lease signed', tone: 'pri', readiness: 96, docs: '10/10' },
    { n: 'K. Tanaka', role: 'Tenant', rent: '$1,800–2,200', loc: 'Bloor West', status: 'Building Passport', tone: 'info', readiness: 42, docs: '4/9' },
    { n: 'Hudson Living', role: 'Landlord', rent: '8 properties', loc: 'Toronto · GTA', status: 'Onboarding', tone: 'info', readiness: 0, docs: '—' },
  ]

  const getToneColor = (tone: string) => {
    switch (tone) {
      case 'ok': return v3.success
      case 'gold': return v3.brandBright
      case 'warn': return v3.warning
      case 'info': return v3.info
      case 'pri': return v3.brand
      default: return v3.textMuted
    }
  }

  const getToneBackground = (tone: string) => {
    switch (tone) {
      case 'ok': return v3.successSoft
      case 'gold': return v3.brandSoft
      case 'warn': return v3.warningSoft
      case 'info': return v3.infoSoft
      case 'pri': return v3.brandSoft
      default: return v3.divider
    }
  }

  const filtered = clients.filter((c) => {
    if (filter === 'tenant' && c.role !== 'Tenant') return false
    if (filter === 'landlord' && c.role !== 'Landlord') return false
    if (filter === 'archived') return false
    return c.n.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <PageShell role="agent">
      {/* Eyebrow + Title + Buttons */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 10 }}>
          {isZh ? '客户 · 12' : 'Clients · 12'}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--f-serif)', fontSize: 24, fontWeight: 600, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
            {isZh ? '客户文件夹' : 'Client folders'}
          </h2>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder={isZh ? '搜索客户…' : 'Search clients…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 240, padding: '11px 14px', border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 13, color: v3.textPrimary, fontFamily: 'var(--f-sans)', background: '#fff', outline: 'none' }}
            />
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#6EE7B7 0%,#34D399 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset', letterSpacing: '-0.01em' }}>
              + {isZh ? '添加客户' : 'Add client'}
            </button>
          </div>
        </div>
        <hr style={{ height: 1, background: 'linear-gradient(90deg, var(--pri), var(--gold-line, rgba(16,185,129,0.32)) 60%, transparent)', border: 0, marginTop: 14 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${v3.border}`, marginBottom: 20 }}>
        {[
          { id: 'all', label: isZh ? '全部' : 'All', count: 12 },
          { id: 'tenant', label: isZh ? '租客客户' : 'Tenant clients', count: 9, tone: 'ai' },
          { id: 'landlord', label: isZh ? '房东客户' : 'Landlord clients', count: 3, tone: 'pri' },
          { id: 'archived', label: isZh ? '已归档' : 'Archived', count: 4 },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id as any)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: filter === t.id ? 600 : 500,
              color: filter === t.id ? v3.textPrimary : v3.textMuted,
              borderBottom: filter === t.id ? `2px solid ${v3.brand}` : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{ padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${t.tone === 'ai' ? '#D7C5FA' : t.tone === 'pri' ? 'rgba(4,120,87,0.32)' : '#D8D2C2'}`, color: t.tone === 'ai' ? v3.trust : t.tone === 'pri' ? v3.brand : v3.textSecondary, background: t.tone === 'ai' ? '#F3E8FF' : t.tone === 'pri' ? 'rgba(4,120,87,0.10)' : v3.divider }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {filtered.map((c, i) => (
          <div key={i} style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: v3.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>
                {c.n.split(' ').map(w => w[0]).join('').toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: v3.textPrimary, fontSize: 14 }}>{c.n}</span>
                  <span style={{ padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${c.role === 'Tenant' ? '#BFDBFE' : 'rgba(4,120,87,0.32)'}`, color: c.role === 'Tenant' ? v3.info : v3.brand, background: c.role === 'Tenant' ? '#DBEAFE' : 'rgba(4,120,87,0.10)' }}>
                    {c.role}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>{c.rent} · {c.loc}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 14, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: v3.textMuted }}>Status</span>
                <span style={{ padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${getToneBackground(c.tone).replace(/rgba\(([^)]+)\)/, 'transparent').match(/^\w+/) ? 'transparent' : 'rgb(209,209,210)'}`, color: getToneColor(c.tone), background: getToneBackground(c.tone) }}>
                  {c.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: v3.textMuted }}>Documents</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: v3.textPrimary, fontWeight: 600 }}>{c.docs}</span>
              </div>
              {c.readiness > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: v3.textSecondary, marginBottom: 5 }}>
                    <span>Readiness</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: getToneColor(c.readiness >= 90 ? 'ok' : c.readiness >= 80 ? 'gold' : 'warn'), fontWeight: 600 }}>
                      {c.readiness}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: v3.divider, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${c.readiness}%`, height: '100%', background: getToneColor(c.readiness >= 90 ? 'ok' : c.readiness >= 80 ? 'gold' : 'warn'), borderRadius: 3 }} />
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button style={{ flex: 1, padding: '10px 18px', background: v3.surfaceCard, color: v3.textPrimary, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {isZh ? '打开文件夹' : 'Open folder'}
              </button>
              <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                {isZh ? '构建包' : 'Build package'} →
              </button>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
