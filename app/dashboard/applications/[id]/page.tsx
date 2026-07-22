'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { useT } from '@/lib/i18n'
import type { Application } from '@/types'

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { lang } = useT()
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
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
        </div>
      </WorkspaceShell>
    )
  }

  if (!app) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="mx-auto max-w-md py-20 text-center">
          <h1 className="text-[22px] font-bold">{lang === 'zh' ? '找不到申请记录' : 'Application not found'}</h1>
          <p className="mt-2 text-[13.5px] text-body-2">{lang === 'zh' ? '可能已被删除或链接错误。' : 'It may have been deleted, or the link is incorrect.'}</p>
          <Link href="/dashboard" className="sl-btn-secondary mt-6 inline-flex">{lang === 'zh' ? '回工作台' : 'Back to workspace'}</Link>
        </div>
      </WorkspaceShell>
    )
  }

  const fullName =
    app.full_name ||
    [app.first_name, app.last_name].filter(Boolean).join(' ') ||
    app.email
  const overall = app.ai_overall_score ?? app.ai_score ?? null
  const dims = [
    { name: lang === 'zh' ? '证件真实性' : 'Document authenticity', v: app.doc_authenticity ?? null,  note: app.doc_authenticity_note,  w: 20, color: '#7C3AED' },
    { name: lang === 'zh' ? '支付能力' : 'Ability to pay',          v: app.payment_ability ?? null,    note: app.payment_ability_note,    w: 20, color: '#047857' },
    { name: lang === 'zh' ? '法庭记录' : 'Court records',           v: app.court_records ?? app.court_records_score ?? null, note: app.court_records_note ?? app.court_search_summary, w: 20, color: '#DC2626' },
    { name: lang === 'zh' ? '稳定性' : 'Stability',                 v: app.stability ?? null,          note: app.stability_note,          w: 15, color: '#2563EB' },
    { name: lang === 'zh' ? '行为信号' : 'Behavioral signals',      v: app.behavior_signals ?? null,   note: app.behavior_signals_note,   w: 13, color: '#D97706' },
    { name: lang === 'zh' ? '信息一致性' : 'Info consistency',      v: app.info_consistency ?? null,   note: app.info_consistency_note,   w: 12, color: '#0B0B0E' },
  ]

  return (
    <WorkspaceShell role="landlord" hideAside>
      <div className="mx-auto max-w-[1180px]">
          <Link href="/dashboard" className="font-mono text-[12px] text-body-3 hover:text-body">
            {lang === 'zh' ? '← 返回工作台' : '← Back to workspace'}
          </Link>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
                APPLICATION #{(app.id || '').slice(0, 8)}
              </div>
              <h1 className="mt-2 text-[32px] font-bold tracking-tight sm:text-[36px]">{fullName}</h1>
              <div className="mt-1 font-mono text-[11.5px] text-body-3">
                {app.listing?.address} · {lang === 'zh' ? '收到于' : 'Received'} {new Date(app.created_at).toLocaleDateString()}
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
                <h2 className="text-[18px] font-bold tracking-tight">{lang === 'zh' ? '六维 AI 评分' : '6-dimension AI score'}</h2>
                <div className="mt-5 space-y-4">
                  {dims.map((d) => (
                    <div key={d.name}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13.5px] font-semibold">
                          {d.name}{' '}
                          <span className="font-mono text-[10.5px] text-body-3">· {lang === 'zh' ? '权重' : 'weight'} {d.w}%</span>
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
                <h2 className="text-[18px] font-bold tracking-tight">{lang === 'zh' ? '申请人信息' : 'Applicant info'}</h2>
                <div className="mt-4 grid gap-2 text-[13.5px] sm:grid-cols-2">
                  {[
                    [lang === 'zh' ? '邮箱' : 'Email', app.email],
                    [lang === 'zh' ? '电话' : 'Phone', app.phone || '—'],
                    [lang === 'zh' ? '月收入' : 'Monthly income', app.monthly_income ? `$${app.monthly_income.toLocaleString()}` : '—'],
                    [lang === 'zh' ? '雇主' : 'Employer', app.employer || '—'],
                    [lang === 'zh' ? '职位' : 'Occupation', app.occupation || '—'],
                    [lang === 'zh' ? 'AI 提取姓名' : 'AI-extracted name', app.ai_extracted_name || '—'],
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
                <h3 className="text-[15px] font-bold tracking-tight">{lang === 'zh' ? '决策' : 'Decision'}</h3>
                <div className="mt-4 flex flex-col gap-2">
                  <Link href={`/landlord/leases/new?application_id=${id}`} className="sl-btn-primary !py-[12px] text-center">{lang === 'zh' ? '✓ 批准 · 准备租约' : '✓ Approve · prepare lease'}</Link>
                  <Link
                    href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? `帮我联系申请人 ${fullName}，安排面谈并索取更多资料` : `Contact applicant ${fullName} to arrange an interview and request more documents`)}`}
                    className="sl-btn-secondary text-center"
                  >{lang === 'zh' ? '面谈 / 索取更多资料' : 'Interview / request more documents'}</Link>
                  <Link
                    href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? `我想婉拒申请人 ${fullName}，帮我走合规流程（需要具体、非歧视性的理由）` : `I want to decline applicant ${fullName} — walk me through the compliant process (specific, non-discriminatory reason)`)}`}
                    className="rounded-lg border border-danger/40 bg-white px-4 py-[10px] text-center text-[13.5px] font-semibold text-danger"
                  >
                    {lang === 'zh' ? '婉拒' : 'Decline'}
                  </Link>
                </div>
              </div>

              <div className="sl-card p-6">
                <h3 className="text-[15px] font-bold tracking-tight">{lang === 'zh' ? '提交的文件' : 'Submitted documents'}</h3>
                <div className="mt-3 space-y-2">
                  {(app.files || []).length === 0 && (
                    <div className="text-[12.5px] text-body-3">{lang === 'zh' ? '未上传文件' : 'No files uploaded'}</div>
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
                  {lang === 'zh' ? '查看 = audit log 留痕' : 'Viewing = audit log trace'}
                </p>
              </div>
            </aside>
          </div>
        </div>
    </WorkspaceShell>
  )
}
