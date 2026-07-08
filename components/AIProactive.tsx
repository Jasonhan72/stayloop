'use client'

// The proactive-AI surface used across workspace feature pages: the user's
// own agent "notices" something on this page and offers to act. Every action
// deep-links into the role's console with ?prompt=<task>, which auto-sends —
// one tap and the AI is actually working, not just decorating the page.
import Link from 'next/link'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'
import type { AgentRole } from '@/lib/agent/types'

const HOME: Record<AgentRole, string> = {
  tenant: '/tenant/agent',
  landlord: '/landlord/agent',
  agent: '/agent/agent',
}

const THEME: Record<AgentRole, { accent: string; deep: string; orb: string; border: string; bg: string }> = {
  tenant: { accent: '#7C3AED', deep: '#4C1D95', orb: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)', border: 'rgba(124,58,237,0.22)', bg: 'rgba(124,58,237,0.05)' },
  landlord: { accent: '#047857', deep: '#064E3B', orb: 'radial-gradient(circle at 35% 35%, #6EE7B7, #047857 70%)', border: 'rgba(4,120,87,0.22)', bg: 'rgba(4,120,87,0.05)' },
  agent: { accent: '#2563EB', deep: '#1E3A8A', orb: 'radial-gradient(circle at 35% 35%, #93C5FD, #2563EB 70%)', border: 'rgba(37,99,235,0.22)', bg: 'rgba(37,99,235,0.05)' },
}

export type AIInsight = {
  // What the agent noticed on this page. `{ai}` is replaced with the
  // user's agent name.
  text: { zh: string; en: string }
  // Optional one-tap task: deep-links to the console and auto-sends.
  action?: { label: { zh: string; en: string }; prompt: { zh: string; en: string } }
  // Optional plain link action (navigate instead of prompting).
  link?: { label: { zh: string; en: string }; href: string }
}

export default function AIProactive({ role, insights }: { role: AgentRole; insights: AIInsight[] }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName(role)
  const t = THEME[role]
  if (!insights.length) return null

  const fill = (s: string) => s.replaceAll('{ai}', aiName)

  return (
    <div className="mb-6 rounded-xl border px-4 py-3.5" style={{ borderColor: t.border, background: t.bg }}>
      <div className="flex items-center gap-2">
        <span className="h-5 w-5 flex-none rounded-full" style={{ background: t.orb }} />
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow" style={{ color: t.accent }}>
          {zh ? `${aiName} 主动发现` : `${aiName} noticed`}
        </span>
        <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase text-body-3">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#34D399' }} />
          {zh ? '持续监测中' : 'watching'}
        </span>
      </div>
      <div className="mt-2.5 space-y-2.5">
        {insights.map((ins, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed" style={{ color: t.deep }}>
              {fill(ins.text[lang])}
            </p>
            {ins.action && (
              <Link
                href={`${HOME[role]}?prompt=${encodeURIComponent(fill(ins.action.prompt[lang]))}`}
                className="flex-none rounded-lg px-3.5 py-[7px] text-[12.5px] font-bold text-white transition active:translate-y-px"
                style={{ background: t.accent }}
              >
                {fill(ins.action.label[lang])} →
              </Link>
            )}
            {ins.link && (
              <Link
                href={ins.link.href}
                className="flex-none rounded-lg border bg-white px-3.5 py-[7px] text-[12.5px] font-bold transition"
                style={{ borderColor: t.border, color: t.accent }}
              >
                {fill(ins.link.label[lang])} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
