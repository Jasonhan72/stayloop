'use client'

// Human-readable memory panel. Preferences / profile / constraints show as
// typed, colored rows; machine-state memories (workflow flags, raw URLs,
// pending_* markers) are folded away behind a count so the rail never reads
// like a database dump.
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { MemoryItem } from '@/lib/agent/types'
import { formatMemoryValue } from '@/lib/agent/memory'

const TYPE_META: Record<string, { zh: string; en: string; color: string }> = {
  preference: { zh: '偏好', en: 'PREF', color: '#7C3AED' },
  profile: { zh: '档案', en: 'PROFILE', color: '#2563EB' },
  constraint: { zh: '约束', en: 'LIMIT', color: '#B45309' },
  semantic: { zh: '事实', en: 'FACT', color: '#047857' },
  system: { zh: '系统', en: 'SYS', color: '#71717A' },
}

const MACHINE_VALUE = /pending_[a-z_]+|draft_ready|_confirmation|^(true|false)$/i
const MACHINE_KEY = /_status$|_confirmation$|_url$|_source$|_state$/i
const URL_RE = /https?:\/\/[^\s,;，、]+/g

function isMachine(m: MemoryItem): boolean {
  if (m.memory_type === 'system') return true
  const v = formatMemoryValue(m)
  return MACHINE_KEY.test(m.key) || MACHINE_VALUE.test(v) || (v.match(URL_RE)?.join('').length || 0) > v.length * 0.5
}

// Raw URLs read as noise — collapse each to its host.
function humanize(v: string): string {
  const cleaned = v.replace(URL_RE, (u) => {
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
  }).replace(/\s*[·,;，、]\s*(?=[·,;，、]|$)/g, '').trim()
  return cleaned.length > 110 ? cleaned.slice(0, 110) + '…' : cleaned
}

const VISIBLE_CAP = 6

export default function PrivateMemorySnapshot({
  agentName,
  memories,
}: {
  agentName: string
  memories: MemoryItem[]
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [expanded, setExpanded] = useState(false)

  const human = memories.filter((m) => !isMachine(m))
  const machine = memories.length - human.length
  const shown = expanded ? human : human.slice(0, VISIBLE_CAP)
  const hidden = human.length - shown.length

  return (
    <div className="sl-card p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {zh ? `${agentName} 记得 · 关于你` : `${agentName} REMEMBERS`}
        </h4>
        {human.length > 0 && (
          <span className="rounded-full px-2 py-[2px] font-mono text-[10px] font-bold" style={{ background: 'rgba(124,58,237,0.08)', color: '#7C3AED' }}>
            {human.length}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2.5">
        {human.length === 0 && (
          <p className="text-[12.5px] leading-relaxed text-body-3">
            {zh
              ? `还没有记忆。直接开聊 —— 预算、区域、偏好,${agentName} 说一次就记住。`
              : `No memories yet. Just start talking — budget, area, preferences: say it once and ${agentName} remembers.`}
          </p>
        )}
        {shown.map((m) => {
          const meta = TYPE_META[m.memory_type] || TYPE_META.semantic
          return (
            <div key={`${m.memory_type}:${m.key}`} className="flex items-start gap-2.5">
              <span
                className="mt-[3px] flex-none rounded px-1.5 py-[2px] font-mono text-[9px] font-bold"
                style={{ background: `${meta.color}14`, color: meta.color }}
              >
                {zh ? meta.zh : meta.en}
              </span>
              <div className="min-w-0">
                <span className="text-[12.5px] font-bold leading-snug">{m.label}</span>
                <span className="ml-1.5 text-[12.5px] leading-snug text-body-2">{humanize(formatMemoryValue(m))}</span>
              </div>
            </div>
          )
        })}
      </div>

      {(hidden > 0 || expanded) && human.length > VISIBLE_CAP && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-[12px] font-semibold text-brand hover:underline"
        >
          {expanded ? (zh ? '收起' : 'Show less') : zh ? `展开全部 ${human.length} 条 →` : `Show all ${human.length} →`}
        </button>
      )}

      <p className="mt-3 border-t border-dashed border-line-divider pt-3 font-mono text-[10px] leading-relaxed text-body-4">
        {machine > 0 && (zh ? `另有 ${machine} 条工作状态记忆(系统用) · ` : `${machine} working-state memories (system) · `)}
        {zh ? '仅你可见 · 锁定到你的账户' : 'Visible only to you · locked to your account'}
      </p>
    </div>
  )
}
