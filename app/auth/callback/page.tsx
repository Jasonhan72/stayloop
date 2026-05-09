'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState<'pending' | 'ok' | 'err'>('pending')
  const [msg, setMsg] = useState('正在登录…')

  useEffect(() => {
    const run = async () => {
      try {
        // Implicit flow — tokens are in the URL hash
        if (typeof window === 'undefined') return
        const hash = window.location.hash.replace(/^#/, '')
        const params = new URLSearchParams(hash)
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        const supabase = getSupabaseBrowser()

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (error) throw error
        } else {
          // Maybe already logged in
          const { data } = await supabase.auth.getSession()
          if (!data.session) throw new Error('登录链接已失效,请重新发送')
        }

        setStatus('ok')
        setMsg('登录成功 · 跳转中…')
        // Decide where to send them — landlord by default; if no landlord row exists,
        // claim_landlord() RPC will create it lazily.
        setTimeout(() => router.replace('/dashboard'), 600)
      } catch (e: any) {
        setStatus('err')
        setMsg(e?.message || '登录失败')
      }
    }
    run()
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface">
      <div className="sl-card max-w-md p-10 text-center">
        {status === 'pending' && (
          <>
            <span className="orb landlord pulse mx-auto h-16 w-16" style={{ color: '#047857' }} />
            <p className="mt-5 text-[14px] text-body-2">{msg}</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-[20px] text-brand">
              ✓
            </span>
            <p className="mt-3 text-[15px] font-semibold">{msg}</p>
          </>
        )}
        {status === 'err' && (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-[20px] text-danger">
              ✗
            </span>
            <p className="mt-3 text-[14px] text-body-2">{msg}</p>
            <a href="/login" className="mt-4 inline-block text-[13px] font-semibold text-brand">
              重新登录 →
            </a>
          </>
        )}
      </div>
    </main>
  )
}
