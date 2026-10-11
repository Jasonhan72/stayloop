'use client'

// 租客保险 on the listing page (2026-10-10, user asked for it beside the rent history).
// Facts only: what tenant insurance covers and, for Ontario, that the standard lease's
// section 11 is where a landlord may require it. A partner link appears only when an admin
// has enabled the referral in app_config (same /api/config/tenant-insurance as the move-in
// card); Stayloop takes no commission and does not underwrite — nothing here quotes a price.
import { useEffect, useState } from 'react'
import { ListingSection } from '@/components/listing/ListingSection'

interface ReferralConfig { enabled: boolean; partner_name?: string; url?: string }

export function TenantInsuranceCard({ zh, province }: { zh: boolean; province: string }) {
  const [config, setConfig] = useState<ReferralConfig | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/config/tenant-insurance')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelled && json && json.enabled === true) setConfig(json) })
      .catch(() => { /* hidden on any failure */ })
    return () => { cancelled = true }
  }, [])
  const partner = config?.enabled && config.partner_name && config.url ? config : null
  const on = province === 'ON'
  return (
    <ListingSection zh={zh} title={zh ? '租客保险' : 'Tenant insurance'} eyebrow="TENANT INSURANCE">
      <div className="rounded-[12px] border border-line-divider bg-white p-4 sm:p-5" data-testid="tenant-insurance-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink">{zh ? '住进来前，要不要买租客保险？' : 'Do you need tenant insurance before you move in?'}</div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-body-2">
              {zh
                ? '租客保险通常覆盖你的个人财物（火灾、水损、盗窃）和第三方责任（例如漏水殃及楼下）。房东的楼宇保险不保你的东西。'
                : 'Tenant insurance usually covers your belongings (fire, water damage, theft) and third-party liability (for example a leak that damages the unit below). The landlord’s building policy does not cover your things.'}
            </p>
            {on && (
              <p className="mt-1.5 text-[12.5px] text-body-3">
                {zh
                  ? '安省标准租约第 11 条由房东勾选是否要求租客保险；要求时，房东索要凭证你需出示。这套房源是否要求，以签约时的租约为准。'
                  : 'Section 11 of the Ontario standard lease is where a landlord ticks whether tenant insurance is required; if it is, you show proof when asked. Whether this home requires it is set in the lease you sign.'}
              </p>
            )}
          </div>
          {partner && (
            <a href={partner.url} target="_blank" rel="noopener noreferrer" className="sl-btn-secondary shrink-0 !px-5 !py-2.5 text-[13px]" data-testid="tenant-insurance-partner">
              {zh ? `比较报价 · ${partner.partner_name} →` : `Compare quotes · ${partner.partner_name} →`}
            </a>
          )}
        </div>
        {partner && (
          <p className="mt-3 text-[11.5px] text-body-3">{zh ? '由第三方提供 · Stayloop 不承保、不参与理赔、不收取佣金' : 'Provided by a third party · Stayloop does not underwrite, handle claims or take a commission'}</p>
        )}
      </div>
    </ListingSection>
  )
}
