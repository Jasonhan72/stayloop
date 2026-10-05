// Remove query parameters from the address bar without navigating.
//
// Deferred one task on purpose (review 2026-10-05): Next's router patches
// history.replaceState in its own effect, and a page's mount effect runs
// before it on a full page load. A replaceState made right there reaches the
// native function and overwrites the state Next keeps on the history entry —
// after that, Back into the entry changes the URL but not the page. One
// setTimeout later the patched function is in place: it keeps Next's state and
// tells the router the URL changed.
export function stripUrlParams(keys: readonly string[] | 'all'): void {
  if (typeof window === 'undefined') return
  setTimeout(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (keys === 'all') { if (!window.location.search) return; for (const k of Array.from(params.keys())) params.delete(k) }
      else {
        if (!keys.some((k) => params.has(k))) return
        for (const k of keys) params.delete(k)
      }
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    } catch { /* no history (tests) */ }
  }, 0)
}
