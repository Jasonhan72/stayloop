// POST /api/onboard/assist — the AI Agent reads what an applicant gave and returns a SUGGESTION for
// the application form (2026-11-23; rules and vocabulary in lib/onboard/assist.ts).
//
//   · Signed-in accounts only (it spends model budget); anonymous sessions are refused.
//   · multipart form-data: `text` (their own words, may contain up to two links to their own site),
//     `files` (≤4 images the browser has already downscaled; a PDF is rendered to page images in the
//     browser, so nothing but jpeg / png / webp arrives here), `hint` (the form they opened), `lang`.
//   · It never writes anything: no record, no file. The images live for the length of this request.
//   · Links are fetched directly (https, public hosts, every redirect hop re-checked, body capped).
//     Regulators' registers and Realtor.ca / MLS hosts are refused before any request is made.
//   · The answer is whatever survives sanitizeSuggestion; the form shows it for the person to check
//     and submit. Extraction speeds the form up, it never bypasses it.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { llmChat, type ChatContentBlock } from '@/lib/llmChat'
import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '@/lib/modelConfig'
import { underCostLimits } from '@/lib/rateLimit'
import { safeParseJson } from '@/lib/agent/turnHelpers'
import { fetchPublicHttps, readTextCapped } from '@/lib/net/publicUrl'
import { isMlsHost } from '@/lib/listings/externalSources'
import {
  ASSIST_IMAGE_TYPES, ASSIST_MAX_FILES, ASSIST_MAX_IMAGE_BYTES, ASSIST_MAX_TEXT, ASSIST_PAGE_CHARS,
  assistSystemPrompt, assistUserText, isJoinKind, isRegisterHost, linksIn, pageText, sanitizeSuggestion, suggestionSize, withStated,
} from '@/lib/onboard/assist'

const PER_USER_PER_HOUR = 20
const SITE_PER_HOUR = 300
/** A page's HTML is read up to here; its text is cut again before it reaches the model. */
const PAGE_BYTES = 700_000

type LinkResult = { url: string; ok: boolean; reason?: 'register' | 'mls' | 'blocked' | 'unreachable' | 'empty' }

async function readPage(url: string): Promise<{ result: LinkResult; text: string }> {
  const no = (reason: LinkResult['reason']) => ({ result: { url, ok: false, reason }, text: '' })
  if (isRegisterHost(url)) return no('register')
  if (isMlsHost(url)) return no('mls')
  let res: Response
  try {
    res = await fetchPublicHttps(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Stayloop/1.0; +https://www.stayloop.ai)', Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8', 'Accept-Language': 'en-CA,en;q=0.9,zh;q=0.6' },
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    return no((e as Error)?.message === 'blocked_url' ? 'blocked' : 'unreachable')
  }
  // a short link may end on a host that is never read
  if (res.url && (isRegisterHost(res.url) || isMlsHost(res.url))) return no(isMlsHost(res.url) ? 'mls' : 'register')
  if (!res.ok) return no('unreachable')
  if (!/text\/html|application\/xhtml|text\/plain/i.test(res.headers.get('content-type') || '')) return no('empty')
  const text = pageText(await readTextCapped(res, PAGE_BYTES)).slice(0, ASSIST_PAGE_CHARS)
  return text.length < 80 ? no('empty') : { result: { url, ok: true }, text }
}

/** jpeg / png / webp by their first bytes; what the browser says the type is does not count. */
function sniff(b: Uint8Array): (typeof ASSIST_IMAGE_TYPES)[number] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}
function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader.toLowerCase().startsWith('bearer ')) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  const uid = ud?.user?.id
  if (!uid || ud?.user?.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const text = String(form.get('text') ?? '').slice(0, ASSIST_MAX_TEXT)
  const zh = form.get('lang') !== 'en'
  const hintRaw = form.get('hint')
  const hint = isJoinKind(hintRaw) ? hintRaw : null

  const images: { media_type: (typeof ASSIST_IMAGE_TYPES)[number]; data: string }[] = []
  for (const f of form.getAll('files').filter((x): x is File => x instanceof File).slice(0, ASSIST_MAX_FILES)) {
    if (f.size > ASSIST_MAX_IMAGE_BYTES) return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
    const bytes = new Uint8Array(await f.arrayBuffer())
    const type = sniff(bytes)
    if (!type) return NextResponse.json({ error: 'image_type' }, { status: 400 })
    images.push({ media_type: type, data: base64(bytes) })
  }

  const links = linksIn(text)
  const said = text.replace(/\bhttps?:\/\/\S+/gi, ' ').trim()
  if (said.length < 4 && !links.length && !images.length) return NextResponse.json({ error: 'nothing_to_read' }, { status: 400 })

  // One model call per request, and up to two page fetches: a ceiling per account and for the site (cost guards fail open).
  if (!(await underCostLimits('onboard-assist', uid, PER_USER_PER_HOUR, SITE_PER_HOUR))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '600' } })

  const read = await Promise.all(links.map(readPage))
  const pages = read.filter((r) => r.result.ok).map((r) => ({ url: r.result.url, text: r.text }))
  const linkResults = read.map((r) => r.result)
  // only links, and none of them could be read: there is nothing for the model to work from
  if (said.length < 4 && !pages.length && !images.length) return NextResponse.json({ error: 'link_unreadable', links: linkResults }, { status: 422 })

  const content: ChatContentBlock[] = [
    { type: 'text', text: assistUserText({ text: said, pages, images: images.length, hint, zh, today: new Date().toISOString().slice(0, 10) }) },
    ...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.media_type, data: i.data } })),
  ]
  const modelId = await getModel('classify')
  const def = (await getModelDefAsync(modelId)) ?? getModelDef(DEFAULT_MODELS.classify)
  if (!def) return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  let out = ''
  try {
    const r = await llmChat({
      model: def,
      system: assistSystemPrompt(),
      messages: [{ role: 'user', content }],
      maxTokens: 3000, // thinking-class models spend tokens before the JSON
      jsonMode: true,
      signal: AbortSignal.timeout(60_000),
      meta: { userId: uid, slot: 'classify', source: 'onboard/assist' },
    })
    out = r.text || ''
  } catch (e) {
    console.error('[onboard/assist] model call failed', (e as Error)?.message)
    return NextResponse.json({ error: 'model_failed' }, { status: 502 })
  }
  // the model's answer through the sanitizer, then the person's own sentence against the fixed word list
  const suggestion = withStated(sanitizeSuggestion(safeParseJson(out)), said)
  return NextResponse.json({ suggestion, found: suggestionSize(suggestion), links: linkResults, images: images.length }, { headers: { 'Cache-Control': 'no-store' } })
}
