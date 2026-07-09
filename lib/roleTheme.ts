// Single source of truth for the per-role color system (tenant purple /
// landlord emerald / agent blue). Components derive their local shapes from
// ROLE_THEME instead of re-declaring hex values.
//
// NOTE: `app/globals.css` (.orb.* etc.) intentionally mirrors these values in
// CSS — keep the two in sync when the palette changes.
//
// Some sites historically used slightly different "deep" shades; those are
// preserved as distinct named tokens rather than unified, so rendered output
// stays byte-identical:
//   deep    — rail/workspace foreground shade (WorkspaceShell fg, onboarding
//             accent for tenant/landlord)
//   deeper  — darkest body-text shade (AIProactive insight text). For agent
//             this equals `deep` (#1E3A8A).
//   onboardingAccent — the onboarding name-page "accent"; matches `deep` for
//             tenant/landlord but is the brighter #1D4ED8 for agent.

export type RoleKey = 'tenant' | 'landlord' | 'agent'

export interface RoleTheme {
  /** Base brand color (buttons, active tiles, eyebrow text). */
  accent: string
  /** Light tint of the accent (gradient start). */
  light: string
  /** Dark foreground shade — rail active icon color. */
  deep: string
  /** Darkest text shade — proactive-insight body copy. */
  deeper: string
  /** Onboarding name-page accent (suggestion-pill text). */
  onboardingAccent: string
  /** Avatar / orb linear gradient: light → accent at 135deg. */
  avatarGradient: string
  /** Small orb radial gradient (AIProactive badge). */
  orbRadial: string
  /** Onboarding hero orb radial gradient. */
  onboardingOrb: string
  /** Onboarding hero orb glow shadow. */
  orbShadow: string
  /** Accent at 22% alpha — borders. */
  borderRgba: string
  /** Accent at 10% alpha — light chip backgrounds. */
  lightRgba: string
  /** Accent at 5% alpha — panel backgrounds. */
  bgRgba: string
}

export const ROLE_THEME: Record<RoleKey, RoleTheme> = {
  tenant: {
    accent: '#7C3AED',
    light: '#C4B5FD',
    deep: '#5B21B6',
    deeper: '#4C1D95',
    onboardingAccent: '#5B21B6',
    avatarGradient: 'linear-gradient(135deg,#C4B5FD,#7C3AED)',
    orbRadial: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)',
    onboardingOrb: 'radial-gradient(circle at 32% 28%, rgba(196,181,253,0.95), #7C3AED 65%)',
    orbShadow: '0 0 50px rgba(124,58,237,0.45)',
    borderRgba: 'rgba(124,58,237,0.22)',
    lightRgba: 'rgba(124,58,237,0.10)',
    bgRgba: 'rgba(124,58,237,0.05)',
  },
  landlord: {
    accent: '#047857',
    light: '#6EE7B7',
    deep: '#065F46',
    deeper: '#064E3B',
    onboardingAccent: '#065F46',
    avatarGradient: 'linear-gradient(135deg,#6EE7B7,#047857)',
    orbRadial: 'radial-gradient(circle at 35% 35%, #6EE7B7, #047857 70%)',
    onboardingOrb: 'radial-gradient(circle at 32% 28%, rgba(110,231,183,0.95), #047857 65%)',
    orbShadow: '0 0 50px rgba(4,120,87,0.45)',
    borderRgba: 'rgba(4,120,87,0.22)',
    lightRgba: 'rgba(4,120,87,0.10)',
    bgRgba: 'rgba(4,120,87,0.05)',
  },
  agent: {
    accent: '#2563EB',
    light: '#93C5FD',
    deep: '#1E3A8A',
    deeper: '#1E3A8A',
    onboardingAccent: '#1D4ED8',
    avatarGradient: 'linear-gradient(135deg,#93C5FD,#2563EB)',
    orbRadial: 'radial-gradient(circle at 35% 35%, #93C5FD, #2563EB 70%)',
    onboardingOrb: 'radial-gradient(circle at 32% 28%, rgba(147,197,253,0.95), #2563EB 65%)',
    orbShadow: '0 0 50px rgba(37,99,235,0.45)',
    borderRgba: 'rgba(37,99,235,0.22)',
    lightRgba: 'rgba(37,99,235,0.10)',
    bgRgba: 'rgba(37,99,235,0.05)',
  },
}
