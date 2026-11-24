'use client'

import Link from 'next/link'
import Logo from './Logo'
import { useI18n } from '@/lib/i18n'
import { useAdmin } from '@/lib/useAdmin'
import { useHomeHref } from '@/lib/useHomeHref'
import { FOOTER_GROUPS } from '@/lib/nav/siteNav'

// The four columns come from lib/nav/siteNav.ts (2026-11-24): the 产品 column is the same list as the header's
// 「产品」 menu and the index on /platform, and what is not a product has a column of its own.
export default function Footer() {
  const home = useHomeHref()
  const { t, lang } = useI18n()
  const { role: adminRole } = useAdmin()
  return (
    <footer className="mt-24 border-t border-line-divider bg-surface-nav">
      <div className="mx-auto grid max-w-[1320px] grid-cols-[auto_1fr] gap-x-6 gap-y-10 px-5 py-12 sm:px-7 sm:py-14 lg:grid-cols-[1.3fr_repeat(4,1fr)] lg:gap-x-10 lg:px-8">
        {/* phones and tablets: brand spans the row, the four link groups sit two by two (the first column sized to its longest
            link, so no link splits — 'Repairs & services network' needs ~158px, more than half of a 320px screen);
            from `lg`: brand, then the four groups in a row */}
        <div className="col-span-2 lg:col-span-1">
          <Logo size="md" href={home.href} />
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-body-2">
            {t('foot.tag')}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="sl-eyebrow">EST. TORONTO</span>
            <span className="text-body-4">·</span>
            <span className="font-mono text-[10.5px] text-body-3">V0.8</span>
          </div>
        </div>
        {FOOTER_GROUPS.map((g) => (
          <div key={g.titleKey} className="min-w-0" data-testid={`foot-group-${g.titleKey.slice(5)}`}>
            <h4 className="sl-eyebrow text-body">{t(g.titleKey)}</h4>
            <ul className="mt-4 space-y-3">
              {g.links
                .filter((l) => l.key !== 'foot.admin' || adminRole)
                .map((l) => (
                <li key={l.key}>
                  <Link
                    href={l.href}
                    className="-my-2 inline-block whitespace-nowrap py-2 text-[13.5px] text-body-2 transition hover:text-brand"
                  >
                    {t(l.key)}
                  </Link>
                  {/* a page that is a demo from top to bottom says so wherever it is linked */}
                  {l.tag === 'demo' && <span className="ml-1.5 inline-block rounded-full border border-amber-300 px-1.5 py-px align-middle font-mono text-[9.5px] font-bold uppercase tracking-wider text-amber-700" data-testid="foot-demo-tag">{lang === 'zh' ? '示范' : 'demo'}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line-divider/60">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-5 py-4 text-[12px] text-body-3 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-8">
          <span>{t('foot.copy')}</span>
          <span className="font-mono">stayloop.ai · Toronto, ON</span>
        </div>
      </div>
    </footer>
  )
}
