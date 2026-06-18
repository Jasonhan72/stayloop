'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

export default function AuthCallback() {
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [status, setStatus] = useState<'pending' | 'ok' | 'err'>('pending')
  const [msg, setMsg] = useState(zh ? '正在登录…' : 'Signing in…')

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
          if (!data.session) throw new Error(zh ? '登录链接已失效,请重新发送' : 'Sign-in link expired, please request a new one')
        }

        setStatus('ok')
        setMsg(zh ? '登录成功 · 跳转中…' : 'Signed in · redirecting…')

        // AI-native entry: land the user IN their Personal Agent, not a
        // dashboard (architecture §13). Resolve role from the onboarding
        // choice (localStorage), else from their agent_configs row, else
        // send a brand-new user through onboarding.
        const AGENT_HOME: Record<string, string> = {
          tenant: '/tenant/agent',
          landlord: '/landlord/agent',
          agent: '/agent/agent',
        }
        // First-time users name their agent, then go straight to the chat.
        // Returning users (role known) skip naming entirely.
        let dest = '/onboarding/name'
        const stored = window.localStorage.getItem('sl-active-role')
        if (stored && AGENT_HOME[stored]) {
          dest = AGENT_HOME[stored]
        } else {
          // Scope to the authenticated user explicitly (don't rely on RLS
          // alone) and pick the most recent config so the role is deterministic.
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: cfg } = await supabase
              .from('agent_configs')
              .select('role')
              .eq('user_id', user.id)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            const role = (cfg as { role?: string } | null)?.role
            if (role && AGENT_HOME[role]) {
              window.localStorage.setItem('sl-active-role', role)
              dest = AGENT_HOME[role]
            }
          }
        }
        setTimeout(() => router.replace(dest), 600)
      } catch (e: any) {
        setStatus('err')
        setMsg(e?.message || (zh ? '登录失败' : 'Sign-in failed'))
      }
    }
    run()
  }, [router, zh])

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
              {zh ? '重新登录 →' : 'Sign in again →'}
            </a>
          </>
        )}
      </div>
    </main>
  )
}
