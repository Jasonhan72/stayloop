'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3 } from '@/lib/brand'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

export default function BillingPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [plan, setPlan] = useState<string>('free')
  const [loading, setLoading] = useState(true)
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

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

  async function startCheckout(planSlug: string) {
    setUpgradingPlan(planSlug)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('not signed in')
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ plan_slug: planSlug }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'checkout failed')
      window.location.href = data.url
    } catch (err: any) {
      alert(`${isZh ? '结账失败' : 'Checkout error'}: ${err?.message || 'unknown'}`)
      setUpgradingPlan(null)
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
      alert(`${isZh ? '账单门户错误' : 'Billing portal error'}: ${err?.message || 'unknown'}`)
      setPortalLoading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F2EEE5', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <PageShell>
      <SecHead
        eyebrow={isZh ? '账单 · Stripe' : 'Billing · Stripe'}
        title={isZh ? '计划、用量和发票' : 'Plan, usage & invoices'}
        right={
          <button
            onClick={openBillingPortal}
            disabled={portalLoading}
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
              cursor: portalLoading ? 'not-allowed' : 'pointer',
              opacity: portalLoading ? 0.6 : 1,
            }}
          >
            {isZh ? '在 Stripe 中管理 →' : 'Manage in Stripe →'}
          </button>
        }
      />

      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
          <div style={{ display: 'grid', gap: 18 }}>
            {/* Current plan card */}
            <div
              style={{
                background: '#fff',
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 24,
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr',
                gap: 18,
                alignItems: 'center',
                boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10.5,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: v3.textMuted,
                    fontWeight: 700,
                  }}
                >
                  {isZh ? '当前计划' : 'Current plan'}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--f-serif)',
                    fontSize: 24,
                    fontWeight: 600,
                    color: v3.textPrimary,
                    marginTop: 6,
                  }}
                >
                  Landlord Plus · <span style={{ color: v3.brandBright }}>$15 / mo</span>
                </div>
                <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 4 }}>
                  {isZh ? '续订于 2026 年 9 月 18 日' : 'Renews Sep 18, 2026'} · Visa •• 4242
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
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
                    {isZh ? '更改计划' : 'Change plan'}
                  </button>
                  <button
                    style={{
                      background: 'none',
                      color: v3.brand,
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isZh ? '更新支付 →' : 'Update payment →'}
                  </button>
                </div>
              </div>
              <div
                style={{
                  padding: 16,
                  background: v3.surfaceMuted,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10.5,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: v3.textMuted,
                    fontWeight: 700,
                    marginBottom: 10,
                  }}
                >
                  Plus · {isZh ? '本月' : 'this month'}
                </div>
                {[
                  [isZh ? 'AI 报告' : 'AI reports', '38 / 40', 95, v3.brandBright],
                  [isZh ? '验证附加选项' : 'Verified add-ons', '1 / 5', 20, v3.trust],
                  [isZh ? '电子签名信封' : 'E-sign envelopes', '2 / 4', 50, v3.brand],
                ].map((r, i) => (
                  <div key={i} style={{ marginTop: i > 0 ? 10 : 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 5,
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: v3.textPrimary }}>{r[0]}</span>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          color: r[3] as string,
                          fontWeight: 600,
                        }}
                      >
                        {r[2]}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: v3.borderStrong,
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${r[2]}%`,
                          background: r[3] as string,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Invoices card */}
            <div
              style={{
                background: '#fff',
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 0,
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)',
              }}
            >
              <div
                style={{
                  padding: '14px 22px',
                  borderBottom: `1px solid ${v3.border}`,
                  display: 'flex',
                  alignItems: 'baseline',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontFamily: 'var(--f-serif)',
                    fontSize: 17,
                    fontWeight: 600,
                    color: v3.textPrimary,
                  }}
                >
                  {isZh ? '发票' : 'Invoices'}
                </h3>
                <span style={{ fontSize: 12, color: v3.textMuted, marginLeft: 10 }}>
                  {isZh ? '最近 6 个月' : 'Last 6 months'}
                </span>
              </div>
              {[
                ['Aug 2026', isZh ? 'Plus · 月度 + 1 个验证附加' : 'Plus · monthly + 1 verified add-on', '$34.00', 'Paid', 'ok'],
                ['Jul 2026', isZh ? 'Plus · 月度' : 'Plus · monthly', '$15.00', 'Paid', 'ok'],
                ['Jun 2026', isZh ? 'Plus · 月度 + 电子签名超额' : 'Plus · monthly + e-sign overage', '$22.00', 'Paid', 'ok'],
                ['May 2026', isZh ? 'Lite · 升级按比例分配' : 'Lite · upgrade prorate', '$11.40', 'Paid', 'ok'],
                ['Apr 2026', isZh ? 'Lite · 月度' : 'Lite · monthly', '$7.00', 'Paid', 'ok'],
                ['Mar 2026', isZh ? 'Lite · 月度' : 'Lite · monthly', '$7.00', 'Refunded', 'warn'],
              ].map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr 100px 90px 80px',
                    padding: '12px 22px',
                    borderTop: `1px dashed ${v3.border}`,
                    fontSize: 13,
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      color: v3.textMuted,
                    }}
                  >
                    {r[0]}
                  </span>
                  <span style={{ color: v3.textPrimary }}>{r[1]}</span>
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      color: v3.textPrimary,
                      fontWeight: 600,
                    }}
                  >
                    {r[2]}
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 9px',
                      fontFamily: 'var(--f-sans)',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 999,
                      border: `1px solid ${r[4] === 'ok' ? '#BBF7D0' : '#FDE68A'}`,
                      color: r[4] === 'ok' ? '#16A34A' : '#D97706',
                      background: r[4] === 'ok' ? '#DCFCE7' : '#FEF3C7',
                    }}
                  >
                    {r[3]}
                  </div>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: v3.brand,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      justifySelf: 'end',
                    }}
                  >
                    PDF →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Add-ons */}
            <div
              style={{
                background: '#fff',
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 18,
                boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)',
              }}
            >
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                {isZh ? '附加选项' : 'Add-ons'}
              </div>
              {[
                [isZh ? 'AI 筛选报告 Plus' : 'AI Screening Report Plus', '$9.99 / report', isZh ? '按需付费' : 'Pay-as-you-go'],
                [isZh ? '验证筛选基础' : 'Verified Screening Basic', '$19', isZh ? '身份验证' : 'Identity verification'],
                [isZh ? '验证筛选 Plus' : 'Verified Screening Plus', '$29', isZh ? '+ 收入验证' : '+ Income verification'],
                [isZh ? '验证筛选最大' : 'Verified Screening Max', '$39', isZh ? '+ 信用检查（同意）' : '+ Credit check (consent)'],
              ].map((a, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 0',
                    borderTop: i ? `1px dashed ${v3.border}` : 'none',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>
                      {a[0]}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textMuted }}>{a[2]}</div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 13,
                      color: v3.brandBright,
                      fontWeight: 600,
                    }}
                  >
                    {a[1]}
                  </span>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: v3.brand,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>

            {/* AI cost insights */}
            <div
              style={{
                background: 'linear-gradient(180deg, #F3E8FF 0%, #fff 100%)',
                border: `1px solid #D7C5FA`,
                borderRadius: 14,
                padding: 18,
                boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: v3.trust,
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  ✦
                </span>
                <span
                  style={{
                    fontFamily: 'var(--f-sans)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: v3.textPrimary,
                  }}
                >
                  {isZh ? 'AI：成本见解' : 'AI: cost insights'}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[
                  isZh
                    ? '你即将达到 Plus 上限（38/40）。Pro 以每月 $29 的价格解锁 120 + 2 个席位 — 如果增长保持不变可以节省约 $36。'
                    : "You're close to Plus cap (38/40). Pro at $29 unlocks 120 + 2 seats — saves ~$36 if growth holds.",
                  isZh
                    ? '上个月的 4 份报告没有不一致 — 尝试为高信任申请人使用 Lite 验证附加。'
                    : '4 reports last month had no inconsistencies — try Lite verified add-on for high-trust applicants.',
                ].map((body, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 13,
                      color: v3.textPrimary,
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      style={{
                        color: v3.trust,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      ›
                    </span>
                    <span>{body}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
