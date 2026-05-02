'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import AppHeader from '@/components/AppHeader'

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

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  if (user && user.role !== 'agent') {
    const roleDisplay = user.role === 'tenant' ? (isZh ? '租客' : 'Tenant') : (isZh ? '房东' : 'Landlord')
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
        <AppHeader title="Stayloop" titleZh="Stayloop" />
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
      </main>
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
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader
        title={isZh ? '客户文件夹' : 'Client folders'}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder={isZh ? '搜索客户…' : 'Search clients…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: 240,
                padding: '8px 12px',
                border: `1px solid ${v3.border}`,
                borderRadius: 8,
                fontSize: 13,
                color: v3.textPrimary,
              }}
            />
            <button style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + {isZh ? '添加客户' : 'Add client'}
            </button>
          </div>
        }
      />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: '32px 24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${v3.border}`, marginBottom: 24 }}>
          {[
            { id: 'all', label: isZh ? '全部' : 'All', count: 12 },
            { id: 'tenant', label: isZh ? '租客客户' : 'Tenant clients', count: 9 },
            { id: 'landlord', label: isZh ? '房东客户' : 'Landlord clients', count: 3 },
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
                gap: 6,
              }}
            >
              {t.label}
              {t.count != null && (
                <span style={{ padding: '2px 8px', borderRadius: 3, background: v3.divider, color: v3.textMuted, fontSize: 11, fontWeight: 600 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {filtered.map((c, i) => (
            <div key={i} style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: v3.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>
                  {c.n.split(' ').map(w => w[0]).join('').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, color: v3.textPrimary, fontSize: 13 }}>{c.n}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 3, background: getToneBackground(c.role === 'Tenant' ? 'info' : 'pri'), color: getToneColor(c.role === 'Tenant' ? 'info' : 'pri'), fontSize: 10, fontWeight: 600 }}>
                      {c.role}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: v3.textMuted }}>{c.rent} · {c.loc}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 14, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: v3.textMuted }}>Status</span>
                  <span style={{ padding: '2px 8px', borderRadius: 3, background: getToneBackground(c.tone), color: getToneColor(c.tone), fontWeight: 600, fontSize: 11 }}>
                    {c.status}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: v3.textMuted }}>Documents</span>
                  <span style={{ fontFamily: 'monospace', color: v3.textPrimary, fontWeight: 600 }}>{c.docs}</span>
                </div>
                {c.readiness > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                      <span style={{ color: v3.textMuted }}>Readiness</span>
                      <span style={{ color: getToneColor(c.readiness >= 90 ? 'ok' : c.readiness >= 80 ? 'gold' : 'warn'), fontWeight: 600 }}>
                        {c.readiness}%
                      </span>
                    </div>
                    <div style={{ height: 6, background: v3.divider, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${c.readiness}%`, height: '100%', background: getToneColor(c.readiness >= 90 ? 'ok' : c.readiness >= 80 ? 'gold' : 'warn') }} />
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={{ flex: 1, padding: '8px 12px', background: v3.surfaceCard, color: v3.textPrimary, border: `1px solid ${v3.borderStrong}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {isZh ? '打开文件夹' : 'Open folder'}
                </button>
                <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  {isZh ? '构建包' : 'Build package'} →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
