'use client'

import Link from 'next/link'
import AIProactive from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'
import {
  FIELD_WEEK,
  SHOWING_FEE,
  WEEK_SHOWING_FEES,
  WEEK_UNSETTLED_FEES,
  money,
} from '@/lib/demo/agentBook'

/**
 * V5 ART 36 · Agent · Calendar — layout follows design/v9-workspace-finance.html.
 *
 * Week view (Mon–Sun) with showings, photo shoots and lease signings. Every
 * block is a link now: showings open /agent/showings/[id], everything else
 * deep-links into the agent console.
 *
 * Money: this page only reports field-work output for the week (showings done
 * and their flat fees). Monthly and YTD commission live on /agent/earnings,
 * which is the single ledger — the two pages used to publish different totals.
 */

const DAYS: Record<'zh' | 'en', string[]> = {
  zh: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
/** Week 20 runs 5/11–5/17; demo "today" is Tue 5/12 (index 1). */
const WEEK_START_DATE = 11
const TODAY_INDEX = 1

interface Bi {
  zh: string
  en: string
}

interface Slot {
  day: number // 0=Mon
  start: number
  end: number
  type: 'showing' | 'photo' | 'lease' | 'block'
  title: Bi
  sub: Bi
  /** Showings open the live showing screen; the rest deep-link to the console. */
  showingSlug?: string
  /** Already happened — the feedback screen is the next step. */
  done?: boolean
}

const SLOTS: Slot[] = [
  { day: 0, start: 10, end: 11, type: 'showing', showingSlug: 'sh-brunswick-anna', done: true, title: { zh: 'Brunswick Ave', en: 'Brunswick Ave' }, sub: { zh: 'Anna L. · 3/4 章', en: 'Anna L. · 3/4 stamps' } },
  { day: 0, start: 14, end: 15, type: 'photo', title: { zh: '88 Harbour 拍照', en: '88 Harbour shoot' }, sub: { zh: 'New listing', en: 'New listing' } },
  { day: 1, start: 11, end: 12, type: 'showing', showingSlug: 'sh-1207-mia', title: { zh: 'Unit 1207 · King West', en: 'Unit 1207 · King West' }, sub: { zh: 'Mia Chen · 3/4 章', en: 'Mia Chen · 3/4 stamps' } },
  { day: 1, start: 16, end: 17, type: 'lease', title: { zh: 'Ontario LTB 租约签字', en: 'Ontario LTB lease signing' }, sub: { zh: 'Kevin Tran 续约', en: 'Kevin Tran renewal' } },
  { day: 2, start: 9, end: 11, type: 'block', title: { zh: '区域走访', en: 'Area canvass' }, sub: { zh: 'Yorkville', en: 'Yorkville' } },
  { day: 2, start: 14, end: 15.5, type: 'showing', showingSlug: 'sh-cumberland-eric', title: { zh: '155 Cumberland', en: '155 Cumberland' }, sub: { zh: 'Eric K. · 4/4 章', en: 'Eric K. · 4/4 stamps' } },
  { day: 3, start: 10, end: 11, type: 'showing', showingSlug: 'sh-sumach-sophie', title: { zh: '210 Sumach', en: '210 Sumach' }, sub: { zh: 'Sophie B. · 1/4 章', en: 'Sophie B. · 1/4 stamps' } },
  { day: 3, start: 13, end: 14, type: 'showing', showingSlug: 'sh-distillery-david', title: { zh: 'Distillery 1207', en: 'Distillery 1207' }, sub: { zh: 'David Z. · 认证 3 级', en: 'David Z. · Tier 3' } },
  { day: 4, start: 11, end: 12, type: 'showing', showingSlug: 'sh-hanna-yuki', title: { zh: 'Hanna Ave Loft', en: 'Hanna Ave Loft' }, sub: { zh: 'Yuki M. · 认证 2 级', en: 'Yuki M. · Tier 2' } },
  { day: 5, start: 12, end: 14, type: 'block', title: { zh: 'Open House', en: 'Open House' }, sub: { zh: '432 Brunswick', en: '432 Brunswick' } },
  { day: 6, start: 10, end: 11.5, type: 'photo', title: { zh: 'Leslieville 拍照', en: 'Leslieville shoot' }, sub: { zh: '1162 Queen E', en: '1162 Queen E' } },
]

const TYPE_STYLE: Record<string, { bg: string; fg: string; bd: string }> = {
  showing: { bg: 'rgba(37,99,235,0.10)', fg: '#1E3A8A', bd: 'rgba(37,99,235,0.40)' },
  photo: { bg: 'rgba(124,58,237,0.10)', fg: '#5B21B6', bd: 'rgba(124,58,237,0.40)' },
  lease: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', bd: 'rgba(4,120,87,0.40)' },
  block: { bg: 'rgba(113,113,122,0.10)', fg: '#52525B', bd: 'rgba(113,113,122,0.30)' },
}

/** Open windows a waiting client could still be offered this week. */
const OPEN_WINDOWS: { when: Bi; hours: number }[] = [
  { when: { zh: '周三 11:00–14:00', en: 'Wed 11:00–14:00' }, hours: 3 },
  { when: { zh: '周四 15:00–18:00', en: 'Thu 15:00–18:00' }, hours: 3 },
  { when: { zh: '周五 09:00–11:00', en: 'Fri 09:00–11:00' }, hours: 2 },
]

function slotHref(s: Slot, lang: Lang): string {
  if (s.showingSlug) {
    return s.done ? `/agent/showings/${s.showingSlug}/feedback` : `/agent/showings/${s.showingSlug}`
  }
  const zh = lang === 'zh'
  const prompt = zh
    ? `打开「${s.title.zh} · ${s.sub.zh}」这个日程，给我准备材料和下一步`
    : `Open the "${s.title.en} · ${s.sub.en}" calendar item — prep the pack and the next step`
  return `/agent/agent?prompt=${encodeURIComponent(prompt)}`
}

export default function AgentCalendarPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('agent')
  const today = SLOTS.filter((s) => s.day === TODAY_INDEX).sort((a, b) => a.start - b.start)
  const openHours = OPEN_WINDOWS.reduce((s, w) => s + w.hours, 0)

  return (
    <WorkspaceShell role="agent" aside={<Aside lang={lang} />}>
      <PageHeader
        title={zh ? '本周日程' : 'This week'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-agent">AGENT · CALENDAR</span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh ? '第 20 周 · 5/11–5/17 · 9 场带看' : 'Week 20 · 5/11–5/17 · 9 showings'}
          </>
        }
        actions={
          <>
            <Link
              href={`/agent/agent?prompt=${encodeURIComponent(zh ? '给我看上周（第 19 周）的带看记录和结算情况' : 'Show me last week’s (week 19) showings and settlements')}`}
              className="rounded-[10px] border border-line-strong bg-white px-3 py-2 text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
            >
              {zh ? '← 上周' : '← Last week'}
            </Link>
            <span
              aria-current="true"
              className="rounded-[10px] border border-ink bg-ink px-3 py-2 text-[12.5px] font-semibold text-white"
            >
              {zh ? '本周' : 'This week'}
            </span>
            <Link
              href={`/agent/agent?prompt=${encodeURIComponent(zh ? '给我看下周（第 21 周）已排的带看和空档' : 'Show me next week’s (week 21) booked showings and open slots')}`}
              className="rounded-[10px] border border-line-strong bg-white px-3 py-2 text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
            >
              {zh ? '下周 →' : 'Next week →'}
            </Link>
          </>
        }
      />

      {/* Week output only — monthly/YTD commission lives on /agent/earnings. */}
      <StatStrip
        stats={[
          {
            label: zh ? '本周完成' : 'Completed this week',
            value: zh ? `${FIELD_WEEK.showingsDone} 场` : String(FIELD_WEEK.showingsDone),
            sub: zh ? `${FIELD_WEEK.unsettledShowings} 场待写反馈` : `${FIELD_WEEK.unsettledShowings} awaiting feedback`,
            tone: 'up',
          },
          {
            label: zh ? '本周应得带看费' : 'Showing fees earned',
            value: money(WEEK_SHOWING_FEES),
            sub: zh ? `${FIELD_WEEK.showingsDone} 场 × ${money(SHOWING_FEE)}` : `${FIELD_WEEK.showingsDone} × ${money(SHOWING_FEE)}`,
          },
          {
            label: zh ? '待结' : 'Unsettled',
            value: money(WEEK_UNSETTLED_FEES),
            sub: zh ? `${FIELD_WEEK.unsettledShowings} 场 · 完成确认后结算` : `${FIELD_WEEK.unsettledShowings} showings · settles after confirmation`,
            tone: 'warn',
          },
          {
            label: zh ? '本周新客' : 'New clients',
            value: String(FIELD_WEEK.newClients),
            sub: zh ? '佣金账本见「收益」页' : 'Commission ledger lives on Earnings',
          },
        ]}
      />

      {/* Today */}
      <SectionCard
        className="mb-4"
        padded={false}
        title={zh ? `今日日程 · ${WEEK_START_DATE + TODAY_INDEX} 日` : `Today · May ${WEEK_START_DATE + TODAY_INDEX}`}
        action={
          <Link
            href="/agent/showings/sh-brunswick-anna/feedback"
            className="text-[12px] font-semibold text-agent underline underline-offset-2"
          >
            {zh ? `待写反馈 ${FIELD_WEEK.unsettledShowings} 场 →` : `${FIELD_WEEK.unsettledShowings} feedback forms →`}
          </Link>
        }
      >
        <ul>
          {today.map((s, i) => (
            <li
              key={`${s.day}-${s.start}`}
              className={
                'flex flex-wrap items-center justify-between gap-3 px-4 py-3 ' +
                (i > 0 ? 'border-t border-line-divider' : '')
              }
            >
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-body-3">
                  {fmtRange(s.start, s.end)}
                </div>
                <div className="mt-0.5 text-[13.5px] font-bold">{s.title[lang]}</div>
                <div className="text-[12px] text-body-2">{s.sub[lang]}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={s.type === 'lease' ? 'ok' : 'info'}>
                  {s.type === 'lease' ? (zh ? '签字' : 'Signing') : zh ? '看房' : 'Showing'}
                </StatusPill>
                <Link
                  href={slotHref(s, lang)}
                  className="rounded-[8px] bg-ink px-3 py-[7px] text-[11.5px] font-semibold text-white"
                >
                  {s.type === 'lease' ? (zh ? '打开租约 →' : 'Open lease →') : zh ? '看房现场 →' : 'Showing live →'}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11.5px]">
        <Legend color="#1E3A8A" label={zh ? '看房' : 'Showing'} />
        <Legend color="#5B21B6" label={zh ? '拍照' : 'Photo shoot'} />
        <Legend color="#047857" label={zh ? '签字 / 关单' : 'Signing / closing'} />
        <Legend color="#52525B" label={zh ? '非客户时间' : 'Non-client time'} />
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-xl border border-line-divider bg-white">
        <div className="min-w-[680px]">
          {/* Day header */}
          <div
            className="grid border-b border-line-divider bg-surface-chip"
            style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}
          >
            <div />
            {DAYS[lang].map((d, i) => (
              <div
                key={d}
                className="border-l border-line-divider px-2 py-2.5 text-center font-mono text-[11px] uppercase tracking-eyebrow text-body-2"
              >
                {d}
                <div className={'text-[14px] font-bold ' + (i === TODAY_INDEX ? 'text-agent' : 'text-body')}>
                  {WEEK_START_DATE + i}
                </div>
              </div>
            ))}
          </div>

          {/* Hour rows */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="grid border-b border-line-divider"
                style={{ gridTemplateColumns: '60px repeat(7, 1fr)', height: 56 }}
              >
                <div className="px-2 pt-1 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                  {h}:00
                </div>
                {DAYS[lang].map((_, di) => (
                  <div
                    key={di}
                    className="border-l border-line-divider"
                    style={{ background: di === 5 || di === 6 ? 'rgba(245,242,234,0.5)' : 'white' }}
                  />
                ))}
              </div>
            ))}
            {/* Slots overlay */}
            {SLOTS.map((s, i) => {
              const sty = TYPE_STYLE[s.type]
              const top = (s.start - HOURS[0]) * 56
              const height = (s.end - s.start) * 56 - 4
              const colWidth = 'calc((100% - 60px) / 7)'
              const left = `calc(60px + ${s.day} * ${colWidth} + 3px)`
              return (
                <Link
                  key={i}
                  href={slotHref(s, lang)}
                  className="absolute overflow-hidden rounded-[6px] border px-2 py-1.5 transition hover:brightness-95"
                  style={{
                    top,
                    left,
                    width: `calc(${colWidth} - 6px)`,
                    height,
                    background: sty.bg,
                    borderColor: sty.bd,
                    color: sty.fg,
                  }}
                >
                  <div className="truncate text-[11.5px] font-bold">{s.title[lang]}</div>
                  <div className="truncate text-[10.5px] opacity-80">{s.sub[lang]}</div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Open windows */}
      <SectionCard
        className="mt-4"
        title={zh ? '本周空档与可约时间' : 'Open windows this week'}
        meta={zh ? `共 ${openHours} 小时可约` : `${openHours} bookable hours`}
      >
        <div className="flex flex-wrap gap-2">
          {OPEN_WINDOWS.map((w) => (
            <span
              key={w.when.en}
              className="rounded-[8px] border border-line-divider bg-surface-chip px-3 py-1.5 font-mono text-[11.5px]"
            >
              {w.when[lang]}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-body-2">
          {zh
            ? `等待中的客户里，Lisa W. 与 Eric K. 都还没定下一场。${aiName} 可以把这些空档整理成一条消息发给他们 —— 发出前你先过目。`
            : `Lisa W. and Eric K. are both waiting without a next viewing booked. ${aiName} can turn these windows into one message for them — you approve before it sends.`}
        </p>
        <Link
          href={`/agent/agent?prompt=${encodeURIComponent(
            zh
              ? `把我本周的空档（${OPEN_WINDOWS.map((w) => w.when.zh).join('、')}）整理成一条消息，发给还在等看房的 Lisa W. 和 Eric K.，发送前先给我确认。`
              : `Turn my open windows this week (${OPEN_WINDOWS.map((w) => w.when.en).join(', ')}) into one message for Lisa W. and Eric K., who are still waiting for a viewing — show it to me before sending.`
          )}`}
          className="mt-3 inline-block rounded-[8px] bg-ink px-4 py-2 text-[12.5px] font-semibold text-white"
        >
          {zh ? `让 ${aiName} 把空档发给等待中的客户` : `Have ${aiName} send these windows to waiting clients`}
        </Link>
      </SectionCard>
    </WorkspaceShell>
  )
}

function fmtRange(start: number, end: number): string {
  const f = (n: number) => {
    const h = Math.floor(n)
    const m = Math.round((n - h) * 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return `${f(start)}–${f(end)}`
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono uppercase tracking-eyebrow text-body-3">
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      {label}
    </div>
  )
}

function Aside({ lang }: { lang: Lang }) {
  const zh = lang === 'zh'
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive
          role="agent"
          variant="rail"
          insights={[
            {
              text: {
                zh: '明天 3 场带看的路线还没优化 — 按位置重排可以省约 40 分钟通勤。',
                en: "Tomorrow's 3 showings aren't route-optimized — reordering by location saves ~40 minutes.",
              },
              action: {
                label: { zh: '优化路线', en: 'Optimize route' },
                prompt: {
                  zh: '帮我把明天的带看按位置优化路线。',
                  en: "Optimize tomorrow's showing route by location.",
                },
              },
            },
          ]}
        />
      </AsideBlock>

      <AsideBlock title={zh ? '本周位置' : 'This week'}>
        <div className="rounded-xl border border-line-divider bg-white p-3.5">
          <div className="text-[12.5px] text-body-2">
            {zh ? 'GTA West 区域排名' : 'GTA West area rank'}
          </div>
          <div className="mt-0.5 text-[22px] font-extrabold tracking-tight">#3 / 23</div>
          <div className="mt-0.5 text-[11.5px] text-body-3">{zh ? '距 Top 2 还 2 单' : '2 deals from Top 2'}</div>
          <Link
            href="/agent/earnings"
            className="mt-3 block w-full rounded-[8px] border border-line-strong bg-white py-2 text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
          >
            {zh ? '打开佣金账本' : 'Open commission ledger'}
          </Link>
        </div>
      </AsideBlock>
    </div>
  )
}
