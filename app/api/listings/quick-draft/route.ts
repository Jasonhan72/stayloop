// POST /api/listings/quick-draft — quick publish, step 2 of 2 (2026-10-13).
// The landlord's photos go to the vision model once; the answer is a guess the
// landlord reviews (lib/listings/quickDraft.ts). Signed-in landlords only; the
// photos are not stored here (the page keeps them and saves them with the
// listing on publish). Cost: one classify-slot call with ≤8 images.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { llmChat, type ChatContentBlock } from '@/lib/llmChat'
import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '@/lib/modelConfig'
import { underHourlyLimit } from '@/lib/rateLimit'
import { parsePhotoDataUrl, parseQuickDraftGuess, quickDraftSystemPrompt, quickDraftUserText, QUICK_VISION_PHOTOS } from '@/lib/listings/quickDraft'

export const runtime = 'edge'

const PER_USER_PER_HOUR = 10
const SITE_PER_HOUR = 200

type Body = { address?: string; unit?: string | null; city?: string | null; province?: string | null; monthly_rent?: number | null; photos?: unknown[] }

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  const uid = ud?.user?.id
  if (!uid || ud?.user?.is_anonymous) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Body
  try { body = (await req.json()) as Body } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const address = (body.address || '').trim().slice(0, 200)
  if (!address) return NextResponse.json({ error: 'address_required' }, { status: 400 })
  const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, QUICK_VISION_PHOTOS).map(parsePhotoDataUrl)
  if (!photos.length || photos.some((p) => !p)) return NextResponse.json({ error: 'photos_invalid', message: `1–${QUICK_VISION_PHOTOS} jpeg/png/webp photos as data URLs, each under 1.5 MB` }, { status: 400 })

  // Each call costs a vision turn — fail closed on both limits.
  if (!(await underHourlyLimit(`quick-draft:${uid}`, PER_USER_PER_HOUR, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '600' } })
  if (!(await underHourlyLimit('quick-draft:global', SITE_PER_HOUR, false))) return NextResponse.json({ error: 'busy' }, { status: 503, headers: { 'Retry-After': '120' } })

  const rent = typeof body.monthly_rent === 'number' && Number.isFinite(body.monthly_rent) && body.monthly_rent > 0 ? Math.round(body.monthly_rent) : null
  const content: ChatContentBlock[] = [
    { type: 'text', text: quickDraftUserText({ address, unit: body.unit, city: body.city, province: body.province, monthly_rent: rent, photoCount: photos.length }) },
    ...photos.map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p!.media_type, data: p!.data } })),
  ]
  const modelId = await getModel('classify')
  const def = (await getModelDefAsync(modelId)) ?? getModelDef(DEFAULT_MODELS.classify)!
  let text = ''
  try {
    const out = await llmChat({
      model: def,
      system: quickDraftSystemPrompt(),
      messages: [{ role: 'user', content }],
      maxTokens: 2500, // thinking-class models spend tokens before the JSON
      jsonMode: true,
      signal: AbortSignal.timeout(60_000),
      meta: { userId: uid, slot: 'classify', source: 'quick-draft' },
    })
    text = out.text || ''
  } catch (e) {
    return NextResponse.json({ error: 'model_failed', message: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, { status: 502 })
  }
  const guess = parseQuickDraftGuess(text, photos.length)
  return NextResponse.json({ guess, model: def.id, photos_read: photos.length }, { headers: { 'Cache-Control': 'no-store' } })
}
