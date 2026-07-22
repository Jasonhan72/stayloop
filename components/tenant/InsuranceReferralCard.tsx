'use client'

// Config-driven tenant-insurance referral card (move-in surface).
// Reads /api/config/tenant-insurance; renders NOTHING unless an admin has
// enabled the referral in app_config (key='tenant_insurance_referral').
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'

interface ReferralConfig {
  enabled: boolean
  partner_name?: string
  url?: string
}

export default function InsuranceReferralCard() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [config, setConfig] = useState<ReferralConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/config/tenant-insurance')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json && json.enabled === true) setConfig(json)
      })
      .catch(() => {
        /* hidden on any failure */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!config?.enabled || !config.partner_name || !config.url) return null

  return (
    <div className="mb-5 sl-card p-5 sm:p-7">
      <h2 className="text-[18px] font-bold tracking-tight">
        {zh ? '🛡️ 入住前可考虑租客保险' : '🛡️ Consider tenant insurance before move-in'}
      </h2>
      <p className="mt-2 max-w-[560px] text-[13.5px] leading-relaxed text-body-2">
        {zh
          ? '租客保险通常覆盖个人财物损失与第三方责任，不少房东也会在租约中要求。费用一般每月 $15–$30，几分钟即可在线投保。'
          : 'Tenant insurance typically covers your belongings and third-party liability, and many landlords require it in the lease. It usually costs $15–$30 a month and takes minutes to set up online.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={config.url}
          target="_blank"
          rel="noopener noreferrer"
          className="sl-btn-secondary !px-5 !py-2.5 text-[13px]"
        >
          {zh ? `了解 ${config.partner_name} →` : `Explore ${config.partner_name} →`}
        </a>
        <span className="text-[11.5px] text-body-3">
          {zh
            ? '由第三方提供 · Stayloop 不承保、不参与理赔'
            : 'Provided by a third party · Stayloop does not underwrite or handle claims'}
        </span>
      </div>
    </div>
  )
}
