// GET /api/models/catalog — the signed-in user's view of the model catalogue
// for /settings/models: which models THEY may pick per user-facing slot, the
// current system default for each slot, and their saved preferences.
//
// Server-filtered: only enabled + user_selectable models whose provider key
// is configured on this server, and only the user-overridable slots. Env var
// NAMES and base URLs are never returned — just id/label/note/provider/cost.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { USER_SLOTS, getCatalog, getModels, modelUsableForSlot, type ModelSlot } from '@/lib/modelConfig'

export const runtime = 'edge'

export async function GET(req: Request) {
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

  const [catalog, defaults, prefsRes] = await Promise.all([
    getCatalog(),
    getModels(),
    sb.from('user_model_preferences').select('slot, model_id').eq('user_id', ud.user.id),
  ])

  const models = catalog
    .filter((m) => m.enabled && m.userSelectable)
    .map((m) => ({
      id: m.id,
      label: m.label,
      note: m.note,
      provider: m.provider,
      vision: m.vision,
      costTier: m.costTier,
      slots: USER_SLOTS.filter((s) => modelUsableForSlot(m, s)),
    }))
    .filter((m) => m.slots.length > 0)

  const prefs: Partial<Record<ModelSlot, string>> = {}
  for (const row of prefsRes.data || []) {
    if ((USER_SLOTS as string[]).includes(row.slot) && typeof row.model_id === 'string') prefs[row.slot as ModelSlot] = row.model_id
  }
  const defaultsOut: Partial<Record<ModelSlot, string>> = {}
  for (const s of USER_SLOTS) defaultsOut[s] = defaults[s]

  return NextResponse.json({ slots: USER_SLOTS, defaults: defaultsOut, models, prefs })
}
