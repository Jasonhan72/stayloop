// One card for both service-provider tabs (维修服务 / 专业服务), laid out like the agent card
// (app/agents/page.tsx) since 2026-11-22: a square avatar, the name as the link to the provider's
// page, the verification badge, the trades as chips, where they work, and the same two buttons —
// 看主页 and 发消息. The credential list and the website are on the provider's page
// (/providers/<id>), which is where 发消息 lands too. The e-mail address and the phone number are
// on the card as well as on the page: they were moved off the card with the redesign and the user
// asked for them back the same day (「卡片上也要」) — a landlord looking for a plumber wants the
// number without a second click.
import Link from 'next/link'
import type { ReactNode } from 'react'
import ProviderAvatar from '@/components/directory/ProviderAvatar'
import { TestDataTag } from '@/components/directory/FindHeader'
import { isTestName } from '@/components/listing/testAccounts'
import { providerHref } from '@/lib/marketplace/directory'
import { languageLabel } from '@/lib/agentPublic'
import { FilterIcon } from '@/components/directory/FilterBar'
import { CARD, CARD_FACT, CARD_FOOT, CARD_MESSAGE, CARD_META, CARD_NAME, CARD_VIEW, CHIP, CHIP_QUIET } from '@/components/directory/cardStyle'

/** Cities listed on a card before the rest collapse into “+N”. */
export const CITIES_ON_CARD = 4

export type ProviderCardChip = { key: string; label: string; ok: boolean }

export default function ProviderCard({ id, name, legalName, zh, badge, rating, chips, cities, detail, email, phone, photoUrl, languages, testid = 'provider-card' }: {
  id: string
  /** the name the provider goes by */
  name: string
  /** the registered name, shown on its own line when it differs from `name` */
  legalName?: string | null
  zh: boolean
  /** 资质已核 · 日期 / 牌照已核 / 牌照待核或已过期 */
  badge: { ok: boolean; label: string }
  /** ★ 4.5 (2) or 还没有评价; omitted where reviews do not apply (professional services are never dispatched) */
  rating?: ReactNode
  chips: ProviderCardChip[]
  cities: string[]
  /** one more grey line under the cities: how they charge, or which licence was checked */
  detail?: string | null
  /** the provider's own contact details, as they entered them */
  email?: string | null
  phone?: string | null
  /** the photo or logo they uploaded; without one the initial shows */
  photoUrl?: string | null
  /** language codes (the agent profile's list) */
  languages?: string[] | null
  testid?: string
}) {
  const href = providerHref(id)
  const registered = legalName && legalName.trim() && legalName.trim() !== name ? legalName.trim() : null
  const langs = languages ?? []
  return (
    <article className={CARD} data-testid={testid}>
      <div className="flex items-start gap-4">
        {/* The name beside it is the link; the avatar repeats it for pointer users only. */}
        <Link href={href} tabIndex={-1} aria-hidden className="shrink-0"><ProviderAvatar name={name} size={72} photoUrl={photoUrl} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href} className={`${CARD_NAME} transition hover:text-brand`} data-testid="provider-card-name">{name}</Link>
            {isTestName(name) && <TestDataTag zh={zh} />}
          </div>
          {registered && <div className={`mt-0.5 break-words ${CARD_META}`} data-testid="provider-card-legal">{zh ? '注册名：' : 'Registered as '}{registered}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={'inline-block rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ' + (badge.ok ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-amber-50 text-amber-800')} data-testid="provider-card-badge">{badge.label}</span>
            {rating != null && <span className={CARD_META} data-testid="provider-rating">{rating}</span>}
          </div>
        </div>
      </div>
      {(chips.length > 0 || langs.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5" data-testid="provider-card-chips">
          {chips.map((c) => (
            <span key={c.key} className={c.ok ? `${CHIP} bg-[#FFF1E6] text-[#9A3412]` : 'rounded-full bg-amber-50 px-2.5 py-[3px] text-[12px] leading-none text-amber-800'}>
              {c.label}{c.ok ? '' : (zh ? ' · 资质待补' : ' · credentials pending')}
            </span>
          ))}
          {langs.map((c) => <span key={`l-${c}`} className={CHIP_QUIET} data-testid="provider-card-language">{languageLabel(c, zh ? 'zh' : 'en')}</span>)}
        </div>
      )}
      {cities.length > 0 && (
        <div className={`mt-3 ${CARD_FACT}`} data-testid="provider-card-cities">
          <span className="mt-[3px] text-body-3">{FilterIcon.pin}</span>
          <span className="min-w-0">{zh ? '服务城市：' : 'Serves: '}{cities.slice(0, CITIES_ON_CARD).join(' · ')}{cities.length > CITIES_ON_CARD ? ` +${cities.length - CITIES_ON_CARD}` : ''}</span>
        </div>
      )}
      {detail && <div className="mt-1.5 text-[12px] leading-relaxed text-body-3" data-testid="provider-card-detail">{detail}</div>}
      <div className={CARD_FOOT}>
        {/* The contact details and the two actions share the foot: the address and number on the left, the buttons on the right. */}
        <div className="flex flex-col gap-3 border-t border-line-divider pt-4 sm:flex-row sm:items-center sm:justify-between">
          {(email || phone) ? (
            <div className="flex min-w-0 flex-col gap-0.5 text-[13px]" data-testid="provider-card-contact">
              {email && <a href={`mailto:${email}`} className="break-all text-brand underline-offset-2 hover:underline">{email}</a>}
              {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="whitespace-nowrap text-brand underline-offset-2 hover:underline">{phone}</a>}
            </div>
          ) : <span />}
          <div className="flex flex-none gap-2">
            <Link href={href} className={CARD_VIEW} data-testid="provider-card-view">{zh ? '看主页' : 'View profile'}</Link>
            <Link href={`${href}#contact`} className={CARD_MESSAGE} data-testid="provider-card-message">{zh ? '发消息' : 'Message'}</Link>
          </div>
        </div>
      </div>
    </article>
  )
}
