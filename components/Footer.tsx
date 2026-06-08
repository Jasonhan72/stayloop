'use client'

import Link from 'next/link'
import Logo from './Logo'
import { useI18n } from '@/lib/i18n'

interface Group {
  titleKey: string
  links: Array<{ key: string; href: string }>
}

const GROUPS: Group[] = [
  {
    titleKey: 'foot.product',
    links: [
      { key: 'foot.pricing', href: '/pricing' },
      { key: 'foot.trustApi', href: '/trust-api' },
      { key: 'foot.screening', href: '/screening' },
      { key: 'foot.passport', href: '/tenant/passport' },
    ],
  },
  {
    titleKey: 'foot.forWhom',
    links: [
      { key: 'foot.tenants', href: '/tenant' },
      { key: 'foot.landlords', href: '/landlord' },
      { key: 'foot.agents', href: '/agent' },
      { key: 'foot.partners', href: '/partners' },
    ],
  },
  {
    titleKey: 'foot.company',
    links: [
      { key: 'foot.about', href: '/about' },
      { key: 'foot.privacy', href: '/privacy' },
      { key: 'foot.terms', href: '/terms' },
      { key: 'foot.contact', href: '/contact' },
    ],
  },
]

export default function Footer() {
  const { t } = useI18n()
  return (
    <footer className="mt-24 border-t border-line-divider bg-surface-nav">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-14 sm:px-7 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-14 lg:px-8">
        <div>
          <Logo size="md" />
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-body-2">
            {t('foot.tag')}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="sl-eyebrow">EST. TORONTO</span>
            <span className="text-body-4">·</span>
            <span className="font-mono text-[10.5px] text-body-3">v5.3</span>
          </div>
        </div>
        {GROUPS.map((g) => (
          <div key={g.titleKey}>
            <h4 className="sl-eyebrow text-body">{t(g.titleKey)}</h4>
            <ul className="mt-4 space-y-3">
              {g.links.map((l) => (
                <li key={l.key}>
                  <Link
                    href={l.href}
                    className="text-[13.5px] text-body-2 transition hover:text-brand"
                  >
                    {t(l.key)}
                  </Link>
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
