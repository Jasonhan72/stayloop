// Stayloop — Supabase client (implicit flow, browser-side)
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let _client: SupabaseClient | null = null

export function getSupabaseBrowser(): SupabaseClient {
  if (_client) return _client
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'implicit',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })
  return _client
}

// Singleton value export — most app code imports this directly
// (e.g. `import { supabase } from '@/lib/supabase'`).
export const supabase: SupabaseClient = getSupabaseBrowser()
