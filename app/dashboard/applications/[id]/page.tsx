'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import type { Application } from '@/types'

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { landlord, loading: authLoading } = useLandlord()
  const [app, setApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!landlord) return
    supabase
      .from('applications')
      .select('*, listing:listings(*)')
      .eq('id', id)
      .maybeSingle()
      .then((res: { data: Application | null }) => {
        setApp(res.data)
        setLoading(false)
      })
  }, [id, landlord])

  if (authLoading || loading) {
    return (
      <>
        <Header />
        <main className="bg-surface flex min-h-[60vh] items-center justify-center">
          <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
        </main>
        <Footer />
      </>
    )
  }

  if (!app) {
    return (
      <>
        <Header />
        <main className="bg-surface">
          <div className="mx-auto max-w-md px-5 py-20 text-center">
            <h1 className="text-[22px] font-bold">找不到申请记录</h1>
            <p className="mt-2 text-[13.5px] text-body-2">可能已被删除或链接错误。</p>
            <Link href="/dashboard" className="sl-btn-secondary mt-6 inline-flex">回工作台</Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  const fullName =
    app.full_name ||
    [app.first_name, app.last_name].filter(Boolean).join(' ') ||
    app.email
  const overall = app.ai_overall_score ?? app.ai_score ?? null
  const dims = [
    { name: '证件真实性',   v: app.doc_authenticity ?? null,  note: app.doc_authenticity_note,  w: 20, color: '#7C3AED' },
    { name: '支付能力',     v: app.payment_ability ?? null,    note: app.payment_ability_note,    w: 20, color: '#047857' },
    { name: '法庭记录',     v: app.court_records ?? app.court_records_score ?? null, note: app.court_records_note ?? app.court_search_summary, w: 20, color: '#DC2626' },
    { name: '稳定性',       v: app.stability ?? null,          note: app.stability_note,          w: 15, color: '#2563EB' },
    { name: '行为信号',     v: app.behavior_signals ?? null,   note: app.behavior_signals_note,   w: 13, color: '#D97706' },
    { name: '信息一致性',   v: app.info_consistency ?? null,   note: app.info_consistency_note,   w: 12, color: '#0B0B0E' },
  ]

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-7">
          <Link href="/dashboard" className="font-mono text-[12px] text-body-3 hover:text-body">
            ← 返回工作台
          </Link>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
                APPLICATION #{(app.id || '').slice(0, 8)}
              </div>
              <h1 className="mt-2 text-[32px] font-bold tracking-tight sm:text-[36px]">{fullName}</h1>
              <div className="mt-1 font-mono text-[11.5px] text-body-3">
                {app.listing?.address} · 收到于 {new Date(app.created_at).toLocaleDateString()}
              </div>
            </div>
            {overall != null && (
              <div className="text-right">
                <div className="font-mono text-[44px] font-extrabold leading-none text-brand">
                  {overall}
                </div>
                <div className="font-mono text-[10.5px] uppercase text-body-3">/ 100</div>
              </div>
            )}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-6">
              <div className="sl-card p-7">
                <h2 className="text-[18px] font-bold tracking-tight">六维 AI 评分</h2>
                <div className="mt-5 space-y-4">
                  {dims.map((d) => (
                    <div key={d.name}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13.5px] font-semibold">
                          {d.name}{' '}
                          <span className="font-mono text-[10.5px] text-body-3">· 权重 {d.w}%</span>
                        </span>
                        <span
                          className="font-mono text-[14px] font-bold"
                          style={{ color: d.color }}
                        >
                          {d.v ?? '—'}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-divider">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: d.v ? `${d.v}%` : '0%',
                            background: d.color,
                          }}
                        />
                      </div>
                      {d.note && (
                        <div className="mt-1 text-[12px] text-body-2">{d.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="sl-card p-7">
                <h2 className="text-[18px] font-bold tracking-tight">申请人信息</h2>
                <div className="mt-4 grid gap-2 text-[13.5px] sm:grid-cols-2">
                  {[
                    ['邮箱', app.email],
                    ['电话', app.phone || '—'],
                    ['月收入', app.monthly_income ? `$${app.monthly_income.toLocaleString()}` : '—'],
                    ['雇主', app.employer || '—'],
                    ['职位', app.occupation || '—'],
                    ['AI 提取姓名', app.ai_extracted_name || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[100px_1fr] gap-3 border-b border-line-divider py-2 last:border-0">
                      <span className="font-mono text-[11px] uppercase text-body-3">{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="sl-card p-6">
                <h3 className="text-[15px] font-bold tracking-tight">决策</h3>
                <div className="mt-4 flex flex-col gap-2">
                  <button className="sl-btn-primary !py-[12px]">✓ 批准 · 准备租约</button>
                  <button className="sl-btn-secondary">面谈 / 索取更多资料</button>
                  <button className="rounded-lg border border-danger/40 bg-white px-4 py-[10px] text-[13.5px] font-semibold text-danger">
                    婉拒
                  </button>
                </div>
              </div>

              <div className="sl-card p-6">
                <h3 className="text-[15px] font-bold tracking-tight">提交的文件</h3>
                <div className="mt-3 space-y-2">
                  {(app.files || []).length === 0 && (
                    <div className="text-[12.5px] text-body-3">未上传文件</div>
                  )}
                  {(app.files || []).map((f, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-chip px-3 py-2 text-[12.5px]">
                      <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-brand">
                        {(f.kind || f.type || '?').toUpperCase()}
                      </span>
                      <span className="flex-1 truncate font-semibold">{f.name}</span>
                      <span className="font-mono text-body-3">{Math.round(f.size / 1024)} KB</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 font-mono text-[10.5px] text-body-3">
                  查看 = audit log 留痕
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
