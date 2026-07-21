// GET /api/admin/model-providers — provider API-key availability for the
// /admin/models dropdown. Returns BOOLEANS ONLY, keyed by env-var name
// (e.g. { ANTHROPIC_API_KEY: true, DEEPSEEK_API_KEY: false }); no key value
// ever leaves the server. Gated on the caller's JWT belonging to the
// Stayloop back-office admin group (admin_users, same source of truth as
// is_stayloop_admin()) — the row read runs under the caller's RLS.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ALLOWED_MODELS, providerAvailable } from '@/lib/modelConfig'

export const runtime = 'edge'

export async function GET(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // Admin gate: RLS on admin_users lets a member read their own row; a
  // non-admin gets null here and is refused.
  const { data: adminRow, error: ae } = await sb
    .from('admin_users')
    .select('role')
    .eq('user_id', ud.user.id)
    .maybeSingle()
  if (ae || !adminRow) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const providers: Record<string, boolean> = {}
  for (const m of ALLOWED_MODELS) {
    providers[m.apiKeyEnv] = providerAvailable(m)
  }
  return NextResponse.json({ providers })
}
