'use client'
// Billing — Stripe plan, invoices, upgrade options

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import AppHeader from '@/components/AppHeader'

interface InvoiceRow {
  month: string
  amount: number
  status: 'paid' | 'pending'
  date: string
}

export default function BillingPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [plan, setPlan] = useState<string>('free')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function loadPlan() {
    const { data } = await supabase
      .from('landlords')
      .select('plan')
      .eq('id', user!.profileId)
      .single()

    setPlan((data as any)?.plan || 'free')
    setLoading(false)
  }

  async function openBillingPortal() {
    const response = await fetch('/api/stripe/portal', {
      method: 'POST',
    })
    const { url } = await response.json()
    if (url) window.location.href = url
  }

  const mockInvoices: InvoiceRow[] = [
    { month: 'April 2026', amount: 29, status: 'paid', date: '2026-04-01' },
    { month: 'March 2026', amount: 29, status: 'paid', date: '2026-03-01' },
    { month: 'February 2026', amount: 29, status: 'paid', date: '2026-02-01' },
  ]

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader
        title={isZh ? '账单' : 'Billing'}
        right={
          <button
            onClick={openBillingPortal}
            style={{
              padding: '8px 14px',
              background: v3.brand,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isZh ? '管理订阅' : 'Manage'}
          </button>
        }
      />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: '32px 24px' }}>
        {/* Current plan */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
            {isZh ? '当前计划' : 'Current plan'}
          </h2>

          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 24,
              maxWidth: 500,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, color: v3.textPrimary, textTransform: 'capitalize' }}>
              {plan === 'pro' ? (isZh ? '订阅版' : 'Pro') : (isZh ? '免费版' : 'Free')}
            </div>
            {plan === 'pro' && (
              <>
                <div style={{ fontSize: 14, color: v3.textMuted, marginBottom: 16 }}>
                  ${29}/mo · {isZh ? '下次账单：2026-05-01' : 'Next billing: 2026-05-01'}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: v3.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
                    {isZh ? '使用' : 'Usage'}
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {[
                      { label: isZh ? '筛查报告' : 'Screenings', used: 47, limit: 'unlimited' },
                      { label: isZh ? 'API 调用' : 'API calls', used: 1240, limit: '10k/mo' },
                      { label: isZh ? '分享链接' : 'Share links', used: 12, limit: 'unlimited' },
                    ].map((row, i) => (
                      <div key={i} style={{ fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: v3.textPrimary, fontWeight: 600 }}>{row.label}</span>
                          <span style={{ color: v3.textMuted }}>
                            {row.used} / {row.limit}
                          </span>
                        </div>
                        {typeof row.limit === 'string' && !row.limit.includes('unlimited') && (
                          <div
                            style={{
                              height: 4,
                              background: v3.divider,
                              borderRadius: 2,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                background: v3.success,
                                width: `${(row.used / 10000) * 100}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Upgrade options */}
        {plan === 'free' && (
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
              {isZh ? '升级' : 'Upgrade'}
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {[
                {
                  name: isZh ? '免费版' : 'Free',
                  price: '$0',
                  features: [
                    isZh ? '5 次/月筛查' : '5 screenings/mo',
                    isZh ? 'CanLII 查询' : 'CanLII lookup',
                    isZh ? '基础报告' : 'Basic reports',
                  ],
                },
                {
                  name: isZh ? '订阅版' : 'Pro',
                  price: '$29',
                  period: isZh ? '/月' : '/mo',
                  features: [
                    isZh ? '无限筛查' : 'Unlimited screenings',
                    isZh ? '优先 AI' : 'Priority AI',
                    isZh ? '深度背景查询' : 'Deep-check lookups',
                  ],
                  highlight: true,
                },
              ].map((tier, i) => (
                <div
                  key={i}
                  style={{
                    background: tier.highlight ? 'linear-gradient(135deg, #E8F0E8 0%, #F2EEE5 100%)' : v3.surfaceCard,
                    border: `1px solid ${tier.highlight ? v3.brand : v3.border}`,
                    borderRadius: 14,
                    padding: 24,
                    position: 'relative',
                  }}
                >
                  {tier.highlight && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        background: v3.brand,
                        color: '#fff',
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        borderBottomLeftRadius: 12,
                        borderTopRightRadius: 12,
                      }}
                    >
                      {isZh ? '推荐' : 'Recommended'}
                    </div>
                  )}

                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: v3.textPrimary }}>
                    {tier.name}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 16, color: tier.highlight ? v3.brand : v3.textPrimary }}>
                    {tier.price}
                    {tier.period && <span style={{ fontSize: 14, fontWeight: 600 }}>{tier.period}</span>}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    {tier.features.map((f, j) => (
                      <div
                        key={j}
                        style={{
                          fontSize: 13,
                          color: v3.textSecondary,
                          marginBottom: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span style={{ color: v3.success }}>✓</span> {f}
                      </div>
                    ))}
                  </div>

                  {i === 1 && (
                    <button
                      onClick={async () => {
                        const response = await fetch('/api/stripe/checkout', {
                          method: 'POST',
                        })
                        const { url } = await response.json()
                        if (url) window.location.href = url
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isZh ? '升级到 Pro' : 'Upgrade to Pro'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invoice history */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
            {isZh ? '发票历史' : 'Invoice history'}
          </h2>

          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${v3.border}` }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                    {isZh ? '日期' : 'Date'}
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                    {isZh ? '金额' : 'Amount'}
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                    {isZh ? '状态' : 'Status'}
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }} />
                </tr>
              </thead>
              <tbody>
                {mockInvoices.map((inv, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${v3.divider}` }}>
                    <td style={{ padding: '12px', fontSize: 13, color: v3.textPrimary }}>
                      {inv.month}
                    </td>
                    <td style={{ padding: '12px', fontSize: 13, color: v3.textPrimary }}>
                      ${inv.amount}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: inv.status === 'paid' ? v3.success : v3.warning,
                          background: inv.status === 'paid' ? v3.successSoft : v3.warningSoft,
                          padding: '4px 8px',
                          borderRadius: 4,
                        }}
                      >
                        {inv.status === 'paid' ? (isZh ? '已支付' : 'Paid') : (isZh ? '待支付' : 'Pending')}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        style={{
                          color: v3.brand,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {isZh ? '下载' : 'Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cancel button */}
        {plan === 'pro' && (
          <div style={{ marginTop: 48 }}>
            <button
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: `1px solid ${v3.danger}`,
                color: v3.danger,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isZh ? '取消计划' : 'Cancel plan'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
