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
  // ── Surfaces ────────────────────────────────────────────────────────────
  surface: '#FFFFFF',
  /** Very faint mint, used for hero / accent panels. */
  surfaceTint: '#F0FBF6',
  /** Slightly cooler off-white for in-app body backgrounds (sidebars, etc). */
  surfaceMuted: '#FAFAFA',
  /** Cards inside surfaceTint panels keep a clean white. */
  surfaceCard: '#FFFFFF',

  // ── Borders / dividers ──────────────────────────────────────────────────
  border: '#E4E4E7', // zinc-200
  borderStrong: '#D4D4D8',
  divider: '#F4F4F5',

  // ── Text ────────────────────────────────────────────────────────────────
  textPrimary: '#0A0A0A',
  textSecondary: '#3F3F46',
  textMuted: '#71717A',
  textFaint: '#A1A1AA',
  /** White-on-brand text. */
  textOnBrand: '#FFFFFF',

  // ── Brand ───────────────────────────────────────────────────────────────
  /** Primary emerald — buttons, accent text, network-diagram hub. */
  brand: '#10B981',
  /** Hover / pressed state. */
  brandStrong: '#059669',
  /** Background tint behind brand-tinted elements. */
  brandSoft: '#ECFDF5',
  /** Even fainter brand wash for huge hero areas. */
  brandWash: '#F0FDF6',

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
