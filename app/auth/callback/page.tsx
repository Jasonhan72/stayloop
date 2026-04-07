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

        // Ensure landlord row is linked (server-side via SECURITY DEFINER RPC)
        const { error: claimError } = await supabase.rpc('claim_landlord')
        if (claimError) {
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
