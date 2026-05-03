'use client'

import { useEffect, useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'
import AuditRow from '@/components/v4/AuditRow'

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
      <PageShell>
        <div style={{ display: 'grid', placeItems: 'center', padding: 64, color: v3.textMuted, fontSize: 14 }}>
          {isZh ? '加载中…' : 'Loading…'}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <SecHead
        eyebrow={isZh ? '审计日志 · 不可变 · 90 天窗口' : 'Audit log · immutable · 90-day window'}
        title={isZh ? '所有活动' : 'All activity'}
        sub={isZh ? '每个授权的查看、共享、签署和下载都被记录。' : 'Every authorized view, share, sign and download is logged.'}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: '#fff',
                color: v3.textPrimary,
                border: `1px solid ${v3.borderStrong}`,
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isZh ? '筛选' : 'Filter'}
            </button>
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: '#fff',
                color: v3.textPrimary,
                border: `1px solid ${v3.borderStrong}`,
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isZh ? '导出 CSV' : 'Export CSV'}
            </button>
          </div>
        }
      />

      <div
        style={{
          background: '#fff',
          border: `1px solid ${v3.border}`,
          borderRadius: 14,
          padding: '4px 22px 18px',
          boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 160px 1fr 110px 110px',
            padding: '12px 0',
            borderBottom: `1px solid ${v3.border}`,
            fontSize: 10,
            color: v3.textMuted,
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
          <AuditRow
            key={event.id}
            when={new Date(event.created_at).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA')}
            actor={event.metadata?.actor_name || 'User'}
            action={event.action}
            target={event.resource_id?.slice(0, 8) || ''}
            ip={event.ip_address || undefined}
          />
        ))}
        {events.length === 0 && (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: v3.textMuted,
              fontSize: 13,
            }}
          >
            {isZh ? '没有审计事件。' : 'No audit events.'}
          </div>
        )}
      </div>
    </PageShell>
  )
}
