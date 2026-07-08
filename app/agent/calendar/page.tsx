'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'

/**
 * V5 ART 36 · Agent · Calendar
 * Week view (Mon–Sun) with showings, photo shoots, lease signings.
 */

const DAYS: Record<'zh' | 'en', string[]> = {
  zh: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

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
}

const SLOTS: Slot[] = [
  { day: 0, start: 10, end: 11, type: 'showing', title: { zh: 'Brunswick Ave', en: 'Brunswick Ave' }, sub: { zh: 'Anna L. · T3', en: 'Anna L. · T3' } },
  { day: 0, start: 14, end: 15, type: 'photo', title: { zh: '88 Harbour 拍照', en: '88 Harbour shoot' }, sub: { zh: 'New listing', en: 'New listing' } },
  { day: 1, start: 11, end: 12, type: 'showing', title: { zh: 'Unit 1207 · King West', en: 'Unit 1207 · King West' }, sub: { zh: 'Mia Chen · 认证 2 级', en: 'Mia Chen · Tier 2' } },
  { day: 1, start: 16, end: 17, type: 'lease', title: { zh: 'Ontario LTB 租约签字', en: 'Ontario LTB lease signing' }, sub: { zh: 'Kevin Tran 续约', en: 'Kevin Tran renewal' } },
  { day: 2, start: 9, end: 11, type: 'block', title: { zh: '区域走访', en: 'Area canvass' }, sub: { zh: 'Yorkville', en: 'Yorkville' } },
  { day: 2, start: 14, end: 15.5, type: 'showing', title: { zh: '155 Cumberland', en: '155 Cumberland' }, sub: { zh: 'Eric K. · T4', en: 'Eric K. · T4' } },
  { day: 3, start: 10, end: 11, type: 'showing', title: { zh: '210 Sumach', en: '210 Sumach' }, sub: { zh: 'Sophie B. · T1', en: 'Sophie B. · T1' } },
  { day: 3, start: 13, end: 14, type: 'showing', title: { zh: 'Distillery 1207', en: 'Distillery 1207' }, sub: { zh: 'David Z. · T3', en: 'David Z. · T3' } },
  { day: 4, start: 11, end: 12, type: 'showing', title: { zh: 'Hanna Ave Loft', en: 'Hanna Ave Loft' }, sub: { zh: 'Yuki M. · T2', en: 'Yuki M. · T2' } },
  { day: 5, start: 12, end: 14, type: 'block', title: { zh: 'Open House', en: 'Open House' }, sub: { zh: '432 Brunswick', en: '432 Brunswick' } },
  { day: 6, start: 10, end: 11.5, type: 'photo', title: { zh: 'Leslieville 拍照', en: 'Leslieville shoot' }, sub: { zh: '1162 Queen E', en: '1162 Queen E' } },
]

const TYPE_STYLE: Record<string, { bg: string; fg: string; bd: string }> = {
  showing: { bg: 'rgba(37,99,235,0.10)', fg: '#1E3A8A', bd: 'rgba(37,99,235,0.40)' },
  photo: { bg: 'rgba(124,58,237,0.10)', fg: '#5B21B6', bd: 'rgba(124,58,237,0.40)' },
  lease: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', bd: 'rgba(4,120,87,0.40)' },
  block: { bg: 'rgba(113,113,122,0.10)', fg: '#52525B', bd: 'rgba(113,113,122,0.30)' },
}

export default function AgentCalendarPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <WorkspaceShell role="agent" aside={<Aside />} hideAside>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
            {zh ? 'DAVID PARK · 第 20 周 · 5/11–5/17' : 'DAVID PARK · WEEK 20 · 5/11–5/17'}
          </div>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[32px]">
            {zh ? '本周 9 场带看 · $720 已锁' : '9 showings this week · $720 locked'}
          </h1>
          <p className="mt-1 text-[13.5px] text-body-2">{zh ? '绿 = 已完成 · 蓝 = 已确认 · 黄 = 等你接' : 'Green = done · Blue = confirmed · Yellow = awaiting you'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-[10px] border border-line-strong bg-white px-3 py-[8px] text-[12.5px] font-semibold">
            {zh ? '← 上周' : '← Last week'}
          </button>
          <button className="rounded-[10px] border border-ink bg-ink px-3 py-[8px] text-[12.5px] font-semibold text-white">
            {zh ? '本周' : 'This week'}
          </button>
          <button className="rounded-[10px] border border-line-strong bg-white px-3 py-[8px] text-[12.5px] font-semibold">
            {zh ? '下周 →' : 'Next week →'}
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="sl-card p-5">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '本周已完成' : 'Completed this week'}</div>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight" style={{ color: '#047857' }}>{zh ? '5 场' : '5'}</div>
          <div className="mt-0.5 text-[11.5px] text-brand">{zh ? '▲ 4 待评价' : '▲ 4 awaiting review'}</div>
        </div>
        <div className="sl-card p-5">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '本周已锁收入' : 'Income locked this week'}</div>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight">$720</div>
          <div className="mt-0.5 text-[11.5px] text-brand">{zh ? '▲ 比上周 +12%' : '▲ +12% vs last week'}</div>
        </div>
        <div className="sl-card p-5">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '本周 GTA WEST 排名' : 'GTA WEST rank this week'}</div>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight">#3 / 23</div>
          <div className="mt-0.5 text-[11.5px] text-body-3">{zh ? '距 Top 2 还 2 单' : '2 deals from Top 2'}</div>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[11.5px]">
        <Legend color="#1E3A8A" label={zh ? '看房' : 'Showing'} />
        <Legend color="#5B21B6" label={zh ? '拍照' : 'Photo shoot'} />
        <Legend color="#047857" label={zh ? '签字 / 关单' : 'Signing / closing'} />
        <Legend color="#52525B" label={zh ? '非客户时间' : 'Non-client time'} />
      </div>

      {/* Calendar grid */}
      <div className="sl-card overflow-x-auto">
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
              className="border-l border-line-divider px-2 py-3 text-center font-mono text-[11px] uppercase tracking-eyebrow text-body-2"
            >
              {d}
              <div className="text-[14px] font-bold text-body">{9 + i}</div>
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
              <div
                key={i}
                className="absolute overflow-hidden rounded-[6px] border px-2 py-1.5"
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
              </div>
            )
          })}
        </div>
        </div>
      </div>

      {/* Settlement section */}
      <div className="mt-6 sl-card p-5">
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {zh ? 'SETTLEMENT · 收款记录' : 'SETTLEMENT · Payment history'}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            { l: zh ? '本月已结' : 'Settled this month', v: '$2,760', c: '#047857' },
            { l: zh ? '本月待结' : 'Pending this month', v: '$320', c: '#B45309' },
            { l: zh ? 'YTD 总入' : 'YTD total', v: '$11,420', c: '#171717' },
            { l: zh ? '完成率' : 'Completion rate', v: '96%', c: '#047857' },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                {s.l}
              </div>
              <div className="mt-1 text-[22px] font-extrabold tracking-tight" style={{ color: s.c }}>
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WorkspaceShell>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono uppercase tracking-eyebrow text-body-3">
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      {label}
    </div>
  )
}

// reserved for future expansion
function Aside() {
  return null
}
