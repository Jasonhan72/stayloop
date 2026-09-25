'use client'
import { homeForHats, type HatsLite } from '@/lib/landlordHat'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

export default function AuthCallback() {
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [status, setStatus] = useState<'pending' | 'ok' | 'err'>('pending')
  // State holds a KEY (plus the provider's own error text, if any); the words
  // are derived at render time. Seeding state with a translated string froze
  // the SSR language, and reading `zh` inside the effect put it in the deps —
  // the language flip after hydration then ran the whole sign-in twice.
  const [errKey, setErrKey] = useState<'expired' | 'failed'>('failed')
  const [errDetail, setErrDetail] = useState<string | null>(null)
  const msg =
    status === 'pending'
      ? (zh ? '正在登录…' : 'Signing in…')
      : status === 'ok'
        ? (zh ? '登录成功 · 跳转中…' : 'Signed in · redirecting…')
        : errDetail ||
          (errKey === 'expired'
            ? (zh ? '登录链接已失效,请重新发送' : 'Sign-in link expired, please request a new one')
            : (zh ? '登录失败' : 'Sign-in failed'))

  useEffect(() => {
    const run = async () => {
      try {
        // Implicit flow — tokens are in the URL hash
        if (typeof window === 'undefined') return
        const hash = window.location.hash.replace(/^#/, '')
        const params = new URLSearchParams(hash)
        // GoTrue reports provider / OTP failures in the fragment (or query):
        // error=access_denied&error_code=otp_expired&error_description=…
        // Show that instead of the generic "link expired" (review 2026-09-17).
        const q = new URLSearchParams(window.location.search)
        const providerErr = params.get('error_description') || q.get('error_description') || params.get('error_code') || q.get('error_code') || params.get('error') || q.get('error')
        if (providerErr) throw new Error(providerErr.replace(/\+/g, ' '))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        const supabase = getSupabaseBrowser()

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (error) throw error
        } else {
          // Maybe already logged in
          const { data } = await supabase.auth.getSession()
          if (!data.session) {
            setErrKey('expired')
            setStatus('err')
            return
          }
        }

        setStatus('ok')

        // AI-native entry: land the user IN their Personal Agent, not a
        // dashboard (architecture §13). Resolve role from the onboarding
        // choice (localStorage), else from their agent_configs row, else
        // send a brand-new user through onboarding.
        const AGENT_HOME: Record<string, string> = {
          tenant: '/tenant/agent',
          landlord: '/landlord/agent',
          agent: '/agent/agent',
        }
        // Honor an explicit ?next= destination (set by AuthModal) when it's a
        // safe same-origin path — otherwise fall back to role-based routing.
        const rawNext = new URLSearchParams(window.location.search).get('next')
        const safeNext = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\') ? rawNext : null

        // First-time users name their agent, then go straight to the chat.
        // Returning users (role known) skip naming entirely.
        let dest = safeNext ?? '/onboarding/name'
        const stored = window.localStorage.getItem('sl-active-role')
        if (safeNext) {
          dest = safeNext
        } else if (stored && AGENT_HOME[stored]) {
          // The remembered role may belong to a previous account on this
          // browser — only use it if this account holds that hat (SL-T-08).
          const { data: hats } = await supabase.rpc('my_hats')
          dest = homeForHats(stored, hats as HatsLite)
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
            // Fall back to the role the user picked at signup (AuthModal
            // writes it to user_metadata; nothing read it before, so a
            // landlord choosing 房东 in the modal was defaulted into
            // tenant onboarding).
            const metaRole = (user.user_metadata as { role?: string } | undefined)?.role
            const role = (cfg as { role?: string } | null)?.role || (metaRole && AGENT_HOME[metaRole] ? metaRole : undefined)
            if (role && AGENT_HOME[role]) {
              window.localStorage.setItem('sl-active-role', role)
              dest = AGENT_HOME[role]
            } else {
              // Brand new user — check if they came with a role intent
              const intentRole = new URLSearchParams(window.location.search).get('role')
              if (intentRole && AGENT_HOME[intentRole]) {
                dest = `/onboarding/name?role=${intentRole}`
              }
            }
          }
        }
        setTimeout(() => router.replace(dest), 600)
      } catch (e: any) {
        setErrKey('failed')
        setErrDetail(typeof e?.message === 'string' && e.message ? e.message : null)
        setStatus('err')
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
              {zh ? '重新登录 →' : 'Sign in again →'}
            </a>
          </>
        )}
      </div>
    </main>
  )
}
