'use client'

export const runtime = 'edge'

// Redirect to /screening — the main page now handles uploads directly.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ScreeningNewRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/screening')
  }, [router])

  return (
    <div
      style={{ background: '#FAF7EE', minHeight: '100vh' }}
      className="flex items-center justify-center"
    >
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#047857] border-t-transparent" />
        <p className="mt-3 font-mono text-[13px] text-[#999]">Redirecting...</p>
      </div>
    </div>
  )
}
