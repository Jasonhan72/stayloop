'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { v3 } from '@/lib/brand'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Verifying your sign-in link...')

  useEffect(() => {
    async function complete() {
      try {
        const url = new URL(window.location.href)
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
        const hashParams = new URLSearchParams(hash)

        // Surface any error from Supabase up-front
        const errorDesc =
          url.searchParams.get('error_description') ||
          hashParams.get('error_description')
        if (errorDesc) {
          setStatus('Sign-in error: ' + decodeURIComponent(errorDesc))
          setTimeout(() => router.replace('/login'), 2500)
          return
        }

        // Implicit flow: #access_token=...&refresh_token=...
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const tokenType = hashParams.get('type')

        // Recovery flow — redirect to reset-password page with the hash intact
        if (tokenType === 'recovery' && accessToken) {
          window.location.replace('/auth/reset-password' + url.hash)
          return
        }

        if (accessToken && refreshToken) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (setErr) {
            setStatus('Verification failed: ' + setErr.message)
            setTimeout(() => router.replace('/login'), 2500)
            return
          }
        }
        // OTP token_hash flow: ?token_hash=xxx&type=magiclink
        else {
          const tokenHash = url.searchParams.get('token_hash')
          const type = url.searchParams.get('type')
          if (tokenHash && type) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as any,
            })
            if (verifyError) {
              setStatus('Verification failed: ' + verifyError.message)
              setTimeout(() => router.replace('/login'), 2500)
              return
            }
          }
        }

        // Confirm session is now established
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setStatus('Sign-in link invalid or expired. Redirecting...')
          setTimeout(() => router.replace('/login'), 2000)
          return
        }

        // Ensure profile row is linked (server-side via SECURITY DEFINER RPC)
        // Pass the role from signup metadata if available
        const userRole = session.user.user_metadata?.role || 'landlord'
        const { error: claimError } = await supabase.rpc('claim_landlord', { p_role: userRole })
        if (claimError) {
          console.error('claim_landlord failed', claimError)
        }

        setStatus('Signed in. Redirecting...')
        // Honor ?next= param for post-login destination (same-origin paths only)
        const rawNext = url.searchParams.get('next') || '/'
        const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'
        window.history.replaceState({}, '', '/auth/callback')
        router.replace(safeNext)
      } catch (e: any) {
        setStatus('Unexpected error: ' + (e?.message || 'unknown'))
        setTimeout(() => router.replace('/login'), 2500)
      }
    }
    complete()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: v3.surface, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, margin: '0 auto 16px', borderRadius: 12, border: `4px solid rgba(4,120,87,0.2)`, borderTopColor: v3.brand, animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: v3.textMuted }}>{status}</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
