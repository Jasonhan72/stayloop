'use client'

// 「找经纪和服务商」 (2026-11-16, design/find-directory-2026-11-16.md): one section, three tabs,
// three real addresses — /agents (public), /providers (物业管理服务, signed in), /providers/professional
// (signed in). The middle tab was 「维修服务」 until 2026-11-23, when the user renamed this kind of
// provider everywhere (lib/marketplace/onboardKind.ts); its key and test id stay `repairs`. Every hat reaches it from the workspace rail, the avatar menu and the footer; the
// header row is unchanged. This component is the shared title + tab bar; each page puts its own
// sub-heading, intro and filters underneath as children.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useT } from '@/lib/i18n'

export type FindTab = 'agents' | 'repairs' | 'professional'

/** The section's landing address — what the rail, the avatar menu and the footer link to. */
export const FIND_HREF = '/agents'

export const FIND_TABS: { key: FindTab; href: string; zh: string; en: string }[] = [
  { key: 'agents', href: '/agents', zh: '经纪', en: 'Agents' },
  { key: 'repairs', href: '/providers', zh: '物业管理服务', en: 'Property maintenance' },
  { key: 'professional', href: '/providers/professional', zh: '专业服务', en: 'Professionals' },
]

/** A 「测试数据」 chip for rows whose name carries the seeded "[TEST]" prefix. */
export function TestDataTag({ zh }: { zh: boolean }) {
  return <span data-testid="test-data-tag" className="rounded-full border border-amber-200 bg-amber-50 px-2 py-[1px] text-[11px] font-semibold text-amber-800">{zh ? '测试数据' : 'Test data'}</span>
}

export default function FindHeader({ active, children }: { active: FindTab; children?: ReactNode }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  // The three Chinese names fit across a 360px phone as they are and never wrap. The English ones do
  // not since the middle tab became 「Property maintenance」 (2026-11-23): below `sm` the English tabs
  // are tighter and may shrink, so the two-word name folds onto two lines — the other two are single
  // words and keep their width — instead of pushing 「Professionals」 off the screen.
  const fit = zh
    ? 'flex-none whitespace-nowrap px-4 text-[15px]'
    : 'px-3 text-center text-[14px] leading-[1.15] sm:flex-none sm:whitespace-nowrap sm:px-4 sm:text-[15px]'
  return (
    <section style={{ background: 'linear-gradient(180deg,#EFF4FF 0%,#FFFFFF 100%)' }}>
      <div className="mx-auto max-w-[1320px] px-6 pb-8 pt-12 sm:px-8 lg:px-12">
        <h1 className="sl-type-head text-[clamp(26px,3.2vw,38px)] font-semibold leading-[1.15] tracking-[-0.02em]" data-testid="find-title">
          {zh ? '找经纪和服务商' : 'Find agents and service providers'}
        </h1>
        <p className="mt-2 max-w-[720px] text-[14.5px] leading-[1.6] text-body-2" data-testid="find-note">
          {zh ? 'Stayloop 只做展示与转介，不抽成，费用由你和对方直接谈。' : 'Stayloop only lists and refers. It takes no commission; fees are between you and them.'}
        </p>
        <nav className="mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line-divider" aria-label={zh ? '找经纪和服务商' : 'Find agents and service providers'} data-testid="find-tabs">
          {FIND_TABS.map((t) => {
            const on = t.key === active
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={on ? 'page' : undefined}
                data-testid={`find-tab-${t.key}`}
                className={`flex min-h-[44px] items-center border-b-2 font-semibold transition ${fit} ` + (on ? 'border-[#1B1B3C] text-body' : 'border-transparent text-body-2 hover:text-body')}
              >
                {zh ? t.zh : t.en}
              </Link>
            )
          })}
        </nav>
        {children ? <div className="mt-7">{children}</div> : null}
      </div>
    </section>
  )
}
