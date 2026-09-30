'use client'
// 消息中心 — one entry for every conversation (消息系统 A 期, 2026-09-29).
// Signed-in only; the shell follows the account's current hat (a service
// provider without a workspace hat gets the plain header).
import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import Header from '@/components/Header'
import MessageCenter from '@/components/messages/MessageCenter'
import { roleStorageKey, useAuth } from '@/lib/useAuth'
import { activeHat, useHats } from '@/lib/useHats'

function Inner() {
  const auth = useAuth()
  const hats = useHats()
  const router = useRouter()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace(`/login?next=${encodeURIComponent('/messages' + (typeof window !== 'undefined' ? window.location.search : ''))}`)
  }, [auth.loading, auth.user, router])
  if (auth.loading || !auth.user || hats.loading) return <div className="min-h-screen bg-[#F3F8FC]" />
  const remembered = typeof window !== 'undefined' ? (() => { try { return localStorage.getItem(roleStorageKey(auth.user!.id)) } catch { return null } })() : null
  // A pure service provider (no landlord / agent hat, remembered provider) gets the plain header.
  if (hats.provider && remembered === 'provider') {
    return (<><Header variant="solid" /><main className="bg-[#F3F8FC]"><MessageCenter hat="provider" /></main></>)
  }
  const hat = activeHat(hats, remembered)
  return (
    <WorkspaceShell role={hat} hideAside phoneApp>
      <MessageCenter hat={hat} />
    </WorkspaceShell>
  )
}

export default function MessagesPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#F3F8FC]" />}><Inner /></Suspense>
}
