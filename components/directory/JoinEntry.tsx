'use client'

// 「申请加入」 in the header of 「找经纪和服务商」 (2026-11-23, user: 「这个板块是否需要加一个功能，让用户可以申请
// 加入 stayloop，成为服务商」). The three ways in already existed — the agent's verification page and
// the two provider onboarding pages — but from this section they were a grey line at the very bottom
// of two tabs, and nothing at all on the agents tab unless its list was empty. This is one door, in
// the same place on every tab: a button that opens the three kinds, each going to its own form.
// It adds no application flow of its own: a submitted record is still checked by staff before it is
// listed, and holding a record already only changes what the link is called.
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { useHats } from '@/lib/useHats'
import { onboardHref } from '@/lib/marketplace/onboardKind'
import type { FindTab } from './FindHeader'

type Words = { zh: string; en: string }

/** Where each kind applies, by the tab it is listed under. `mine` is the link's name for someone who already has a record. */
export const JOIN_WAYS: Record<FindTab, { href: string; desc: Words; cta: Words; mine: Words }> = {
  agents: {
    href: '/agent/verify',
    desc: { zh: '持牌的租赁经纪：提交注册信息，核验后可以开公开主页', en: 'Registered leasing agents: submit your registration, then publish a profile once it is verified' },
    cta: { zh: '去认证', en: 'Get verified' },
    mine: { zh: '管理认证与主页', en: 'Manage my profile' },
  },
  repairs: {
    href: onboardHref('repair'),
    desc: { zh: '水管、电气、供暖、门锁、清洁等会接派单的工种', en: 'Plumbing, electrical, heating, locks, cleaning and other dispatched trades' },
    cta: { zh: '申请入驻', en: 'Apply to join' },
    mine: { zh: '打开我的资料', en: 'Open my profile' },
  },
  professional: {
    href: onboardHref('professional'),
    desc: { zh: 'Paralegal、律师、保险经纪、房源摄影', en: 'Paralegals, lawyers, insurance brokers, listing photographers' },
    cta: { zh: '申请入驻', en: 'Apply to join' },
    mine: { zh: '打开我的资料', en: 'Open my profile' },
  },
}

export default function JoinEntry({ zh, tabs }: { zh: boolean; tabs: { key: FindTab; zh: string; en: string }[] }) {
  const hats = useHats()
  // Closed on the server and on first paint; who the viewer is only renames links inside the panel.
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  // one provider record per account covers both provider kinds
  const has = (k: FindTab) => (k === 'agents' ? !!hats.agent : !!hats.provider)
  const L = zh ? 'zh' : 'en'
  return (
    <div ref={box} className="relative flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-none sm:justify-end" data-testid="find-join">
      <span className="text-[13.5px] text-body-2">{zh ? '你是经纪或服务商？' : 'Are you an agent or a provider?'}</span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="sl-btn-secondary flex min-h-[44px] items-center !px-4 !py-0 !text-[14px]"
        data-testid="find-join-toggle"
      >
        {zh ? '申请加入' : 'Apply to join'}
      </button>
      {open && (
        // in the flow on a phone (it pushes the tabs down); a panel under the button from `sm` up
        <div id={panelId} className="w-full rounded-2xl border border-line-divider bg-white p-4 text-left shadow-lg sm:absolute sm:right-0 sm:top-full sm:z-20 sm:mt-2 sm:w-[420px]" data-testid="find-join-panel">
          <p className="text-[13px] leading-relaxed text-body-2">
            {zh
              ? '选你的类别，到对应的页面填资料。提交后由 Stayloop 工作人员人工核验，通过后出现在目录里。'
              : 'Pick your kind and fill in its form. Stayloop staff check each application by hand; you appear in the directory once it passes.'}
          </p>
          <ul className="mt-3 grid gap-2">
            {tabs.map((t) => {
              const w = JOIN_WAYS[t.key]
              return (
                <li key={t.key}>
                  <Link href={w.href} className="flex min-h-[44px] items-center gap-3 rounded-xl border border-line-divider px-3 py-2.5 transition hover:border-brand" data-testid={`find-join-${t.key}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-body">{t[L]}</span>
                      {/* keep-all: a Chinese line breaks at its 、，： only, so a phone never leaves one character alone on the last line */}
                      <span className="block break-keep text-[12.5px] leading-snug text-body-3">{w.desc[L]}</span>
                    </span>
                    <span className="flex-none text-[13px] font-semibold text-brand">{(has(t.key) ? w.mine : w.cta)[L]} →</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
