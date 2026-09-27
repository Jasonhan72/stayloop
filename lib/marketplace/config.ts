'use client'

// The marketplace rules the pages need (节点 3 2026-09-26): credential grace
// days, read once per session from /api/config/marketplace (service role
// behind it; app_config itself is admin-only). Coverage chips pass the value
// into coverageFor so what the provider / landlord sees is what the server
// enforces.
import { useEffect, useState } from 'react'
import { QUOTE_HOURS_DEFAULT } from './sla'

export type MarketplaceClientConfig = { graceDays: number; quoteHoursDefault: number }
const DEFAULT: MarketplaceClientConfig = { graceDays: 0, quoteHoursDefault: QUOTE_HOURS_DEFAULT }
let cached: Promise<MarketplaceClientConfig> | null = null

export function fetchMarketplaceConfig(): Promise<MarketplaceClientConfig> {
  if (!cached) {
    cached = fetch('/api/config/marketplace').then(async (r) => {
      if (!r.ok) return DEFAULT
      const j = (await r.json()) as { credential_grace_days?: number; quote_hours_default?: number }
      return { graceDays: Number(j.credential_grace_days) || 0, quoteHoursDefault: Number(j.quote_hours_default) || QUOTE_HOURS_DEFAULT }
    }).catch(() => DEFAULT)
  }
  return cached
}

export function useMarketplaceConfig(): MarketplaceClientConfig {
  const [cfg, setCfg] = useState<MarketplaceClientConfig>(DEFAULT)
  useEffect(() => { let on = true; void fetchMarketplaceConfig().then((c) => { if (on) setCfg(c) }); return () => { on = false } }, [])
  return cfg
}
