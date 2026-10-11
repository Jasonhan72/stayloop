'use client'

// 租客保险 on the listing page — a quote entry like Zolo's "Home Insurance" card (user 2026-10-11:
// "租客保险是要能提供报价的功能"). Stayloop is not a licensed insurance broker and never quotes
// itself: the button opens a comparison site's tenant-insurance quote flow in a new tab.
// Default = Rates.ca's public tenant page (no agreement needed, no commission); an admin can point it
// at an affiliate / partner link via app_config 'tenant_insurance_referral' (same /api/config route as
// the move-in card). Facts only below the card; no price is ever stated here.
import { useEffect, useState } from 'react'
import { ListingSection } from '@/components/listing/ListingSection'

interface ReferralConfig { enabled: boolean; partner_name?: string; url?: string }

export const DEFAULT_QUOTE_PARTNER = { partner_name: 'Rates.ca', url: 'https://rates.ca/insurance-quotes/tenant' }

export function TenantInsuranceCard({ zh, province }: { zh: boolean; province: string }) {
  const [config, setConfig] = useState<ReferralConfig | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/config/tenant-insurance')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelled && json && json.enabled === true) setConfig(json) })
      .catch(() => { /* default partner on any failure */ })
    return () => { cancelled = true }
  }, [])
  const partner = config?.enabled && config.partner_name && config.url ? { partner_name: config.partner_name, url: config.url } : DEFAULT_QUOTE_PARTNER
  const on = province === 'ON'
  return (
    <ListingSection zh={zh} title={zh ? '租客保险' : 'Tenant insurance'} eyebrow="TENANT INSURANCE">
      <div className="rounded-[14px] bg-surface-2 p-5 sm:p-6" data-testid="tenant-insurance-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* house + shield, the same idea as the comparison sites' icon */}
          <span className="relative hidden h-14 w-14 shrink-0 sm:block" aria-hidden="true">
            <span className="absolute left-0 top-1 h-10 w-10 rounded-full bg-brand/20" />
            <svg viewBox="0 0 56 56" width="56" height="56" fill="none" stroke="#1B1B3C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="relative">
              <path d="M10 26 28 12l18 14" />
              <path d="M14 23v21h14" />
              <path d="M40 30c5 0 8 2 8 2v8c0 5-4 8-8 10-4-2-8-5-8-10v-8s3-2 8-2z" fill="#fff" />
              <path d="M36.5 40.5l2.5 2.5 5-5" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold tracking-tight text-ink">{zh ? '这套房源的租客保险要多少钱？' : 'What would it cost to insure this home?'}</div>
            <p className="mt-1 text-[14px] text-body-2">
              {zh ? `几分钟得到报价，在 ${partner.partner_name} 比较多家保险公司。` : `Find out in minutes. Compare providers at ${partner.partner_name}.`}
            </p>
            <p className="mt-1.5 text-[12px] text-body-3" data-testid="tenant-insurance-provider">
              {zh ? `报价由 ${partner.partner_name} 提供 · 第三方网站 · Stayloop 不承保、不参与理赔` : `Quotes by ${partner.partner_name} · third-party site · Stayloop does not underwrite or handle claims`}
            </p>
          </div>
          <a href={partner.url} target="_blank" rel="noopener noreferrer" className="sl-btn-secondary shrink-0 !px-6 !py-3 text-center text-[14px]" data-testid="tenant-insurance-partner">
            {zh ? '获取报价 ↗' : 'Get quotes ↗'}
          </a>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-body-3">
        {zh
          ? '租客保险通常覆盖你的个人财物与第三方责任；房东的楼宇保险不保你的东西。'
          : 'Tenant insurance usually covers your belongings and third-party liability; the landlord’s building policy does not cover your things.'}
        {on && (zh
          ? ' 安省标准租约第 11 条由房东勾选是否要求租客保险，要求时按索要出示凭证。'
          : ' Section 11 of the Ontario standard lease is where a landlord ticks whether it is required; if so, you show proof when asked.')}
      </p>
    </ListingSection>
  )
}
