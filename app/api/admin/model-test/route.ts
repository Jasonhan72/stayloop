// POST /api/admin/model-test { model_id } — admin-only connectivity probe for
// a catalogue model: one tiny chat call through the SAME llmChat path the
// product uses (so it exercises provider, base URL, key, token-param and
// temperature rules together). Returns ok/latency/text-snippet/error. The
// model must exist in the effective catalogue (disabled rows allowed — admins
// test before enabling); the key stays server-side.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCatalog, findModel, providerAvailable } from '@/lib/modelConfig'
import { llmChat } from '@/lib/llmChat'

export const runtime = 'edge'

export async function POST(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: adminRow } = await sb.from('admin_users').select('role').eq('user_id', ud.user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: { model_id?: unknown } = {}
  try { body = await req.json() } catch { /* empty */ }
  const id = typeof body.model_id === 'string' ? body.model_id.trim() : ''
  if (!id) return NextResponse.json({ error: 'model_id required' }, { status: 400 })

  // Bypass the 60s cache for a just-saved row: force a fresh read when the id
  // is unknown to the cached catalogue.
  let def = findModel(id, await getCatalog())
  if (!def) {
    const { __resetModelConfigCaches } = await import('@/lib/modelConfig')
    __resetModelConfigCaches()
    def = findModel(id, await getCatalog())
  }
  if (!def) return NextResponse.json({ ok: false, error: 'not in catalogue (or row rejected by the security rules: unknown key env / host not allowed for that key)' }, { status: 404 })
  if (!providerAvailable(def)) return NextResponse.json({ ok: false, error: `API key not configured on this server (${def.apiKeyEnv})` })

  const t0 = Date.now()
  try {
    const { text } = await llmChat({
      model: def,
      system: 'You are a connectivity probe. Reply with exactly the word OK and nothing else.',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      maxTokens: 1200,
      temperature: 0.2,
      signal: AbortSignal.timeout(40_000),
    })
    return NextResponse.json({ ok: true, latency_ms: Date.now() - t0, text: (text || '').slice(0, 80), model: def.id })
  } catch (e) {
    return NextResponse.json({ ok: false, latency_ms: Date.now() - t0, error: String(e instanceof Error ? e.message : e).slice(0, 400), model: def.id })
  }
}
