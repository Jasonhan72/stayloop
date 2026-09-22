// GET /api/admin/model-discover — ask every provider with a configured key
// which models it serves today and diff against the catalogue (see
// lib/modelDiscovery.ts). Admin-gated like model-providers; key values never
// leave the server — only the diff does.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PROVIDER_KEY_ENVS, getCatalog } from '@/lib/modelConfig'
import { discoverProvider, type ProviderDiff } from '@/lib/modelDiscovery'

export const runtime = 'edge'

export async function GET(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: isAdmin, error: ae } = await sb.rpc('is_stayloop_admin')
  if (ae || !isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const catalog = await getCatalog()
  const configured = PROVIDER_KEY_ENVS.filter((env) => !!(process.env[env] || '').trim())
  const providers: ProviderDiff[] = await Promise.all(configured.map((env) => discoverProvider(env, (process.env[env] || '').trim(), catalog)))
  return NextResponse.json({ checked_at: new Date().toISOString(), providers })
}
