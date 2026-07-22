'use client'

import { useState } from 'react'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'

const TIMELINE = {
  zh: ['提交意向', '房东查看', '邀请看房', '提交申请', '签约'],
  en: ['Intent', 'Reviewed', 'Showing', 'Application', 'Signed'],
}

const APPS = [
  {
    addr: 'Unit 1207 · King West',
    nbr: 'King West',
    rent: 2800,
    img: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&q=80&fit=crop&auto=format',
    status: 'in-review' as const,
    statusLabel: { zh: '房东审核中', en: 'Under landlord review' },
    submitted: { zh: '2 天前', en: '2 days ago' },
    cur: 1,
    next: {
      zh: '房东通常 24 小时内回复。超过 24 小时没动静,你的 AI 会替你催一次。',
      en: "Landlords usually reply within 24 hours. If it goes quiet, your AI nudges them once for you.",
    },
  },
  {
    addr: '15 Hanna Ave, Loft 312',
    nbr: 'Liberty Village',
    rent: 2890,
    img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&q=80&fit=crop&auto=format',
    status: 'invited' as const,
    statusLabel: { zh: '已邀请你看房', en: 'Showing invitation sent' },
    submitted: { zh: '3 天前', en: '3 days ago' },
    cur: 2,
    next: {
      zh: '房东给了 3 个时间段:周六 14:00 / 周日 10:00 / 周日 15:30。确认一个,你的 AI 会帮你准备看房问题清单。',
      en: 'The landlord offered 3 slots: Sat 2pm / Sun 10am / Sun 3:30pm. Pick one and your AI preps a viewing question list.',
    },
  },
  {
    addr: '432 Brunswick Ave',
    nbr: 'The Annex',
    rent: 4250,
    img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&q=80&fit=crop&auto=format',
    status: 'declined' as const,
    statusLabel: { zh: '房东婉拒 · 房源已租', en: 'Declined · unit already rented' },
    submitted: { zh: '5 天前', en: '5 days ago' },
    cur: 1,
    next: {
      zh: '这套已租出,与你的资质无关。The Annex 同价位还有 3 套在线,要不要看?',
      en: "This one rented out — nothing to do with your profile. 3 similar Annex listings are live right now.",
    },
  },
]

export default function TenantApplications() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('tenant')
  const [archived, setArchived] = useState<string[]>([])
  const apps = APPS.filter((a) => !archived.includes(a.addr))
  const active = apps.filter((a) => a.status !== 'declined').length

  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
            MY APPLICATIONS
          </div>
          <h1 className="mt-2 text-[26px] font-bold tracking-tight sm:text-[36px]">
            {zh ? `我的申请 (${apps.length})` : `My Applications (${apps.length})`}
          </h1>
        </div>
        <Link href="/listings" className="sl-btn-primary !py-[11px] !px-4 !text-[13.5px]">
          {zh ? '+ 继续找房' : '+ Keep searching'}
        </Link>
      </div>

      {/* AI watch bar */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-tenant/22 bg-tenant/5 px-4 py-3">
        <span className="h-6 w-6 flex-none rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }} />
        <p className="text-[13px] leading-relaxed text-tenant-deep">
          {zh
            ? <><b>{aiName}</b> 正在盯着 {active} 份进行中的申请 —— 房东有回应、超时未回复、需要你拍板时,都会立即通知你。</>
            : <><b>{aiName}</b> is watching your {active} active applications — you'll be pinged the moment a landlord responds, goes quiet too long, or a decision needs you.</>}
        </p>
      </div>

      <div className="space-y-4">
        {apps.map((a) => {
          const declined = a.status === 'declined'
          return (
            <div key={a.addr} className={'sl-card overflow-hidden ' + (declined ? 'opacity-90' : '')}>
              <div className="flex flex-col sm:flex-row">
                {/* Thumb */}
                <div
                  className="h-32 w-full flex-none bg-surface-chip sm:h-auto sm:w-40"
                  style={{ backgroundImage: `url(${a.img})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: declined ? 'grayscale(0.7)' : undefined }}
                />
                <div className="min-w-0 flex-1 p-5 sm:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <h3 className="text-[17px] font-bold tracking-tight">{a.addr}</h3>
                      <div className="text-[12.5px] text-body-3">
                        {a.nbr} · ${a.rent.toLocaleString()}/mo · {zh ? `${a.submitted.zh}提交` : `submitted ${a.submitted.en}`}
                      </div>
                    </div>
                    <span
                      className={
                        'rounded-md px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider ' +
                        (a.status === 'invited'
                          ? 'bg-brand/15 text-brand'
                          : a.status === 'in-review'
                            ? 'bg-info/10 text-info'
                            : 'bg-danger/10 text-danger')
                      }
                    >
                      {a.statusLabel[lang]}
                    </span>
                  </div>

                  {/* Stepper with connector line */}
                  <div className="relative mt-6">
                    <div className="absolute left-[10%] right-[10%] top-3 h-[2px] bg-line-divider" />
                    <div
                      className="absolute left-[10%] top-3 h-[2px] bg-brand transition-all"
                      style={{ width: `${(a.cur / (TIMELINE.zh.length - 1)) * 80}%` }}
                    />
                    <div className="relative grid grid-cols-5 gap-2">
                      {TIMELINE[lang].map((t, i) => (
                        <div key={t} className="flex flex-col items-center text-center">
                          <span
                            className={
                              'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-4 ring-white ' +
                              (i < a.cur
                                ? 'bg-brand/15 text-brand'
                                : i === a.cur
                                  ? 'bg-brand text-white'
                                  : 'bg-line-divider text-body-4')
                            }
                          >
                            {i < a.cur ? '✓' : i + 1}
                          </span>
                          <span
                            className={
                              'mt-1.5 font-mono text-[9.5px] uppercase tracking-eyebrow ' +
                              (i <= a.cur ? 'text-brand' : 'text-body-3')
                            }
                          >
                            {t}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Next-step guidance */}
                  <div className={'mt-5 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed ' + (declined ? 'bg-surface-chip text-body-2' : 'bg-tenant/5 text-tenant-deep')}>
                    <span className="font-bold">{zh ? '下一步 · ' : 'Next · '}</span>
                    {a.next[lang]}
                  </div>

                  {/* Status-specific actions */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {a.status === 'invited' && (
                      <>
                        <Link
                          href={`/tenant/agent?prompt=${encodeURIComponent(zh ? `帮我确认 ${a.addr} 的看房时间，三个时段里选周六 14:00` : `Confirm my showing time for ${a.addr} — Saturday 2pm out of the three slots`)}`}
                          className="sl-btn-primary !py-[9px] !px-4 !text-[13px]"
                        >
                          {zh ? '确认看房时间' : 'Confirm showing time'}
                        </Link>
                        <Link
                          href={`/tenant/agent?prompt=${encodeURIComponent(zh ? `帮我联系 ${a.addr} 的房东，问问看房前需要准备什么` : `Message the landlord of ${a.addr} — ask what to prepare before the showing`)}`}
                          className="rounded-lg border border-line-strong bg-white px-4 py-[8px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
                        >
                          {zh ? '和房东对话' : 'Message landlord'}
                        </Link>
                      </>
                    )}
                    {a.status === 'in-review' && (
                      <>
                        <Link
                          href={`/tenant/agent?prompt=${encodeURIComponent(zh ? `帮我跟进 ${a.addr} 的申请进度` : `Follow up on my application for ${a.addr}`)}`}
                          className="rounded-lg border border-tenant/30 bg-tenant/5 px-4 py-[8px] text-[13px] font-semibold text-tenant transition hover:bg-tenant/10"
                        >
                          {zh ? `让 ${aiName} 跟进` : `Have ${aiName} follow up`}
                        </Link>
                        <Link
                          href="/listings"
                          className="rounded-lg border border-line-strong bg-white px-4 py-[8px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
                        >
                          {zh ? '查看房源' : 'View listing'}
                        </Link>
                      </>
                    )}
                    {declined && (
                      <>
                        <Link
                          href={`/tenant/agent?prompt=${encodeURIComponent(zh ? '帮我在 The Annex 找 $4,300 以内的相似房源' : 'Find me similar listings in The Annex under $4,300')}`}
                          className="sl-btn-primary !py-[9px] !px-4 !text-[13px]"
                        >
                          {zh ? `让 ${aiName} 找相似房源` : `${aiName}, find similar`}
                        </Link>
                        <button
                          onClick={() => setArchived((prev) => [...prev, a.addr])}
                          className="rounded-lg border border-line-strong bg-white px-4 py-[8px] text-[13px] font-semibold text-body-3 transition hover:border-line-strong"
                        >
                          {zh ? '归档' : 'Archive'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </WorkspaceShell>
  )
}
