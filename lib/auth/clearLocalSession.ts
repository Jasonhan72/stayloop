// Per-browser, per-account leftovers that must not survive a sign-out (D-A4 / D-A6):
// the agent's "current thread" pointers and the onboarding role picked in sessionStorage.
export function clearLocalSessionState(): void {
  if (typeof window === 'undefined') return
  try {
    const ls = window.localStorage
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i)
      if (k && k.startsWith('sl-thread-current-')) ls.removeItem(k)
    }
  } catch { /* private mode */ }
  try { window.sessionStorage.removeItem('sl-onboarding-role') } catch { /* private mode */ }
}
