'use client'

// -----------------------------------------------------------------------------
// /audit — Immutable Audit Log
// -----------------------------------------------------------------------------
// Authenticated page. Query audit_events for current user. Filter by action,
// date range, resource type. Table view: timestamp / action / resource / IP.
// Export CSV. Bilingual with AppHeader.
// Time-ordered, 50 per page, color-coded by severity.
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { v3, size } from '@/lib/brand'
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

const actionColorMap: Record<string, { bg: string; fg: string }> = {
  lease_signed: { bg: v3.successSoft, fg: v3.success },
  lease_reviewed: { bg: v3.infoSoft, fg: v3.info },
  screening_completed: { bg: v3.successSoft, fg: v3.success },
  deep_check: { bg: v3.infoSoft, fg: v3.info },
  report_viewed: { bg: v3.infoSoft, fg: v3.info },
  report_shared: { bg: v3.warningSoft, fg: v3.warning },
  access_revoked: { bg: v3.dangerSoft, fg: v3.danger },
  login: { bg: v3.successSoft, fg: v3.success },
  logout: { bg: v3.divider, fg: v3.textMuted },
  password_changed: { bg: v3.warningSoft, fg: v3.warning },
  default: { bg: v3.divider, fg: v3.textMuted },
}

export default function AuditPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  })
  const [page, setPage] = useState(0)
  const perPage = 50

  // Load audit events
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
        .gte('created_at', dateRange.start + 'T00:00:00Z')
        .lte('created_at', dateRange.end + 'T23:59:59Z')
        .order('created_at', { ascending: false })

      // Apply action filter
      if (filter !== 'all') {
        const actions = filterMap[filter]
        query = query.in('action', actions)
      }

      const { data } = await query

      if (data) {
        // Client-side search filter
        let filtered = data as AuditEvent[]
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          filtered = filtered.filter(
            (e) =>
              e.action.toLowerCase().includes(q) ||
              e.resource_type.toLowerCase().includes(q) ||
              e.resource_id.toLowerCase().includes(q),
          )
        }
        setEvents(filtered)
      }
    } catch (e) {
      console.error('Error loading audit events:', e)
    }
    setLoading(false)
  }

  // Re-fetch on filter/search/date changes
  useEffect(() => {
    if (!user?.authId) return
    void loadAuditEvents()
    setPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId, filter, searchQuery, dateRange])

  // Export CSV
  const exportCSV = () => {
    const headers = [isZh ? '时间' : 'Timestamp', isZh ? '操作' : 'Action', isZh ? '资源类型' : 'Resource Type', isZh ? '资源ID' : 'Resource ID', 'IP', isZh ? '用户代理' : 'User Agent']
    const rows = events.map((e) => [
      new Date(e.created_at).toLocaleString(isZh ? 'zh-CN' : 'en-CA'),
      e.action,
      e.resource_type,
      e.resource_id,
      e.ip_address || '–',
      e.user_agent ? e.user_agent.slice(0, 50) + '…' : '–',
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `audit-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // Pagination
  const paginatedEvents = events.slice(page * perPage, (page + 1) * perPage)
  const totalPages = Math.ceil(events.length / perPage)

  if (authLoading || loading) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载…' : 'Loading…'}</div>
      </main>
    )
  }

  const getActionColor = (action: string) => actionColorMap[action] || actionColorMap.default

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader
        title={isZh ? '操作日志' : 'Activity Log'}
        titleZh="操作日志"
      />

      <main
        style={{
          maxWidth: size.content.default,
          margin: '0 auto',
          padding: '24px 16px',
        }}
      >
        {/* Filters & search */}
        <div
          style={{
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 14,
            padding: 18,
            marginBottom: 24,
          }}
        >
          {/* Search */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textSecondary, marginBottom: 8 }}>
              {isZh ? '搜索' : 'Search'}
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isZh ? '操作、资源类型或ID…' : 'Action, resource type, or ID…'}
              style={{
                width: '100%',
                padding: '11px 14px',
                border: `1px solid ${v3.border}`,
                borderRadius: size.radius.lg,
                fontSize: 13,
                color: '#0B1736',
                WebkitTextFillColor: '#0B1736',
                caretColor: '#0B1736',
                outline: 'none',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = v3.brand)}
              onBlur={(e) => (e.currentTarget.style.borderColor = v3.border)}
            />
          </div>

          {/* Filter chips */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textSecondary, marginBottom: 10 }}>
              {isZh ? '分类' : 'Filter'}
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['all', 'lease', 'screening', 'sharing', 'auth', 'billing'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: size.radius.pill,
                    border: `1px solid ${filter === f ? v3.brand : v3.border}`,
                    background: filter === f ? v3.brandSoft : v3.surface,
                    color: filter === f ? v3.brand : v3.textSecondary,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {f === 'all' ? isZh ? '全部' : 'All' : f}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textSecondary, marginBottom: 8 }}>
                {isZh ? '开始日期' : 'Start date'}
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  border: `1px solid ${v3.border}`,
                  borderRadius: size.radius.lg,
                  fontSize: 13,
                  color: '#0B1736',
                  WebkitTextFillColor: '#0B1736',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textSecondary, marginBottom: 8 }}>
                {isZh ? '结束日期' : 'End date'}
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  border: `1px solid ${v3.border}`,
                  borderRadius: size.radius.lg,
                  fontSize: 13,
                  color: '#0B1736',
                  WebkitTextFillColor: '#0B1736',
                }}
              />
            </div>
          </div>
        </div>

        {/* Export button */}
        <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={exportCSV}
            style={{
              padding: '10px 16px',
              background: v3.surfaceCard,
              color: v3.brand,
              border: `1px solid ${v3.border}`,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = v3.surfaceMuted)}
            onMouseLeave={(e) => (e.currentTarget.style.background = v3.surfaceCard)}
          >
            {isZh ? '⬇ 导出 CSV' : '⬇ Export CSV'}
          </button>
        </div>

        {/* Events table */}
        {paginatedEvents.length === 0 ? (
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 40,
              textAlign: 'center',
              color: v3.textMuted,
            }}
          >
            {isZh ? '此日期范围内没有审计事件' : 'No audit events in this date range'}
          </div>
        ) : (
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${v3.divider}`, background: v3.surfaceMuted }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: v3.textSecondary }}>
                      {isZh ? '时间' : 'Timestamp'}
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: v3.textSecondary }}>
                      {isZh ? '操作' : 'Action'}
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: v3.textSecondary }}>
                      {isZh ? '资源' : 'Resource'}
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: v3.textSecondary }}>
                      IP
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: v3.textSecondary }}>
                      {isZh ? '用户代理' : 'User Agent'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((event, idx) => {
                    const colors = getActionColor(event.action)
                    return (
                      <tr key={event.id} style={{ borderBottom: idx < paginatedEvents.length - 1 ? `1px solid ${v3.divider}` : 'none' }}>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: v3.textMuted, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {new Date(event.created_at).toLocaleString(isZh ? 'zh-CN' : 'en-CA')}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: size.radius.sm,
                              background: colors.bg,
                              color: colors.fg,
                              fontWeight: 600,
                              fontSize: 11,
                            }}
                          >
                            {event.action}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: v3.textSecondary }}>
                          {event.resource_type} · <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{event.resource_id.slice(0, 8)}…</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: v3.textMuted, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {event.ip_address ? event.ip_address.split('.').slice(0, 3).join('.') + '.x' : '–'}
                        </td>
                        <td style={{ padding: '12px 16px', color: v3.textMuted, fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {event.user_agent ? event.user_agent.slice(0, 40) + '…' : '–'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              style={{
                padding: '8px 12px',
                border: `1px solid ${v3.border}`,
                background: page === 0 ? v3.divider : v3.surfaceCard,
                color: page === 0 ? v3.textMuted : v3.textPrimary,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: page === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isZh ? '上一页' : 'Prev'}
            </button>
            <span style={{ fontSize: 12, color: v3.textSecondary }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page === totalPages - 1}
              style={{
                padding: '8px 12px',
                border: `1px solid ${v3.border}`,
                background: page === totalPages - 1 ? v3.divider : v3.surfaceCard,
                color: page === totalPages - 1 ? v3.textMuted : v3.textPrimary,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer',
              }}
            >
              {isZh ? '下一页' : 'Next'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
