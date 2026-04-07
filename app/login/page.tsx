'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setSending(false)

    if (authError) {
      setError(authError.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">S</div>
          <span className="text-lg font-bold text-blue-600">Stayloop</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Landlord sign in</h1>
          <p className="text-sm text-gray-500 mb-6">
            Enter your email and we&apos;ll send you a secure magic link — no password needed.
          </p>

          {sent ? (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-4 text-sm">
              <div className="font-semibold mb-1">Check your inbox</div>
              We sent a magic link to <span className="font-mono">{email}</span>. Click it to sign in.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg"
              >
                {sending ? 'Sending magic link...' : 'Send magic link'}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-gray-400 text-center">
            By signing in you agree to Stayloop&apos;s Terms and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}
