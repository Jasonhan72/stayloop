'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { Application, Listing, Plan } from '@/types'

export default function Dashboard() {
  const { landlord, loading: authLoading } = useLandlord()
  const [applications, setApplications] = useState<Application[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [plan, setPlan] = useState<Plan>('free')
  const [loading, setLoading] = useState(true)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutBanner, setCheckoutBanner] = useState<null | 'pending' | 'success' | 'cancel'>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
      const qp = new URL(window.location.href).searchParams
      if (qp.get('upgrade') === '1') setShowUpgrade(true)
      const checkout = qp.get('checkout')
      if (checkout === 'success') setCheckoutBanner('pending')
      if (checkout === 'cancel') setCheckoutBanner('cancel')
    }
    if (landlord) fetchAll()
  }, [landlord])

  // Poll landlords.plan after returning from Stripe Checkout
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
        .eq('id', landlord.landlordId)
        .maybeSingle()
      if (cancelled) return
      if (data?.plan && data.plan !== plan) {
        setPlan(data.plan as Plan)
        return
      }
      if (tries >= 20) return
      setTimeout(tick, 1000)
    }
    tick()
    return () => {
      cancelled = true
    }
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
    setLoading(true)
    const [appsRes, listingsRes, planRes] = await Promise.all([
      supabase.from('applications').select('*, listing:listings(*)').order('created_at', { ascending: false }),
      supabase.from('listings').select('*').order('created_at', { ascending: false }),
      supabase.from('landlords').select('plan').eq('id', landlord!.landlordId).maybeSingle(),
    ])
    if (appsRes.data) setApplications(appsRes.data as Application[])
    if (listingsRes.data) setListings(listingsRes.data as Listing[])
    if (planRes.data?.plan) setPlan(planRes.data.plan as Plan)
    setLoading(false)
  }

  async function copyLink(slug: string) {
    const url = `${origin}/apply/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 1500)
  }

  const stats = {
    total: applications.length,
    approved: applications.filter((a) => a.status === 'approved').length,
    pending: applications.filter((a) => a.status === 'new' || a.status === 'reviewing').length,
    flags: applications.filter((a) => (a.ltb_records_found || a.court_search_count || 0) > 0).length,
  }

  const scoreColor = (s?: number | null) => {
    if (!s) return { bg: 'bg-line-divider', fg: 'text-body-3' }
    if (s >= 85) return { bg: 'bg-success/15', fg: 'text-success' }
    if (s >= 70) return { bg: 'bg-brand/15', fg: 'text-brand' }
    if (s >= 50) return { bg: 'bg-warning/15', fg: 'text-warning' }
    return { bg: 'bg-danger/15', fg: 'text-danger' }
  }

  if (authLoading || !landlord) {
    return (
      <>
        <Header />
        <main className="bg-surface">
          <div className="flex min-h-[60vh] items-center justify-center">
            <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-10 sm:px-7 lg:px-12">
          {/* Heading */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
                LANDLORD · OVERVIEW
              </div>
              <h1 className="mt-2 text-[32px] font-bold tracking-tight sm:text-[40px]">
                工作台 · {landlord.email.split('@')[0]}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  'rounded-md px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase ' +
                  (plan === 'free'
                    ? 'bg-line-divider text-body-2'
                    : 'bg-brand/15 text-brand')
                }
              >
                {plan}
              </span>
              {plan === 'free' && (
                <button onClick={() => setShowUpgrade(true)} className="sl-btn-primary !py-[10px] !px-4 !text-[13.5px]">
                  升级到 Pro
                </button>
              )}
              {(plan === 'pro' || plan === 'enterprise') && (
                <button
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  className="sl-btn-secondary"
                >
                  {portalLoading ? '打开中…' : '管理订阅'}
                </button>
              )}
              <Link href="/dashboard/listings/new" className="sl-btn-primary !py-[10px] !px-4 !text-[13.5px]">
                + 新建房源
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: '总申请数', v: stats.total },
              { l: '已批准', v: stats.approved },
              { l: '待处理', v: stats.pending },
              { l: 'LTB / 法庭标记', v: stats.flags, warn: stats.flags > 0 },
            ].map((s) => (
              <div key={s.l} className="sl-card p-5">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">
                  {s.l}
                </div>
                <div
                  className={
                    'mt-1 text-[32px] font-bold tracking-tight ' + (s.warn ? 'text-warning' : 'text-body')
                  }
                >
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          {/* Listings */}
          <div className="sl-card mb-8 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line-divider px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                <h2 className="text-[16px] font-bold tracking-tight">你的房源</h2>
              </div>
              <span className="font-mono text-[11px] text-body-3">{listings.length} 套</span>
            </div>
            {loading ? (
              <div className="p-10 text-center font-mono text-[12px] text-body-3">加载中…</div>
            ) : listings.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-[36px] opacity-30">▱</div>
                <div className="mt-3 text-[14px] text-body-2">还没有房源。</div>
                <Link
                  href="/dashboard/listings/new"
                  className="mt-2 inline-flex font-semibold text-brand hover:underline"
                >
                  创建你的第一个房源 →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line-divider">
                {listings.map((l) => {
                  const url = `${origin}/apply/${l.slug}`
                  return (
                    <li
                      key={l.id}
                      className="flex flex-col gap-3 px-6 py-4 transition hover:bg-surface-chip sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold">
                          {l.address}
                          {l.unit ? `, ${l.unit}` : ''}
                          <span className="ml-2 text-[12px] font-medium text-body-3">· {l.city}</span>
                        </div>
                        <div className="mt-0.5 font-mono text-[11.5px] text-body-3">
                          ${l.monthly_rent?.toLocaleString()}/mo
                          {l.bedrooms ? ` · ${l.bedrooms}bd` : ''}
                          {l.bathrooms ? ` · ${l.bathrooms}ba` : ''}
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] text-brand">{url}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyLink(l.slug)}
                          className="rounded-lg border border-line-strong bg-white px-3 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
                        >
                          {copiedSlug === l.slug ? '✓ 已复制' : '复制链接'}
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-line-strong bg-white px-3 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
                        >
                          打开 ↗
                        </a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Applications */}
          <div className="sl-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line-divider px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tenant" />
                <h2 className="text-[16px] font-bold tracking-tight">最新申请</h2>
              </div>
              <Link
                href="/landlord/applicants"
                className="text-[12.5px] font-semibold text-brand hover:underline"
              >
                查看全部 →
              </Link>
            </div>
            {loading ? (
              <div className="p-10 text-center font-mono text-[12px] text-body-3">加载中…</div>
            ) : applications.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-[36px] opacity-30">⌖</div>
                <div className="mt-3 text-[14px] text-body-2">
                  还没收到申请。复制房源链接给租客即可开始。
                </div>
              </div>
            ) : (
              <table className="w-full text-[13.5px]">
                <thead className="bg-surface-chip">
                  <tr>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">申请人</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">房源</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">月收入</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">AI 分</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">LTB</th>
                    <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => {
                    const s = app.ai_overall_score ?? app.ai_score ?? null
                    const sc = scoreColor(s)
                    const fullName =
                      app.full_name ||
                      [app.first_name, app.last_name].filter(Boolean).join(' ') ||
                      app.email
                    const flags = app.ltb_records_found ?? app.court_search_count ?? 0
                    return (
                      <tr
                        key={app.id}
                        className="cursor-pointer border-t border-line-divider transition hover:bg-surface-chip"
                        onClick={() => {
                          window.location.href = `/dashboard/applications/${app.id}`
                        }}
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold">{fullName}</div>
                          <div className="font-mono text-[11px] text-body-3">
                            {new Date(app.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-body-2">{app.listing?.address}</td>
                        <td className="px-6 py-4 font-mono">
                          {app.monthly_income ? `$${app.monthly_income.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-6 py-4">
                          {s ? (
                            <span
                              className={`rounded-md px-2.5 py-1 font-mono text-[12px] font-bold ${sc.bg} ${sc.fg}`}
                            >
                              {s}
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-body-4">pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {flags > 0 ? (
                            <span className="font-mono text-[12px] text-danger">⚠ {flags}</span>
                          ) : (
                            <span className="font-mono text-[12px] text-success">✓ 无</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={
                              'rounded-md px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase ' +
                              (app.status === 'approved'
                                ? 'bg-success/10 text-success'
                                : app.status === 'declined'
                                  ? 'bg-danger/10 text-danger'
                                  : 'bg-info/10 text-info')
                            }
                          >
                            {app.status || 'new'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Upgrade modal */}
      {showUpgrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur"
          onClick={() => setShowUpgrade(false)}
        >
          <div
            className="sl-card relative w-full max-w-2xl p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowUpgrade(false)}
              className="absolute right-4 top-4 font-mono text-[12px] text-body-3 hover:text-body"
            >
              ✕
            </button>
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              UPGRADE
            </div>
            <h2 className="mt-2 text-[24px] font-bold tracking-tight">选择你的方案</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div
                className={
                  'rounded-2xl p-5 ' +
                  (plan === 'free' ? 'border border-brand/40 bg-brand/5' : 'border border-line-divider bg-white')
                }
              >
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
                  Free
                </div>
                <div className="mt-1 text-[32px] font-bold tracking-tight">
                  $0<span className="text-[14px] font-medium text-body-3">/mo</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-[12.5px] text-body-2">
                  <li>✓ 不限房源数</li>
                  <li>✓ AI 六维评分</li>
                  <li>✓ Vision OCR</li>
                  <li>✓ CanLII LTB 查询</li>
                  <li className="text-body-4">— Openroom 跨平台</li>
                  <li className="text-body-4">— 批量导出</li>
                </ul>
              </div>
              <div className="relative rounded-2xl border-2 border-brand bg-brand/5 p-5">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-md bg-brand px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                  推荐
                </div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-brand">
                  Pro
                </div>
                <div className="mt-1 text-[32px] font-bold tracking-tight">
                  $29<span className="text-[14px] font-medium text-body-3">/mo</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-[12.5px] text-body">
                  <li>✓ Free 全部功能</li>
                  <li>✓ Openroom 房东数据库</li>
                  <li>✓ 优先 AI 评分队列</li>
                  <li>✓ 批量 CSV 导出</li>
                  <li>✓ 自定义品牌 apply 页</li>
                  <li>✓ 邮件 + Slack 通知</li>
                </ul>
                <button
                  onClick={startCheckout}
                  disabled={checkoutLoading}
                  className="sl-btn-primary mt-5 w-full !py-[12px]"
                >
                  {checkoutLoading ? '跳转 Stripe…' : '升级到 Pro →'}
                </button>
              </div>
            </div>
            <p className="mt-4 text-center font-mono text-[10px] text-body-3">
              Stripe 安全支付 · 随时在 “管理订阅” 取消
            </p>
          </div>
        </div>
      )}

      {/* Checkout banner */}
      {checkoutBanner && (
        <div className="fixed top-20 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2">
          <div
            className={
              'sl-card flex items-center gap-3 px-5 py-3 ' +
              (checkoutBanner === 'success'
                ? 'border-success/40'
                : checkoutBanner === 'cancel'
                  ? 'border-line-strong'
                  : 'border-warning/40')
            }
          >
            {checkoutBanner === 'pending' && (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-warning/40 border-t-warning" />
                <span className="text-[12.5px] text-body">收到付款 · 正在解锁 Pro…</span>
              </>
            )}
            {checkoutBanner === 'success' && (
              <>
                <span className="text-success">✓</span>
                <span className="text-[12.5px] text-body">欢迎加入 Pro!</span>
                <button onClick={() => setCheckoutBanner(null)} className="ml-2 font-mono text-[10px] text-body-3">
                  关闭
                </button>
              </>
            )}
            {checkoutBanner === 'cancel' && (
              <>
                <span className="text-body-3">✕</span>
                <span className="text-[12.5px] text-body">已取消支付 · 没有产生扣款</span>
                <button onClick={() => setCheckoutBanner(null)} className="ml-2 font-mono text-[10px] text-body-3">
                  关闭
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <Footer />
    </>
  )
}
