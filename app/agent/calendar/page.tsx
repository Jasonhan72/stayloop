'use client'

import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5 ART 36 · Agent · Calendar
 * Week view (Mon–Sun) with showings, photo shoots, lease signings.
 */

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

interface Slot {
  day: number // 0=Mon
  start: number
  end: number
  type: 'showing' | 'photo' | 'lease' | 'block'
  title: string
  sub: string
}

const SLOTS: Slot[] = [
  { day: 0, start: 10, end: 11, type: 'showing', title: 'Brunswick Ave', sub: 'Anna L. · T3' },
  { day: 0, start: 14, end: 15, type: 'photo', title: '88 Harbour 拍照', sub: 'New listing' },
  { day: 1, start: 11, end: 12, type: 'showing', title: 'CityPlace 4502', sub: 'Lisa W. · T4' },
  { day: 1, start: 16, end: 17, type: 'lease', title: 'Form 400 签字', sub: 'Mike Park 续约' },
  { day: 2, start: 9, end: 11, type: 'block', title: '区域走访', sub: 'Yorkville' },
  { day: 2, start: 14, end: 15.5, type: 'showing', title: '155 Cumberland', sub: 'Eric K. · T4' },
  { day: 3, start: 10, end: 11, type: 'showing', title: '210 Sumach', sub: 'Sophie B. · T1' },
  { day: 3, start: 13, end: 14, type: 'showing', title: 'Distillery 1207', sub: 'David Z. · T3' },
  { day: 4, start: 11, end: 12, type: 'showing', title: 'Hanna Ave Loft', sub: 'Yuki M. · T2' },
  { day: 5, start: 12, end: 14, type: 'block', title: 'Open House', sub: '432 Brunswick' },
  { day: 6, start: 10, end: 11.5, type: 'photo', title: 'Leslieville 拍照', sub: '1162 Queen E' },
]

const TYPE_STYLE: Record<string, { bg: string; fg: string; bd: string }> = {
  showing: { bg: 'rgba(37,99,235,0.10)', fg: '#1E3A8A', bd: 'rgba(37,99,235,0.40)' },
  photo: { bg: 'rgba(124,58,237,0.10)', fg: '#5B21B6', bd: 'rgba(124,58,237,0.40)' },
  lease: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', bd: 'rgba(4,120,87,0.40)' },
  block: { bg: 'rgba(113,113,122,0.10)', fg: '#52525B', bd: 'rgba(113,113,122,0.30)' },
}

export default function AgentCalendarPage() {
  return (
    <WorkspaceShell role="agent" aside={<Aside />} hideAside>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
            AGENT · CALENDAR
          </div>
          <h1 className="mt-2 text-[32px] font-bold tracking-tight">本周排期</h1>
          <p className="mt-1 text-[13.5px] text-body-2">5/9 – 5/15 · 11 个日程 · Brief 自动避开冲突</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-[10px] border border-line-strong bg-white px-3 py-[8px] text-[12.5px] font-semibold">
            ← 上周
          </button>
          <button className="rounded-[10px] border border-ink bg-ink px-3 py-[8px] text-[12.5px] font-semibold text-white">
            本周
          </button>
          <button className="rounded-[10px] border border-line-strong bg-white px-3 py-[8px] text-[12.5px] font-semibold">
            下周 →
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[11.5px]">
        <Legend color="#1E3A8A" label="看房" />
        <Legend color="#5B21B6" label="拍照" />
        <Legend color="#047857" label="签字 / 关单" />
        <Legend color="#52525B" label="非客户时间" />
      </div>

      {/* Calendar grid */}
      <div className="sl-card overflow-hidden">
        {/* Day header */}
        <div
          className="grid border-b border-line-divider bg-surface-chip"
          style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}
        >
          <div />
          {DAYS.map((d, i) => (
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
              {DAYS.map((_, di) => (
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
                <div className="truncate text-[11.5px] font-bold">{s.title}</div>
                <div className="truncate text-[10.5px] opacity-80">{s.sub}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Week summary */}
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          { l: '看房', v: 6, c: '#1E3A8A' },
          { l: '拍照', v: 2, c: '#5B21B6' },
          { l: '签字 / 续约', v: 1, c: '#047857' },
          { l: 'Open House', v: 1, c: '#B45309' },
        ].map((s) => (
          <div key={s.l} className="sl-card p-4">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {s.l}
            </div>
            <div className="mt-1 text-[24px] font-extrabold" style={{ color: s.c }}>
              {s.v}
            </div>
          </div>
        ))}
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
