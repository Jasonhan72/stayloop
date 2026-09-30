'use client'
// /notifications is retired (user 2026-09-30). What it showed lives elsewhere:
// pending approval cards → the hat's to-do page; work-order events → system
// lines in each work-order conversation (/messages); account activity → the
// audit page and the assistant panel's 活动. Old links and bookmarks land on
// the to-do page of the hat the account wears (a provider on its jobs page).
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { roleStorageKey, useAuth } from '@/lib/useAuth'
import { activeHat, useHats } from '@/lib/useHats'
import { notificationsTarget } from '@/lib/notificationsTarget'


export default function NotificationsRedirect() {
  const auth = useAuth()
  const hats = useHats()
  const router = useRouter()
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { router.replace(notificationsTarget(false, 'tenant', false)); return }
    if (hats.loading) return
    let remembered: string | null = null
    try { remembered = window.localStorage.getItem(roleStorageKey(auth.user.id)) } catch { remembered = null }
    router.replace(notificationsTarget(true, activeHat(hats, remembered), !!hats.provider && remembered === 'provider'))
  }, [auth.loading, auth.user, hats, router])
  return <div className="min-h-screen bg-[#F3F8FC]" />
}
