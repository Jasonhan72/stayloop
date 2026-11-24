'use client'

import Link from 'next/link'
import Logo from './Logo'
import { useI18n } from '@/lib/i18n'
import { useAdmin } from '@/lib/useAdmin'
import { useHomeHref } from '@/lib/useHomeHref'
import { FOOTER_CELLS, type FooterGroup } from '@/lib/nav/siteNav'

// The five link groups come from lib/nav/siteNav.ts (2026-11-24): the 产品 group is the same list the product page
// presents; 房源 and 租客筛查 have a group of their own (常用入口), and so does what is not a product (资源).
export default function Footer() {
  const home = useHomeHref()
  const { t, lang } = useI18n()
  const { role: adminRole } = useAdmin()
  const group = (g: FooterGroup) => (
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
  )
  return (
    <footer className="mt-24 border-t border-line-divider bg-surface-nav">
      <div className="mx-auto grid max-w-[1320px] grid-cols-[auto_1fr] gap-x-6 gap-y-10 px-5 py-12 sm:px-7 sm:py-14 lg:grid-cols-[1.3fr_0.8fr_0.8fr_1.1fr_0.9fr] lg:gap-x-10 lg:px-8 xl:grid-cols-[1.4fr_1.3fr_0.8fr_0.8fr_1.1fr_0.9fr]">
        {/* phones and tablets: brand spans the row, the link groups sit two by two (the first column sized to its longest
            link, so no link splits — 'Repairs & services network' needs ~158px, more than half of a 320px screen), the two
            short groups sharing one cell;
            `lg`: brand on a row of its own, then the five groups in a row (five columns and the brand do not fit 1024);
            `xl`: brand and the five groups in one row */}
        <div className="col-span-2 lg:col-span-5 xl:col-span-1">
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
        {FOOTER_CELLS.map((cell) => cell.length === 1 ? group(cell[0]) : (
          <div key={cell[0].titleKey + '-cell'} className="grid min-w-0 content-start gap-y-10 lg:contents" data-testid="foot-cell-pair">
            {cell.map(group)}
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
