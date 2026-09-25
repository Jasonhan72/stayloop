'use client'

// The current hat as a text label beside the assistant's avatar (user
// 2026-09-25: "角色的标记可以放在 avatar 这里，不用图标，就是文字标记就可以了").
// It replaces the emoji chip that sat at the bottom of the icon rail. Text
// only — no emoji, no icon — tinted with the hat's identity colour; clicking
// it opens the same small hat switcher the rail chip had: held hats switch in
// place, missing ones link to their door (the rules the Header uses).
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { useT } from '@/lib/i18n'
import { isRegistrationLive } from '@/lib/agentProfile'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { AgentRole } from '@/lib/agent/types'

export const HAT_LABEL: Record<AgentRole, { zh: string; en: string }> = {
  tenant: { zh: '租客', en: 'Tenant' }, landlord: { zh: '房东', en: 'Landlord' }, agent: { zh: '经纪', en: 'Agent' },
}

export default function HatChip({ role, className = '' }: { role: AgentRole; className?: string }) {
  const { lang } = useT()
  const en = lang === 'en'
  const auth = useAuth()
  const hats = useHats()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const held = (r: AgentRole) => (r === 'tenant' ? true : r === 'landlord' ? hats.landlord : hats.agent !== null)
  const switchTo = (r: AgentRole) => { setOpen(false); auth.setRole(r); router.push(`/${r}/agent`) }
  const name = (r: AgentRole) => (en ? HAT_LABEL[r].en : HAT_LABEL[r].zh)
  const title = en ? `Identity: ${name(role)} · switch` : `身份：${name(role)} · 点击切换`
  const row = 'flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-surface'
  return (
    <div ref={ref} className={`relative inline-flex justify-center ${className}`} data-testid="hat-chip">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={title}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-full px-2.5 py-[2px] text-[11.5px] font-bold leading-[18px] tracking-wide ring-1 ring-transparent transition hover:ring-line-strong"
        style={{ background: ROLE_THEME[role].lightRgba, color: ROLE_THEME[role].accent }}
      >
        {name(role)}
      </button>
      {open && (
        <div role="menu" className="absolute left-1/2 top-full z-50 mt-1.5 w-[220px] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-white py-1 text-left shadow-xl">
          <div className="px-3 pb-1 pt-2 font-mono text-[10.5px] font-bold uppercase tracking-[.12em] text-body-3">{en ? 'Identity' : '身份'}</div>
          {(['tenant', 'landlord', 'agent'] as const).map((r) => {
            const isCurrent = r === role
            const has = held(r)
            const pendingAgent = r === 'agent' && hats.agent && !isRegistrationLive(hats.agent)
            const inner = (
              <>
                <span className="flex-1 text-[13.5px] font-semibold text-ink">{name(r)}</span>
                {isCurrent
                  ? <span className="rounded-full px-2 py-[1px] text-[11px] font-bold" style={{ background: ROLE_THEME[r].lightRgba, color: ROLE_THEME[r].accent }}>{en ? 'current' : '当前'}</span>
                  : pendingAgent
                    ? <span className="rounded-full bg-amber-50 px-2 py-[1px] text-[11px] font-bold text-amber-800">{en ? 'pending' : '待认证'}</span>
                    : !has
                      ? <span className="rounded-full border border-line px-2 py-[1px] text-[11px] font-semibold text-body-3">{en ? 'add' : '开通'}</span>
                      : <span className="text-body-3">›</span>}
              </>
            )
            // A menu may only contain menu items — the current hat is a disabled one, not a bare div.
            if (isCurrent) return <div key={r} role="menuitem" aria-disabled="true" aria-current="true" className={row}>{inner}</div>
            if (has) return <button key={r} type="button" role="menuitem" onClick={() => switchTo(r)} className={row}>{inner}</button>
            return <Link key={r} role="menuitem" href={r === 'landlord' ? '/onboarding/name?role=landlord' : '/agent/verify'} onClick={() => setOpen(false)} className={row}>{inner}</Link>
          })}
        </div>
      )}
    </div>
  )
}
