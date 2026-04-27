// -----------------------------------------------------------------------------
// Shared visual tokens for AI-Native UI (matches Stayloop V3 design)
// -----------------------------------------------------------------------------
// Centralized design tokens so all chat / listing / pipeline pages share the
// same visual language. Mirrors the V3 print prototype: clean cards, bilingual
// labels, accent green, soft surfaces.
// -----------------------------------------------------------------------------

export const tokens = {
  // Surfaces
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceCard: '#FFFFFF',
  surfaceElevated: '#FAFAFA',

  // Borders
  border: '#E4E4E7',
  borderSubtle: '#F1F5F9',
  borderStrong: '#CBD5E1',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textInverse: '#FFFFFF',

  // Accents
  accent: '#0D9488',          // teal — Stayloop primary
  accentDark: '#0F766E',
  accentLight: '#CCFBF1',
  accentMuted: '#F0FDFA',

  // Status
  success: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  info: '#0284C7',
  infoLight: '#E0F2FE',

  // Pro / pitch accents (V3 PDF uses purple for AI / Trust)
  brand: '#7C3AED',
  brandLight: '#F3E8FF',
}

export const tier = {
  approve: { bg: tokens.successLight, fg: '#15803D', label_zh: '✓ 推荐通过', label_en: '✓ Approve' },
  conditional: { bg: tokens.warningLight, fg: '#92400E', label_zh: '⚡ 有条件通过', label_en: '⚡ Conditional' },
  decline: { bg: tokens.dangerLight, fg: '#991B1B', label_zh: '⚠ 建议拒绝', label_en: '⚠ Decline' },
}

export const severity = {
  critical: { color: '#991B1B', bg: '#FEE2E2', label_zh: '严重', label_en: 'Critical' },
  high: { color: '#9A3412', bg: '#FED7AA', label_zh: '高', label_en: 'High' },
  medium: { color: '#92400E', bg: '#FEF3C7', label_zh: '中', label_en: 'Medium' },
  low: { color: '#475569', bg: '#F1F5F9', label_zh: '低', label_en: 'Low' },
}

export type Severity = keyof typeof severity
export type Tier = keyof typeof tier
