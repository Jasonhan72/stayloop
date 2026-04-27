// -----------------------------------------------------------------------------
// Agent UI shim — re-exports the V3 brand tokens
// -----------------------------------------------------------------------------
// Single source of truth lives in `@/lib/brand`. This shim keeps the existing
// `import { tokens, tier, severity } from '@/lib/agent/theme'` callsites working
// (chat components etc) while we migrate the codebase to import from
// `@/lib/brand` directly.
// -----------------------------------------------------------------------------

import { v3, tier as brandTier, severity as brandSeverity } from '../brand'

export const tokens = {
  // V3 names
  ...v3,
  // Legacy aliases from the previous teal-based palette so old chat code still
  // compiles. These now map to V3 emerald.
  accent: v3.brand,
  accentDark: v3.brandStrong,
  accentLight: v3.brandSoft,
  accentMuted: v3.brandWash,
  surfaceElevated: v3.surfaceMuted,
  textTertiary: v3.textFaint,
  textInverse: v3.textOnBrand,
  successLight: v3.successSoft,
  warningLight: v3.warningSoft,
  dangerLight: v3.dangerSoft,
  infoLight: v3.infoSoft,
  brand: v3.trust, // legacy "brand" was the violet AI accent
  brandLight: v3.trustSoft,
  borderSubtle: v3.divider,
}

// Adapt brand tier shape to the older { bg, fg } pattern used by chat
// components.
export const tier = {
  approve: { bg: brandTier.approve.bg, fg: brandTier.approve.fg, label_zh: brandTier.approve.label_zh, label_en: brandTier.approve.label_en },
  conditional: { bg: brandTier.conditional.bg, fg: brandTier.conditional.fg, label_zh: brandTier.conditional.label_zh, label_en: brandTier.conditional.label_en },
  decline: { bg: brandTier.decline.bg, fg: brandTier.decline.fg, label_zh: brandTier.decline.label_zh, label_en: brandTier.decline.label_en },
}

// Adapt severity shape (color → fg).
export const severity = {
  critical: { color: brandSeverity.critical.fg, bg: brandSeverity.critical.bg, label_zh: brandSeverity.critical.label_zh, label_en: brandSeverity.critical.label_en },
  high: { color: brandSeverity.high.fg, bg: brandSeverity.high.bg, label_zh: brandSeverity.high.label_zh, label_en: brandSeverity.high.label_en },
  medium: { color: brandSeverity.medium.fg, bg: brandSeverity.medium.bg, label_zh: brandSeverity.medium.label_zh, label_en: brandSeverity.medium.label_en },
  low: { color: brandSeverity.low.fg, bg: brandSeverity.low.bg, label_zh: brandSeverity.low.label_zh, label_en: brandSeverity.low.label_en },
}

export type Severity = keyof typeof severity
export type Tier = keyof typeof tier
