'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Verifying your sign-in link...')

  useEffect(() => {
    async function complete() {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const tokenHash = url.searchParams.get('token_hash')
        const type = url.searchParams.get('type') as
          | 'magiclink' | 'signup' | 'recovery' | 'invite' | 'email_change' | 'email' | null
        const errorDesc =
          url.searchParams.get('error_description') ||
          url.hash.match(/error_description=([^&]+)/)?.[1]

        if (errorDesc) {
          setStatus('Sign-in error: ' + decodeURIComponent(errorDesc))
          setTimeout(() => router.replace('/login'), 2500)
          return
        }

        // 1) PKCE flow: ?code=...
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setStatus('Verification failed: ' + exchangeError.message)
            setTimeout(() => router.replace('/login'), 2500)
            return
          }
        }
        // 2) OTP / token_hash flow: ?token_hash=...&type=magiclink
        else if (tokenHash && type) {
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
        // 3) Implicit flow: #access_token=... is auto-detected by detectSessionInUrl

        // Confirm we have a session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setStatus('Sign-in link invalid or expired. Redirecting...')
          setTimeout(() => router.replace('/login'), 2000)
          return
        }

        // Ensure landlord row is linked (server-side via SECURITY DEFINER RPC)
        const { error: claimError } = await supabase.rpc('claim_landlord')
        if (claimError) {
          // Non-fatal: dashboard will retry. Log and continue.
          console.error('claim_landlord failed', claimError)
        }

        setStatus('Signed in. Redirecting...')
        window.history.replaceState({}, '', '/auth/callback')
        router.replace('/dashboard')
      } catch (e: any) {
        setStatus('Unexpected error: ' + (e?.message || 'unknown'))
        setTimeout(() => router.replace('/login'), 2500)
      }
    }
    complete()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center text-slate-200">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
        <p className="text-sm font-mono text-slate-300">{status}</p>
      </div>
    </div>
  )
}
