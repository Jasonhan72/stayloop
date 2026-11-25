// POST /api/profile/extract — read the documents an applicant is putting in their own application
// pack (a pay stub, an employment letter) and return the pack fields they show (2026-11-25).
// Called by the AI conversation's pack card (components/agent/PackFillChatCard).
//
// Auth required: it is the applicant's own documents, and each call is a model request. The files
// arrive as multipart form-data and are NOT stored here — a file goes into the pack only when the
// applicant confirms on the card, through /api/profile/files, like every other pack file. Nothing
// is written: no profile row, no file row, no audit event.
//
// Everything returned passes through sanitizePackExtraction: only the pack's own columns, each in
// its own shape; no identifier can come back (lib/profile/packExtract.ts). The monthly income is
// worked out here from the pay as printed, not by the model.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '@/lib/modelConfig'
import { llmChat, type ChatContentBlock } from '@/lib/llmChat'
import { safeParseJson } from '@/lib/agent/turnHelpers'
import { torontoDate } from '@/lib/household/ledger'
import { PACK_EXTRACT_MAX_BYTES, PACK_EXTRACT_MAX_FILES, PACK_EXTRACT_PROMPT, PACK_EXTRACT_TYPES, sanitizePackExtraction } from '@/lib/profile/packExtract'
import { underHourlyLimit } from '@/lib/rateLimit'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7e]/g, '')
  if (!authHeader.toLowerCase().startsWith('bearer ')) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud, error: userErr } = await supabase.auth.getUser()
  if (userErr || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  // One model request over whole documents per call: a durable per-account ceiling, fail-open like every cost guard.
  if (!(await underHourlyLimit(`profile-extract:${ud.user.id}`, 20, true))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'multipart form-data required' }, { status: 400, headers: NO_STORE }) }
  const files = form.getAll('files').filter((f): f is File => f instanceof File).slice(0, PACK_EXTRACT_MAX_FILES)
  if (!files.length) return NextResponse.json({ error: 'no_files' }, { status: 400, headers: NO_STORE })

  const content: ChatContentBlock[] = [{ type: 'text', text: PACK_EXTRACT_PROMPT }]
  let total = 0
  for (const f of files) {
    if (!PACK_EXTRACT_TYPES.test(f.type)) return NextResponse.json({ error: 'file_type' }, { status: 400, headers: NO_STORE })
    const buf = await f.arrayBuffer()
    total += buf.byteLength
    if (total > PACK_EXTRACT_MAX_BYTES) return NextResponse.json({ error: 'file_size' }, { status: 400, headers: NO_STORE })
    const bytes = new Uint8Array(buf)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
    const data = btoa(bin)
    content.push(f.type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: f.type, data } })
  }

  const modelId = await getModel('classify')
  const def = (await getModelDefAsync(modelId)) ?? getModelDef(DEFAULT_MODELS.classify)
  if (!def) return NextResponse.json({ error: 'not_configured' }, { status: 500, headers: NO_STORE })
  let text = ''
  try {
    const r = await llmChat({
      model: def,
      system: 'You read documents and report printed facts as JSON. Output only the JSON object.',
      messages: [{ role: 'user', content }],
      maxTokens: 1500,
      signal: AbortSignal.timeout(60_000),
      meta: { userId: ud.user.id, slot: 'classify', source: 'profile/extract' },
    })
    text = r.text
  } catch (e) {
    console.error('[profile/extract] model call failed', (e as Error).message)
    return NextResponse.json({ error: 'extraction_unavailable' }, { status: 502, headers: NO_STORE })
  }
  // A failed parse degrades to an empty suggestion, never to an error the applicant has to act on.
  return NextResponse.json({ extraction: sanitizePackExtraction(safeParseJson(text), files.length, torontoDate()) }, { headers: NO_STORE })
}
