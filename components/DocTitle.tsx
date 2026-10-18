'use client'

import { useEffect } from 'react'
import { useT } from '@/lib/i18n'

/** Sets document.title in an effect (the first paint keeps the server default, so no hydration mismatch).
 *  Next re-renders the route's metadata <title> after hydration and on query-string updates, which put the
 *  server's Chinese title back on an English page (site test 2026-10-18 retest) — so a change to <head>
 *  re-applies ours. It only writes when the title differs, so it cannot loop. */
export function useDocTitle(title: string) {
  useEffect(() => {
    if (!title) return
    const apply = () => { if (document.title !== title) document.title = title }
    apply()
    const mo = new MutationObserver(apply)
    mo.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => mo.disconnect()
  }, [title])
}

export default function DocTitle({ zh, en }: { zh: string; en: string }) {
  const { lang } = useT()
  useDocTitle(lang === 'zh' ? zh : en)
  return null
}
