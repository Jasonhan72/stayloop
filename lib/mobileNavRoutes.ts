// Which routes get the phone bottom tab bar (components/MobileBottomNav.tsx).
// Pure so tests can import it without pulling in Supabase.
const HIDE_PREFIXES = ['/onboarding', '/login', '/register', '/auth', '/verify', '/lease/sign', '/join', '/p/', '/h/', '/dashboard', '/settings', '/admin', '/screening/app', '/screening/']
const WORKSPACE_ROLE_PREFIXES = ['/tenant/', '/landlord/', '/agent/']

export function shouldShowMobileNav(path: string): boolean {
  if (HIDE_PREFIXES.some((p) => path.startsWith(p))) return false
  if (WORKSPACE_ROLE_PREFIXES.some((p) => path.startsWith(p))) return false
  return true
}
