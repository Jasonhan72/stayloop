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

/** Cities listed on a card before the rest collapse into “+N”. */
export const CITIES_ON_CARD = 4

export type ProviderCardChip = { key: string; label: string; ok: boolean }

export default function ProviderCard({ id, name, legalName, zh, badge, rating, chips, cities, detail, email, phone, testid = 'provider-card' }: {
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
  testid?: string
}) {
  const href = providerHref(id)
  const registered = legalName && legalName.trim() && legalName.trim() !== name ? legalName.trim() : null
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line-divider bg-white p-5" data-testid={testid}>
      <div className="flex items-start gap-4">
        {/* The name beside it is the link; the avatar repeats it for pointer users only. */}
        <Link href={href} tabIndex={-1} aria-hidden className="shrink-0"><ProviderAvatar name={name} size={88} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href} className="min-w-0 break-words text-[17px] font-bold hover:underline" data-testid="provider-card-name">{name}</Link>
            {isTestName(name) && <TestDataTag zh={zh} />}
          </div>
          {registered && <div className="break-words text-[13px] text-body-2" data-testid="provider-card-legal">{zh ? '注册名：' : 'Registered as '}{registered}</div>}
          {rating != null && <div className="text-[13px] text-body-2" data-testid="provider-rating">{rating}</div>}
          <div className="mt-2">
            <span className={'inline-block rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ' + (badge.ok ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-amber-50 text-amber-800')} data-testid="provider-card-badge">{badge.label}</span>
          </div>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="provider-card-chips">
          {chips.map((c) => (
            <span key={c.key} className={'rounded-full px-2.5 py-[2px] text-[12px] ' + (c.ok ? 'bg-[#FFF3EA] font-semibold text-[#9A3412]' : 'bg-amber-50 text-amber-800')}>
              {c.label}{c.ok ? '' : (zh ? ' · 资质待补' : ' · credentials pending')}
            </span>
          ))}
        </div>
      )}
      {cities.length > 0 && (
        <div className="mt-2 text-[12.5px] text-body-2" data-testid="provider-card-cities">
          {zh ? '服务城市：' : 'Serves: '}{cities.slice(0, CITIES_ON_CARD).join(' · ')}{cities.length > CITIES_ON_CARD ? ` +${cities.length - CITIES_ON_CARD}` : ''}
        </div>
      )}
      {detail && <div className="mt-1 text-[12px] text-body-3" data-testid="provider-card-detail">{detail}</div>}
      {(email || phone) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-divider pt-3 text-[13px]" data-testid="provider-card-contact">
          {email && <a href={`mailto:${email}`} className="break-all text-brand underline-offset-2 hover:underline">{email}</a>}
          {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="whitespace-nowrap text-brand underline-offset-2 hover:underline">{phone}</a>}
        </div>
      )}
      <div className="mt-auto flex gap-2 pt-4">
        <Link href={href} className="flex min-h-[42px] flex-1 items-center justify-center rounded-xl border border-line-strong px-4 text-[13.5px] font-semibold text-body transition hover:border-[#C2410C]" data-testid="provider-card-view">{zh ? '看主页' : 'View profile'}</Link>
        <Link href={`${href}#contact`} className="sl-btn-primary flex min-h-[42px] flex-1 items-center justify-center !px-4 !py-0 !text-[13.5px]" data-testid="provider-card-message">{zh ? '发消息' : 'Message'}</Link>
      </div>
    </article>
  )
}
