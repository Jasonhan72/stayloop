'use client'

import { useEffect } from 'react'
import { useT } from '@/lib/i18n'

/** Sets document.title in an effect (the first paint keeps the server default, so no hydration mismatch). */
export default function DocTitle({ zh, en }: { zh: string; en: string }) {
  const { lang } = useT()
  const title = lang === 'zh' ? zh : en
  useEffect(() => { if (title) document.title = title }, [title])
  return null
}
