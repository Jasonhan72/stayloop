'use client'

import Link from 'next/link'
import { dataNoticeText } from '@/lib/listings/dataNotice'

/** Bottom-of-page notice on /listings and /listings/[slug]: reliability, sources, copyright, terms link. */
export default function ListingDataNotice({ zh, className = '' }: { zh: boolean; className?: string }) {
  const t = dataNoticeText(zh)
  return (
    <aside
      className={`rounded-[12px] border border-line bg-white/70 px-4 py-3 text-[12px] leading-relaxed text-body-3 ${className}`}
      data-testid="listing-data-notice"
    >
      <p>{t.reliability}</p>
      <p className="mt-1">{t.sources}</p>
      <p className="mt-1">
        {t.copyright}{' '}
        <Link href="/terms" className="underline hover:text-ink">{zh ? '房源信息使用规则 →' : 'Listing-data rules →'}</Link>
      </p>
    </aside>
  )
}
