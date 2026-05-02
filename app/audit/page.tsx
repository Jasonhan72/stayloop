'use client'

import { useEffect, useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import AppHeader from '@/components/AppHeader'

interface AuditEvent {
  id: string
  created_at: string
  action: string
  resource_type: string
  resource_id: string
  actor_id: string
  ip_address?: string
  user_agent?: string
  metadata?: Record<string, any>
}

type FilterType = 'all' | 'lease' | 'screening' | 'sharing' | 'auth' | 'billing'

const filterMap: Record<FilterType, string[]> = {
  all: [],
  lease: ['lease_signed', 'lease_reviewed', 'lease_created'],
  screening: ['screening_created', 'screening_completed', 'deep_check'],
  sharing: ['report_shared', 'report_viewed', 'access_revoked'],
  auth: ['login', 'logout', 'password_changed', 'session_created'],
  billing: ['subscription_upgraded', 'subscription_cancelled', 'invoice_paid'],
}

export default function AuditPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')

  useEffect(() => {
    if (!user) return
    void loadAuditEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId])

  async function loadAuditEvents() {
    if (!user) return
    setLoading(true)
    try {
      let query = supabase
        .from('audit_events')
        .select('*')
        .eq('actor_id', user.authId)
        .order('created_at', { ascending: false })
        .limit(200)

      if (filter !== 'all') {
        const actions = filterMap[filter]
        query = query.in('action', actions)
      }

      const { data } = await query
      if (data) {
        setEvents(data as AuditEvent[])
      }
    } catch (e) {
      console.error('Error loading audit events:', e)
    }
    setLoading(false)
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F2EEE5', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F2EEE5' }}>
      <AppHeader title="Activity log" titleZh="操作日志" />

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid #D8D2C2`, padding: '32px 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: '#71717A',
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {isZh ? '审计日志 · 不可变 · 90 天窗口' : 'Audit log · immutable · 90-day window'}
            </div>
            <h1
              style={{
                fontFamily: 'var(--f-serif)',
                fontSize: 28,
                fontWeight: 600,
                color: '#171717',
                margin: '0 0 6px',
                letterSpacing: '-0.02em',
              }}
            >
              {isZh ? '所有活动' : 'All activity'}
            </h1>
            <p style={{ fontSize: 13, color: '#71717A', margin: 0 }}>
              {isZh ? '每个授权的查看、共享、签署和下载都被记录。' : 'Every authorized view, share, sign and download is logged.'}
            </p>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{
                background: '#FFFFFF',
                color: '#171717',
                border: '1px solid #C5BDAA',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 18px',
                cursor: 'pointer',
              }}
            >
              {isZh ? '筛选' : 'Filter'}
            </button>
            <button
              style={{
                background: '#FFFFFF',
                color: '#171717',
                border: '1px solid #C5BDAA',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 18px',
                cursor: 'pointer',
              }}
            >
              {isZh ? '导出 CSV' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            background: '#fff',
            border: `1px solid #D8D2C2`,
            borderRadius: 8,
            padding: '4px 22px 18px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 160px 1fr 110px 110px',
              padding: '12px 0',
              borderBottom: `1px solid #D8D2C2`,
              fontSize: 10,
              color: '#71717A',
              fontFamily: 'JetBrains Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}
          >
            <span>{isZh ? '时间' : 'Time'}</span>
            <span>{isZh ? '行为人' : 'Actor'}</span>
            <span>{isZh ? '动作' : 'Action'}</span>
            <span>IP</span>
            <span>Hash</span>
          </div>
          {events.map((event, i) => (
            <div
              key={event.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 160px 1fr 110px 110px',
                padding: '12px 0',
                borderTop: i ? `1px dashed #D8D2C2` : 'none',
                fontSize: 12,
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#A1A1AA',
                }}
              >
                {new Date(event.created_at).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA')}
              </span>
              <span style={{ color: '#171717', fontWeight: 600 }}>
                {event.metadata?.actor_name || 'User'}
              </span>
              <span style={{ color: '#3F3F46' }}>
                {event.action} <b style={{ color: '#171717' }}>{event.resource_id?.slice(0, 8)}</b>
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#71717A',
                }}
              >
                {event.ip_address || '—'}
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#71717A',
                }}
              >
                {event.metadata?.hash_prefix || '—'}
              </span>
            </div>
          ))}
          {events.length === 0 && (
            <div
              style={{
                padding: '24px 0',
                textAlign: 'center',
                color: '#71717A',
                fontSize: 13,
              }}
            >
              {isZh ? '没有审计事件。' : 'No audit events.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
