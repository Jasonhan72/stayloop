'use client'

import { useState } from 'react'
import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
  EmptyState,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
  Table,
  Td,
  Tr,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'

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

/**
 * What each landlord can currently see, and until when. Revoking happens on
 * /tenant/passport/sharing — the real authorization surface.
 */
const SHARED = [
  {
    who: 'Sarah Wang',
    where: { zh: 'Unit 1207', en: 'Unit 1207' },
    scope: { zh: '身份章 + 收入章结果', en: 'Identity + income stamp results' },
    until: { zh: '有效至 6/14', en: 'Valid to 6/14' },
  },
  {
    who: { zh: 'Liberty Village 房东', en: 'Liberty Village landlord' },
    where: { zh: '15 Hanna Ave, Loft 312', en: '15 Hanna Ave, Loft 312' },
    scope: { zh: '身份章结果（仅 ✓/✗）', en: 'Identity stamp result (✓/✗ only)' },
    until: { zh: '有效至 6/17', en: 'Valid to 6/17' },
  },
]

/** Showing slots the landlord offered (same three as the invited card's copy). */
const SLOTS = [
  { zh: '周六 14:00', en: 'Sat 2pm' },
  { zh: '周日 10:00', en: 'Sun 10am' },
  { zh: '周日 15:30', en: 'Sun 3:30pm' },
]

export default function TenantApplications() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('tenant')
  const [archived, setArchived] = useState<string[]>([])
  const apps = APPS.filter((a) => !archived.includes(a.addr))
  const archivedApps = APPS.filter((a) => archived.includes(a.addr))
  const active = apps.filter((a) => a.status !== 'declined').length

  const insights: AIInsight[] = [
    {
      text: {
        zh: `{ai} 正在盯着 ${active} 份进行中的申请 —— 房东有回应、超时未回复、需要你拍板时,都会立即通知你。`,
        en: `{ai} is watching your ${active} active applications — you'll be pinged the moment a landlord responds, goes quiet too long, or a decision needs you.`,
      },
    },
  ]

  return (
    <WorkspaceShell role="tenant" aside={<Aside lang={lang} insights={insights} />}>
      <PageHeader
        title={zh ? `我的申请 (${apps.length})` : `My Applications (${apps.length})`}
        sub={<span className="font-mono text-[11px] uppercase tracking-eyebrow text-tenant">MY APPLICATIONS</span>}
        actions={
          <Link href="/listings" className="sl-btn-primary !px-4 !py-2 !text-[12.5px]">
            {zh ? '+ 继续找房' : '+ Keep searching'}
          </Link>
        }
      />

      <StatStrip
        stats={[
          {
            label: zh ? '进行中' : 'Active',
            value: String(active),
            sub: zh ? `${aiName} 持续监测` : `${aiName} is watching`,
          },
          {
            label: zh ? '等房东回复' : 'Awaiting landlord',
            value: '1',
            sub: zh ? '已等 2 天' : 'Waiting 2 days',
            tone: 'warn',
          },
          {
            label: zh ? '已邀看房' : 'Showing invites',
            value: '1',
            sub: zh ? '待确认时段' : 'Slot not confirmed',
          },
          {
            label: zh ? '平均回复' : 'Avg reply time',
            value: zh ? '26 小时' : '26 hrs',
            sub: zh ? '你的申请历史' : 'Across your applications',
          },
        ]}
      />

      <div className="space-y-4">
        {apps.map((a) => {
          const declined = a.status === 'declined'
          return (
            <SectionCard key={a.addr} padded={false} className={declined ? 'opacity-90' : ''}>
              <div className="flex flex-col sm:flex-row">
                {/* Thumb */}
                <div
                  className="h-32 w-full flex-none bg-surface-chip sm:h-auto sm:w-40"
                  style={{ backgroundImage: `url(${a.img})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: declined ? 'grayscale(0.7)' : undefined }}
                />
                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <h3 className="text-[15px] font-bold tracking-tight">{a.addr}</h3>
                      <div className="text-[12px] text-body-3">
                        {a.nbr} · ${a.rent.toLocaleString()}/mo · {zh ? `${a.submitted.zh}提交` : `submitted ${a.submitted.en}`}
                      </div>
                    </div>
                    <StatusPill tone={a.status === 'invited' ? 'info' : a.status === 'in-review' ? 'pending' : 'danger'}>
                      {a.statusLabel[lang]}
                    </StatusPill>
                  </div>

                  {/* Stepper with connector line */}
                  <div className="relative mt-5">
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
                  <div className={'mt-4 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed ' + (declined ? 'bg-surface-chip text-body-2' : 'bg-tenant/5 text-tenant-deep')}>
                    <span className="font-bold">{zh ? '下一步 · ' : 'Next · '}</span>
                    {a.next[lang]}
                  </div>

                  {/* Status-specific actions */}
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {a.status === 'invited' && (
                      <>
                        <Link
                          href={`/tenant/agent?prompt=${encodeURIComponent(zh ? `帮我确认 ${a.addr} 的看房时间，三个时段里选周六 14:00` : `Confirm my showing time for ${a.addr} — Saturday 2pm out of the three slots`)}`}
                          className="sl-btn-primary !py-[8px] !px-4 !text-[12.5px]"
                        >
                          {zh ? '确认看房时间' : 'Confirm showing time'}
                        </Link>
                        <Link
                          href={`/tenant/agent?prompt=${encodeURIComponent(zh ? `帮我联系 ${a.addr} 的房东，问问看房前需要准备什么` : `Message the landlord of ${a.addr} — ask what to prepare before the showing`)}`}
                          className="rounded-lg border border-line-strong bg-white px-4 py-[7px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
                        >
                          {zh ? '和房东对话' : 'Message landlord'}
                        </Link>
                      </>
                    )}
                    {a.status === 'in-review' && (
                      <>
                        <Link
                          href={`/tenant/agent?prompt=${encodeURIComponent(zh ? `帮我跟进 ${a.addr} 的申请进度` : `Follow up on my application for ${a.addr}`)}`}
                          className="rounded-lg border border-tenant/30 bg-tenant/5 px-4 py-[7px] text-[12.5px] font-semibold text-tenant transition hover:bg-tenant/10"
                        >
                          {zh ? `让 ${aiName} 跟进` : `Have ${aiName} follow up`}
                        </Link>
                        <Link
                          href="/listings"
                          className="rounded-lg border border-line-strong bg-white px-4 py-[7px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
                        >
                          {zh ? '查看房源' : 'View listing'}
                        </Link>
                      </>
                    )}
                    {declined && (
                      <>
                        <Link
                          href={`/tenant/agent?prompt=${encodeURIComponent(zh ? '帮我在 The Annex 找 $4,300 以内的相似房源' : 'Find me similar listings in The Annex under $4,300')}`}
                          className="sl-btn-primary !py-[8px] !px-4 !text-[12.5px]"
                        >
                          {zh ? `让 ${aiName} 找相似房源` : `${aiName}, find similar`}
                        </Link>
                        <button
                          onClick={() => setArchived((prev) => [...prev, a.addr])}
                          className="rounded-lg border border-line-strong bg-white px-4 py-[7px] text-[12.5px] font-semibold text-body-3 transition hover:border-line-strong"
                        >
                          {zh ? '归档' : 'Archive'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          )
        })}
      </div>

      {/* What these landlords can see */}
      <div className="mt-4">
        <SectionCard
          title={zh ? '这些申请里我交出了什么' : 'Data shared with these landlords'}
          meta={zh ? '示范数据' : 'SAMPLE DATA'}
          padded={false}
        >
          <Table
            head={[
              zh ? '对方' : 'Recipient',
              zh ? '共享内容' : 'Shared',
              zh ? '有效期' : 'Valid until',
              zh ? '操作' : 'Action',
            ]}
          >
            {SHARED.map((s) => {
              const who = typeof s.who === 'string' ? s.who : s.who[lang]
              return (
                <Tr key={who}>
                  <Td>
                    <div className="font-semibold">{who}</div>
                    <div className="mt-0.5 text-[11.5px] text-body-3">{s.where[lang]}</div>
                  </Td>
                  <Td align="right" muted>
                    {s.scope[lang]}
                  </Td>
                  <Td align="right" muted>
                    {s.until[lang]}
                  </Td>
                  <Td align="right">
                    <Link
                      href="/tenant/passport/sharing"
                      className="text-[12px] font-semibold text-danger transition hover:underline"
                    >
                      {zh ? '撤回' : 'Revoke'}
                    </Link>
                  </Td>
                </Tr>
              )
            })}
          </Table>
          <div className="border-t border-line-divider px-4 py-3 text-[11.5px] leading-relaxed text-body-3">
            {zh ? '授权由你控制，随时可撤回。' : 'You control every authorization and can revoke it at any time.'}{' '}
            <Link href="/tenant/passport/sharing" className="font-semibold text-tenant hover:underline">
              {zh ? '管理全部授权 →' : 'Manage all authorizations →'}
            </Link>
          </div>
        </SectionCard>
      </div>

      {/* Archived / ended */}
      <div className="mt-4">
        <SectionCard title={zh ? '已归档 / 已结束' : 'Archived / ended'} padded={false}>
          {archivedApps.length === 0 ? (
            <EmptyState>
              {zh
                ? '还没有归档的申请。已结束的申请归档后会留在这里，随时可以恢复。'
                : 'Nothing archived yet. Applications you archive stay here and can be restored any time.'}
            </EmptyState>
          ) : (
            <Table
              head={[
                zh ? '房源' : 'Listing',
                zh ? '提交时间' : 'Submitted',
                zh ? '结果' : 'Outcome',
                zh ? '操作' : 'Action',
              ]}
            >
              {archivedApps.map((a) => (
                <Tr key={a.addr}>
                  <Td>
                    <div className="font-semibold">{a.addr}</div>
                    <div className="mt-0.5 text-[11.5px] text-body-3">
                      {a.nbr} · ${a.rent.toLocaleString()}/mo
                    </div>
                  </Td>
                  <Td align="right" muted>
                    {zh ? `${a.submitted.zh}提交` : `submitted ${a.submitted.en}`}
                  </Td>
                  <Td align="right">
                    <StatusPill tone="neutral">{a.statusLabel[lang]}</StatusPill>
                  </Td>
                  <Td align="right">
                    <button
                      onClick={() => setArchived((prev) => prev.filter((x) => x !== a.addr))}
                      className="text-[12px] font-semibold text-brand transition hover:underline"
                    >
                      {zh ? '恢复' : 'Restore'}
                    </button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </SectionCard>
      </div>
    </WorkspaceShell>
  )
}

function Aside({ lang, insights }: { lang: Lang; insights: AIInsight[] }) {
  const zh = lang === 'zh'
  const [slot, setSlot] = useState(0)
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive role="tenant" insights={insights} variant="rail" />
      </AsideBlock>

      <AsideBlock title={zh ? '待确认看房' : 'SHOWING TO CONFIRM'}>
        <div className="rounded-xl border border-line-divider bg-white p-3">
          <div className="text-[13px] font-bold">15 Hanna Ave Loft 312</div>
          <div className="mt-0.5 text-[11.5px] text-body-3">
            {zh ? '房东给了 3 个时段，选一个即可' : 'The landlord offered 3 slots — pick one'}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {SLOTS.map((s, i) => (
              <button
                key={s.en}
                onClick={() => setSlot(i)}
                className={
                  'rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ' +
                  (slot === i
                    ? 'border-tenant bg-tenant/10 text-tenant'
                    : 'border-line-divider bg-white text-body-2 hover:border-line-strong')
                }
              >
                {s[lang]}
              </button>
            ))}
          </div>
          <Link
            href={`/tenant/agent?prompt=${encodeURIComponent(
              zh
                ? `帮我确认 15 Hanna Ave, Loft 312 的看房时间，选 ${SLOTS[slot].zh}`
                : `Confirm my showing time for 15 Hanna Ave, Loft 312 — ${SLOTS[slot].en}`
            )}`}
            className="sl-btn-primary mt-3 block w-full text-center !py-2 !text-[12px]"
          >
            {zh ? '确认这个时段' : 'Confirm this slot'}
          </Link>
        </div>
      </AsideBlock>
    </div>
  )
}
