// -----------------------------------------------------------------------------
// V3 brand tokens — single source of truth
// -----------------------------------------------------------------------------
// Derived from the V3 classic-print PDF (April 2026). Used by the marketing
// site, the in-app surfaces (/chat, /dashboard, /listings, /pipeline), and the
// agent runtime UI components. Update here, propagate everywhere.
//
// Visual identity in one sentence: vibrant emerald accent on near-white surfaces
// with a small soft-mint tint reserved for hero / network-effect panels.
// -----------------------------------------------------------------------------

export const v3 = {
  // ── Surfaces (matches Stayloop V3 Prototype.html "classic" variation) ──
  surface: '#FAFAF9',
  /** Slightly off-white for cards on the cream surface. */
  surfaceCard: '#FFFFFF',
  /** Very faint mint, used for hero / accent panels. */
  surfaceTint: '#F0F8F4',
  /** Slightly cooler off-white for sidebars, body. */
  surfaceMuted: '#F4F4F2',
  /** Deep dark for the passport card and any "always-dark" surfaces. */
  ink: '#0B0B0E',
  ink2: '#16161B',
  ink3: '#1B1B22',

  // ── Borders / dividers ──────────────────────────────────────────────────
  border: '#E3E3DE',
  borderStrong: '#D5D5CF',
  divider: '#EDEDEA',

  // ── Text ────────────────────────────────────────────────────────────────
  textPrimary: '#171717',
  textSecondary: '#3F3F46',
  textMuted: '#71717A',
  textFaint: '#A1A1AA',
  /** White-on-brand text. */
  textOnBrand: '#FFFFFF',

  // ── Brand (classic emerald — darker than the modern variation) ─────────
  /** Primary darker emerald used for buttons, accent text. */
  brand: '#047857',
  /** Hover / pressed state. */
  brandStrong: '#065F46',
  /** Brighter emerald used inside dark panels (passport hero etc). */
  brandBright: '#10B981',
  brandBright2: '#34D399',
  /** Background tint behind brand-tinted elements. */
  brandSoft: 'rgba(4, 120, 87, 0.08)',
  /** Slightly stronger soft tint for hero panels. */
  brandWash: '#F0F8F4',
  /** Brand outline color used on dark surfaces. */
  brandLine: 'rgba(16, 185, 129, 0.32)',

  // ── Status / severity (re-used by ScreeningCard etc) ────────────────────
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  trust: '#7C3AED', // violet — used for Trust API + verified passport accents
  trustSoft: '#F3E8FF',
} as const

/** Tier labels (approve / conditional / decline) for screening. */
export const tier = {
  approve: { label_zh: '✓ 推荐通过', label_en: '✓ Approve', fg: v3.success, bg: v3.successSoft },
  conditional: { label_zh: '⚡ 有条件', label_en: '⚡ Conditional', fg: v3.warning, bg: v3.warningSoft },
  decline: { label_zh: '⚠ 建议拒绝', label_en: '⚠ Decline', fg: v3.danger, bg: v3.dangerSoft },
  pending: { label_zh: '待评分', label_en: 'Pending', fg: v3.textMuted, bg: v3.divider },
} as const

/** Severity labels for forensics / compliance warnings. */
export const severity = {
  critical: { fg: '#991B1B', bg: '#FEE2E2', label_zh: '严重', label_en: 'Critical' },
  high: { fg: v3.danger, bg: v3.dangerSoft, label_zh: '高', label_en: 'High' },
  medium: { fg: v3.warning, bg: v3.warningSoft, label_zh: '中', label_en: 'Medium' },
  low: { fg: v3.textMuted, bg: v3.divider, label_zh: '低', label_en: 'Low' },
} as const

/** Sizing scale. Use as `size.lg` instead of literal pixels. */
export const size = {
  radius: { sm: 4, md: 6, lg: 8, xl: 12, pill: 999 },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.04)',
    md: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
    lg: '0 4px 8px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.06)',
  },
  content: { narrow: 720, default: 1100, wide: 1260 },
} as const

/** Convenience: legacy `tokens` alias re-exports the V3 palette so old
 *  imports from `@/lib/agent/theme` keep working until they're migrated. */
export const tokens = v3
