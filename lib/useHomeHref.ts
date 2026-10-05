'use client'

// The logo's destination and the acting-provider flag, shared by the Header and the Footer.
// The logo always goes to the marketing homepage, signed in or not (user 2026-10-04: 「不管有没有
// 登录，都是到首页营销页」; it used to go to the hat's AI Agent page — V0.7, 2026-09-27).
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { roleFromPath, roleStorageKey, useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'

export function useHomeHref(): { href: string; onProvider: boolean; signedIn: boolean } {
  const auth = useAuth()
  const hats = useHats()
  const pathname = usePathname() || '/'
  // 'provider' is a landing hat the Role type does not carry — read the raw
  // remembered value (same as the login page and the header chip).
  const [rememberedProvider, setRememberedProvider] = useState(false)
  useEffect(() => {
    if (!auth.user) { setRememberedProvider(false); return }
    try { setRememberedProvider(window.localStorage.getItem(roleStorageKey(auth.user.id)) === 'provider') } catch { setRememberedProvider(false) }
  }, [auth.user, pathname])
  const signedIn = !auth.loading && !!auth.user && !(auth.user as { is_anonymous?: boolean }).is_anonymous
  const onProvider = pathname.startsWith('/provider/') || (rememberedProvider && !!hats.provider && !roleFromPath(pathname))
  return { href: '/', onProvider, signedIn }
}
