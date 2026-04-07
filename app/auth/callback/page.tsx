'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Signing you in...')

  useEffect(() => {
    async function complete() {
      // Supabase JS auto-detects the session from the URL hash on load.
      // Give it a tick, then verify and ensure a landlords row exists.
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        setStatus('Sign-in link invalid or expired. Redirecting...')
        setTimeout(() => router.replace('/login'), 1500)
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
          await supabase
            .from('landlords')
            .update({ auth_id: user.id })
            .eq('id', byEmail.id)
        } else if (!byEmail) {
          await supabase.from('landlords').insert({
            auth_id: user.id,
            email: user.email!,
            full_name: user.user_metadata?.full_name || null,
            plan: 'free',
          })
        }
      }

      router.replace('/dashboard')
    }
    complete()
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 mx-auto mb-4 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-600">{status}</p>
      </div>
    </div>
  )
}
