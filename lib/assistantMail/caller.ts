// AI 助理的邮箱 · who is calling (server only). The routes act with the service role, so the caller
// is established first, from their own bearer token, and every write is scoped to that user id.
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export async function callerOf(req: Request): Promise<{ user: User; admin: SupabaseClient } | null> {
  const authHeader = req.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+/i.test(authHeader)) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) return null
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user } } = await asCaller.auth.getUser()
  // An anonymous preview session is a real JWT with no account behind it: no mailbox for it.
  if (!user || (user as { is_anonymous?: boolean }).is_anonymous) return null
  return { user, admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) }
}
