'use client'

export const runtime = 'edge'

// /tenant/applications/[id] — one application's own page (节点 2 · 清楚,
// 2026-09-26). The list had a tracker but nowhere to open; the applicant
// could not see what they had submitted, what the landlord had done, or
// what happens next (external review: 申请缺后续入口). Everything here comes
// from the tenant facts (the score-free applicant view); the score is never
// shown to the applicant.
import { use } from 'react'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useFacts } from '@/lib/facts/useFacts'
import { useT } from '@/lib/i18n'
import { applicationTrack, trackSummary, type TrackStep } from '@/lib/lifecycle/applicationTrack'
import { leaseStateDetail } from '@/lib/matters/states'

const OWNER: Record<string, { zh: string; en: string }> = {
  viewed: { zh: '房东', en: 'the landlord' },
  screened: { zh: '房东', en: 'the landlord' },
  decision: { zh: '房东', en: 'the landlord' },
  lease: { zh: '你', en: 'you' },
  tenancy: { zh: '你', en: 'you' },
}
const NEXT: Record<string, { zh: string; en: string }> = {
  viewed: { zh: '等房东打开你的申请。', en: 'Waiting for the landlord to open your application.' },
  screened: { zh: '房东已查看，通常接下来会发起筛查（你不会看到分数，只会看到进度）。', en: 'The landlord opened it; a screening usually follows (you see progress, never a score).' },
  decision: { zh: '筛查已发起，等房东做决定；决定会以邮件通知你。', en: 'Screening started; the decision arrives by e-mail.' },
  lease: { zh: '已录取。房东会把安省标准租约发到你的邮箱，凭链接签署。', en: 'Approved. The landlord sends the Ontario standard lease to your e-mail; sign by link.' },
  tenancy: { zh: '租约已签。接受邮件里的在管租约邀请，租金记录与报修就在站内。', en: 'Lease signed. Accept the emailed tenancy invitation to get the ledger and repairs in the app.' },
}

export default function TenantApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { lang } = useT()
  const zh = lang === 'zh'
  const { facts, loading } = useFacts('tenant')
  const app = facts?.applications.find((a) => a.id === id) ?? null
  const lease = facts && app ? facts.leases.find((l) => l.application_id === app.id) ?? null : null
  const hh = facts && lease ? facts.households.find((h) => h.current_lease_id === lease.id) ?? null : null
  const joined = !!hh && !!facts && facts.members.includes(hh.id)
  const steps: TrackStep[] = app ? applicationTrack({ ...app, lease: lease ? { status: lease.status, sent_at: lease.sent_at ?? null, signed_at: lease.signed_at ?? null } : null, household: hh ? { id: hh.id, joined } : null }) : []
  const current = steps.find((s) => s.state === 'current') ?? null
  const summary = app ? trackSummary(steps, zh) : null
  const declined = app?.status === 'declined' || app?.status === 'rejected'
  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mx-auto max-w-[760px]">
        <Link href="/tenant/applications" className="text-[13px] text-body-3 hover:underline">{zh ? '← 我的申请' : '← My applications'}</Link>
        {loading && !facts ? (
          <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface-muted" />
        ) : !app ? (
          <div className="mt-6 rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '没有找到这份申请，或它不是用你现在登录的邮箱提交的。' : 'This application was not found, or it was not submitted with the e-mail you are signed in with.'}</div>
        ) : (
          <>
            <div className="mt-3 font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '申请 · 详情' : 'APPLICATION'}</div>
            <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">
              {app.listing_address ? `${app.listing_address}${app.listing_unit ? ` #${app.listing_unit}` : ''}` : (zh ? '申请' : 'Application')}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-body-3">
              <span>{zh ? '提交 ' : 'Submitted '}{app.created_at.slice(0, 10)}</span>
              {app.move_in_date && <span>· {zh ? '期望入住 ' : 'move-in '}{app.move_in_date}</span>}
              {app.listing_active === false && <span className="rounded-full bg-surface-chip px-1.5 py-[1px] text-[10.5px] font-semibold">{zh ? '房源已下架' : 'Listing off market'}</span>}
              {app.listing_active !== false && app.listing_slug && <Link href={`/listings/${app.listing_slug}`} className="underline underline-offset-2">{zh ? '看房源 →' : 'Listing →'}</Link>}
              {summary && <span className={'ml-auto rounded-full px-2.5 py-[3px] text-[11px] font-bold ' + (summary.tone === 'ok' ? 'bg-success/10 text-success' : summary.tone === 'bad' ? 'bg-danger/10 text-danger' : 'bg-surface-chip text-body-3')}>{summary.text}</span>}
            </div>

            <section className="mt-6 rounded-2xl border border-line-divider bg-white p-5" data-testid="application-detail-steps">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '进度 · 谁在处理' : 'PROGRESS · WHO HAS IT'}</div>
              <ol className="mt-3 space-y-2">
                {steps.map((s) => (
                  <li key={s.key} className="flex items-start gap-3 text-[13.5px]">
                    <span className={'mt-[3px] flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] ' + (s.state === 'done' ? 'bg-success text-white' : s.state === 'current' ? 'bg-brand text-white' : s.state === 'bad' ? 'bg-danger text-white' : 'border border-line-strong text-transparent')}>{s.state === 'done' ? '✓' : s.state === 'bad' ? '✕' : '·'}</span>
                    <span className={s.state === 'current' ? 'font-bold' : s.state === 'todo' ? 'text-body-3' : ''}>
                      {zh ? s.label.zh : s.label.en}
                      {s.when && <span className="ml-2 font-mono text-[11px] text-body-3">{s.when}</span>}
                      {s.state === 'current' && OWNER[s.key] && <span className="ml-2 rounded-full bg-brand/10 px-2 py-[1px] text-[11px] font-bold text-brand">{zh ? `轮到${OWNER[s.key].zh}` : `with ${OWNER[s.key].en}`}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              {current && NEXT[current.key] && (
                <p className="mt-3 rounded-xl bg-surface-chip px-3 py-2 text-[13px] text-body-2" data-testid="application-next-step">
                  <b>{zh ? '下一步：' : 'Next: '}</b>{zh ? NEXT[current.key].zh : NEXT[current.key].en}
                </p>
              )}
              {declined && (
                <p className="mt-3 rounded-xl bg-danger/5 px-3 py-2 text-[13px] text-body-2">
                  {zh ? '这份申请未被录取。' : 'This application was not accepted.'}{app.decision_reason ? ` ${zh ? '房东给出的说明：' : 'The landlord’s note: '}“${app.decision_reason}”` : ''}
                  {' '}{zh ? '你有权在 60 天内索取所依据信息的性质与来源（《消费者报告法》s.10(7)）；申请时提供的材料不会被用于其他目的。' : 'Within 60 days you may ask for the nature and source of the information relied on (Consumer Reporting Act s.10(7)).'}
                </p>
              )}
            </section>

            <section className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-line-divider bg-white p-5">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '材料' : 'MATERIALS'}</div>
                <div className="mt-2 text-[22px] font-extrabold">{app.files_count ?? 0}<span className="ml-1 text-[13px] font-semibold text-body-3">{zh ? '份已提交' : 'submitted'}</span></div>
                <p className="mt-1 text-[12.5px] text-body-3">{zh ? '材料只有该房源的房东能查看，每次查看都留痕。要补充材料，在对话里告诉助手或直接联系房东。' : 'Only this listing’s landlord can open them, and every view is logged. To add documents, tell your assistant or contact the landlord.'}</p>
              </div>
              <div className="rounded-2xl border border-line-divider bg-white p-5">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '租约与在管租约' : 'LEASE & TENANCY'}</div>
                {lease ? (
                  <>
                    <div className="mt-2 text-[14px] font-semibold">{leaseStateDetail(lease, zh)}</div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[12.5px]">
                      {lease.status === 'sent' && <Link href="/tenant/lease" className="font-semibold text-brand underline underline-offset-2">{zh ? '去签署 →' : 'Sign →'}</Link>}
                      {hh && <Link href={`/h/${hh.id}`} className="font-semibold text-brand underline underline-offset-2">{joined ? (zh ? '打开在管租约 →' : 'Open the tenancy →') : (zh ? '接受在管租约邀请 →' : 'Accept the invitation →')}</Link>}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[12.5px] text-body-3">{zh ? '录取后房东会从这份申请起草租约，进度会显示在这里。' : 'After approval the landlord drafts the lease from this application; it shows up here.'}</p>
                )}
              </div>
            </section>
            <p className="mt-4 text-[11.5px] text-body-3">{zh ? '「房东已查看」「筛查已发起」来自房东的真实操作；筛查结果只有房东能看到，决定以邮件通知为准。' : '"Landlord opened it" and "screening started" reflect the landlord’s real actions; only the landlord sees the screening result; the decision arrives by e-mail.'}</p>
          </>
        )}
      </div>
    </WorkspaceShell>
  )
}
