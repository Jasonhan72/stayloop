// 2026-06-03 — Build hardening — defer client construction.
//
// PROBLEM
//   `lib/supabase.ts` previously exported `supabase = createClient(URL!, KEY!)`
//   evaluated at module-load time. When Next.js builds the production bundle
//   it statically pre-renders client pages (including ones marked
//   `'use client'`), and during that pre-render this module is imported.
//   If either env var is missing in the build environment the createClient
//   call throws "supabaseUrl is required." and prerender of /score,
//   /landlord/leases, etc. fails with a 1-line trace and no fix-it hint.
//
//   On Cloudflare Pages the build env can lose those vars (separate from
//   GitHub Actions' env, and orthogonal to the runtime env on the worker)
//   so the production build silently degrades into a 500 page everywhere.
//
// FIX
//   Replace the eager singleton with a lazy proxy. The proxy creates the
//   real SupabaseClient on first property access. Calls during build-time
//   prerender never touch any properties (the imports are dead-code from
//   the renderer's perspective), so the proxy stays uninstantiated and the
//   build succeeds.
//
//   At runtime the first `.auth.getUser()` or `.from('…')` call materializes
//   the singleton. If env vars are still missing at that point we throw a
//   clear error referencing the missing var name so logs are actionable.
//
// CONTRACT
//   Drop-in replacement: `import { supabase } from '@/lib/supabase'` still
//   works. The exported `supabase` is a Proxy<SupabaseClient> — typings
//   match the previous export.
// -----------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function instantiate(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) {
    throw new Error(
      'lib/supabase: NEXT_PUBLIC_SUPABASE_URL is not set. Add it to the build & runtime env.',
    )
  }
  if (!key) {
    throw new Error(
      'lib/supabase: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Add it to the build & runtime env.',
    )
  }
  return createClient(url, key, {
    auth: {
      // Use implicit flow: access token comes back in URL hash fragment.
      // PKCE requires the code-verifier to be in the same origin's
      // localStorage as the original signInWithOtp call, which breaks with
      // apex/www mismatches.
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}

function getClient(): SupabaseClient {
  if (_client) return _client
  _client = instantiate()
  return _client
}

// Proxy: every property/method access goes through getClient(), so the
// real client is only instantiated on first use — not at module import.
// This keeps build-time prerender from blowing up when env vars are absent.
export const supabase: SupabaseClient = new Proxy(
  {} as SupabaseClient,
  {
    get(_target, prop, receiver) {
      const client = getClient()
      const value = Reflect.get(client as unknown as object, prop, receiver)
      return typeof value === 'function' ? value.bind(client) : value
    },
    has(_target, prop) {
      return prop in (getClient() as unknown as object)
    },
  },
)
