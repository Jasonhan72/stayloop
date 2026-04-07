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
        const errorDesc = url.searchParams.get('error_description') || url.hash.match(/error_description=([^&]+)/)?.[1]

        if (errorDesc) {
          setStatus('Sign-in error: ' + decodeURIComponent(errorDesc))
          setTimeout(() => router.replace('/login'), 2500)
          return
        }

        // PKCE flow: exchange ?code=... for a session
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setStatus('Verification failed: ' + exchangeError.message)
            setTimeout(() => router.replace('/login'), 2500)
            return
          }
        }

        // Implicit flow falls through here (session is auto-detected from URL hash)
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          setStatus('Sign-in link invalid or expired. Redirecting...')
          setTimeout(() => router.replace('/login'), 2000)
          return
        }

        const user = session.user

        // Ensure a landlords row exists for this auth user
        const { data: existing } = await supabase
          .from('landlords')
          .select('id')
          .eq('auth_id', user.id)
          .maybeSingle()

        if (!existing) {
          // Try linking by email first (e.g. the seeded test landlord)
          const { data: byEmail } = await supabase
            .from('landlords')
            .select('id, auth_id')
            .eq('email', user.email!)
            .maybeSingle()

          if (byEmail && !byEmail.auth_id) {
            await supabase.from('landlords').update({ auth_id: user.id }).eq('id', byEmail.id)
          } else if (!byEmail) {
            await supabase.from('landlords').insert({
              auth_id: user.id,
              email: user.email!,
              full_name: user.user_metadata?.full_name || null,
              plan: 'free',
            })
          }
        }

        setStatus('Signed in. Redirecting...')
        // Clean URL then go to dashboard
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
