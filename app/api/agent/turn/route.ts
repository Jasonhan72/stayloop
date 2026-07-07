// /api/agent/turn — the Personal Agent reasoning step (architecture L3/L4).
// STATELESS by design: the client passes the RLS-scoped session context
// (memory + workflow), this route runs the role's reasoning through Claude,
// applies the Compliance Guardrail, and returns { reply, memory_writes,
// proposed_action, next_stage }. The client persists results via its own
// RLS-scoped Supabase client (same pattern as memory.ts / approval-engine.ts).
// The Anthropic key stays server-side only.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AgentRole, DraftListing, ListingCard, MemoryItem, WorkflowState } from '@/lib/agent/types'
import { buildSystemPrompt } from '@/lib/agent/prompts'
import { applyGuardrail, sanitizeDraftListing, type TurnOutput } from '@/lib/agent/guardrail'
import { searchListings } from '@/lib/agent/listingSearch'

export const runtime = 'edge'

// ── Auth + rate limiting ─────────────────────────────────────────────────────
// This route spends real money (Claude call + up to 3 server-side URL
// fetches per turn). It MUST be gated: the "anonymous → canned fallback"
// path lives in the client (orchestrator.ts), which is a UX choice, not a
// security boundary. Pattern mirrors /api/classify-files.
const RATE_LIMIT_PER_HOUR = 60
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now()
  const bucket = rateLimitBuckets.get(userId)
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { ok: true }
  }
  if (bucket.count >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  bucket.count++
  return { ok: true }
}

type TurnRequest = {
  role: AgentRole
  agentName: string
  message: string
  memories: MemoryItem[]
  workflow: WorkflowState
  stageLabel?: string
  images?: { media_type: string; data: string }[]
  attachment_names?: string[]
  exclude?: string[]
  history?: { role: 'user' | 'agent'; text: string }[]
}

const VALID_ROLES = new Set<AgentRole>(['tenant', 'landlord', 'agent'])

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

type FetchResult = { content: string | null; images: string[]; reason?: string }

const IMG_MD_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi
const IMG_TAG_RE = /<img[^>]+src=["'](https?:\/\/[^\s"'>]+)/gi
const OG_IMG_RE = /(?:property|name)=["']og:image["'][^>]*content=["'](https?:\/\/[^\s"'>]+)/gi

const EXCLUDE_IMG = /logo|icon|avatar|favicon|pixel|tracking|badge|button|sprite|1x1|platform-assets|search-bar|\/user\/|profile_pic|\.svg|\.gif|\.mov|\.mp4|\.webm|\.css|\.js(?:\?|$)/i

function extractImageUrls(text: string): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const re of [IMG_MD_RE, IMG_TAG_RE, OG_IMG_RE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const u = m[1]
      if (!seen.has(u) && !EXCLUDE_IMG.test(u) && u.length > 20) {
        seen.add(u)
        urls.push(u)
      }
    }
  }
  // Listing-gallery preference: Airbnb serves the ACTUAL listing photos from
  // im/pictures/hosting/… — when those exist, use only them (everything else
  // on the page is UI chrome, host avatars or "similar listings" thumbs).
  // Also upgrade Airbnb's size hint to a card-quality width.
  const gallery = urls.filter((u) => /im\/pictures\/(?:hosting|miso|prohost-api)\//i.test(u))
  const picked = (gallery.length ? gallery : urls).slice(0, 8)
  return picked.map((u) => u.replace(/([?&]im_w=)\d+/, '$11200'))
}

async function fetchUrlContent(url: string): Promise<FetchResult> {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { content: '[blocked: only http/https URLs allowed]', images: [] }
    }
    // Host-dashboard URLs (Airbnb hosting editor, Realtor member portals…)
    // sit behind login — no reader can fetch them. Return a precise hint so
    // the model tells the user exactly what link WOULD work, instead of
    // guessing at the listing contents.
    if (/airbnb\.[a-z.]+$/i.test(parsed.hostname) && /\/hosting\//i.test(parsed.pathname)) {
      return {
        content: '[无法读取：这是 Airbnb 房东后台链接（/hosting/…），需要登录，任何抓取服务都读不到。请让用户提供该房源的公开页面链接（形如 https://www.airbnb.ca/rooms/12345），或直接把房源描述/截图发进来。切勿根据这个链接猜测房源内容。]',
        images: [],
      }
    }
    const host = parsed.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host === '[::1]' || host.startsWith('169.254.') || host.startsWith('172.16.') || host.startsWith('172.17.') || host.startsWith('172.18.') || host.startsWith('172.19.') || host.startsWith('172.2') || host.startsWith('172.30.') || host.startsWith('172.31.') || host === '0.0.0.0' || host.endsWith('.internal')) {
      return { content: '[blocked: private/internal URLs not allowed]', images: [] }
    }
  } catch {
    return { content: '[invalid URL]', images: [] }
  }
  const jinaKey = process.env.JINA_API_KEY
  let failReason = jinaKey ? '' : 'no reader key configured'
  try {
    if (jinaKey) {
      const res = await fetch(`https://r.jina.ai/${encodeURI(url)}`, {
        headers: {
          Authorization: `Bearer ${jinaKey}`,
          Accept: 'application/json',
          'X-Return-Format': 'markdown',
        },
        signal: AbortSignal.timeout(18000),
      })
      if (res.ok) {
        const json = await res.json() as { data?: { content?: string; title?: string; warning?: string; httpStatus?: number } }
        const content = json.data?.content?.trim()
        if (content) {
          const title = json.data?.title ? `# ${json.data.title}\n\n` : ''
          const warning = json.data?.warning ? `[注意: ${json.data.warning}]\n\n` : ''
          const images = extractImageUrls(content)
          return { content: (warning + title + content).slice(0, 8000), images }
        }
        failReason = 'reader returned empty content'
      } else {
        failReason = `reader http ${res.status}`
      }
    }
    // redirect:'manual' — following redirects would let a public URL 302 to
    // an internal/link-local address AFTER the hostname blocklist check.
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Stayloop-Agent/1.0', Accept: 'text/html,text/plain,*/*' },
      signal: AbortSignal.timeout(6000),
      redirect: 'manual',
    })
    if (!res.ok) return { content: null, images: [], reason: `${failReason}; direct http ${res.status}`.replace(/^; /, '') }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/') && !ct.includes('json') && !ct.includes('xml')) return { content: null, images: [], reason: `non-text content (${ct.slice(0, 40)})` }
    const html = await res.text()
    const images = extractImageUrls(html)
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return { content: stripped.slice(0, 6000) || null, images, reason: stripped ? undefined : `${failReason}; direct returned empty text`.replace(/^; /, '') }
  } catch (e) {
    return { content: null, images: [], reason: `${failReason}; ${(e as Error)?.name === 'TimeoutError' ? 'fetch timeout' : (e as Error)?.message?.slice(0, 60) || 'fetch failed'}`.replace(/^; /, '') }
  }
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  // The model is asked for bare JSON, but tolerate ```json fences / prose.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeOutput(parsed: Record<string, unknown> | null, fallbackReply: string): TurnOutput {
  if (!parsed) return { reply: fallbackReply, memoryWrites: [], proposedAction: null, nextStage: null }

  const memoryWrites = Array.isArray(parsed.memory_writes)
    ? (parsed.memory_writes as Record<string, unknown>[])
        .filter((m) => m && typeof m.key === 'string')
        .map((m) => ({
          key: String(m.key),
          label: String(m.label ?? m.key),
          value: m.value ?? null,
          memory_type: String(m.memory_type ?? 'preference'),
          confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
        }))
    : []

  const pa = parsed.proposed_action as Record<string, unknown> | null | undefined
  const proposedAction =
    pa && typeof pa === 'object' && typeof pa.action_type === 'string'
      ? {
          action_type: String(pa.action_type),
          title: String(pa.title ?? '待你确认'),
          summary: String(pa.summary ?? ''),
          recipient_label: pa.recipient_label ? String(pa.recipient_label) : null,
          data_scope: Array.isArray(pa.data_scope) ? (pa.data_scope as unknown[]).map(String) : [],
          excluded_data: Array.isArray(pa.excluded_data) ? (pa.excluded_data as unknown[]).map(String) : [],
          risk_level: (['low', 'medium', 'high'].includes(String(pa.risk_level))
            ? String(pa.risk_level)
            : 'medium') as 'low' | 'medium' | 'high',
        }
      : null

  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply : fallbackReply,
    memoryWrites,
    proposedAction,
    nextStage: typeof parsed.next_stage === 'string' ? parsed.next_stage : null,
  }
}

export async function POST(req: Request) {
  // Auth gate BEFORE any token spend — reject anonymous callers with 401.
  // The client's demo mode never calls this route for anonymous sessions;
  // a 401 here only ever means a crafted/stale request.
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const sbAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: ud, error: ue } = await sbAuth.auth.getUser()
  if (ue || !ud?.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  const rl = checkRateLimit(ud.user.id)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded — retry later' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    )
  }

  let body: TurnRequest
  try {
    body = (await req.json()) as TurnRequest
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { role, agentName, message } = body
  const imgs = (Array.isArray(body.images) ? body.images : [])
    .filter((im) => im && typeof im.data === 'string' && /^image\//.test(im.media_type || ''))
    .slice(0, 3)
  const attachmentNames = Array.isArray(body.attachment_names) ? body.attachment_names.map(String) : []
  if (!VALID_ROLES.has(role) || typeof message !== 'string' || (!message.trim() && imgs.length === 0)) {
    return NextResponse.json({ error: 'role and message (or an image) are required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'agent reasoning unavailable' }, { status: 503 })
  }

  const memories = Array.isArray(body.memories) ? body.memories : []
  const workflow: WorkflowState =
    body.workflow ?? { workflow_type: '', workflow_id: null, current_stage: '', completed_steps: [], status: 'active' }
  const system = buildSystemPrompt(role, agentName, memories, workflow, body.stageLabel)

  // ---- Heartbeat-streamed response ------------------------------------------
  // URL fetching (Jina render of Airbnb/Realtor pages) plus Claude generation
  // can exceed the gateway's first-byte window — observed as a 504 at ~21s on
  // Airbnb imports, which the client then masks with the canned fallback.
  // Fix: respond IMMEDIATELY with a whitespace heartbeat (legal JSON leading
  // whitespace) every 3s while the turn runs, then emit the final JSON.
  // The client's res.json() parses the whole body unchanged.
  const runTurn = async (): Promise<Record<string, unknown>> => {

  // Fetch any URLs the user pasted so the agent can see the content.
  let urlContext = ''
  let urlImages: string[] = []
  const urls = (message.match(URL_RE) || []).slice(0, 3)
  if (urls.length) {
    const results = await Promise.all(urls.map((u) => fetchUrlContent(u).then((r) => ({ url: u, ...r }))))
    const fetched = results.filter((r) => r.content)
    const failed = results.filter((r) => !r.content)
    urlImages = results.flatMap((r) => r.images)
    if (fetched.length) {
      urlContext = '\n\n[用户分享的链接内容]\n' +
        fetched.map((r) => `--- ${r.url} ---\n${r.content}`).join('\n\n')
    }
    if (failed.length) {
      urlContext += '\n\n[链接读取失败]\n' +
        failed.map((r) => `${r.url}${r.reason ? `（原因: ${r.reason}）` : ''}`).join('\n') +
        '\n(告诉用户这个链接暂时读不到——如原因是超时,让他直接重发一次即可;否则建议截图或复制文字发给你)'
    }
  }

  // Build the user turn — text (+ attachment note) and any image blocks for Vision.
  const note = attachmentNames.length ? `\n\n[用户上传了文件：${attachmentNames.join('、')}]` : ''
  const hist = (Array.isArray(body.history) ? body.history : []).slice(-6)
  const histText = hist.length
    ? '[最近对话,供理解上下文]\n' +
      hist.map((h) => `${h.role === 'user' ? '用户' : agentName}: ${String(h.text || '').slice(0, 200)}`).join('\n') +
      '\n\n[当前消息]\n'
    : ''
  const userText = histText + (message.trim() || '（用户上传了文件,请查看并回应）').slice(0, 4000) + note + urlContext
  const userContent: unknown = imgs.length
    ? [
        { type: 'text', text: userText },
        ...imgs.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
      ]
    : userText

  let raw = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        temperature: 0.4,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`reasoning error: ${errText.slice(0, 300)}`)
    }
    const data = (await res.json()) as { content?: Array<{ text?: string }> }
    raw = data.content?.[0]?.text || ''
  } catch (e) {
    throw new Error(`reasoning timeout: ${(e as Error).message}`)
  }

  const fallbackReply = `我记下了:"${message.trim().slice(0, 120)}"。需要对外分享或提交的动作,都会先作为待批准卡片让你确认。`
  const parsed = safeParseJson(raw)
  const normalized = normalizeOutput(parsed, fallbackReply)

  // Compliance Guardrail — the deterministic backstop on every AI output.
  const { out, flags } = applyGuardrail(role, normalized)

  // Listing search (tenant): when the model flags intent, search Stayloop's
  // own listings first, then fall back to external (Realtor.ca).
  let listings: ListingCard[] | undefined
  let listingsSource: 'stayloop' | 'realtor' | undefined
  const search = parsed?.search as Record<string, unknown> | null | undefined
  if (role === 'tenant' && search && typeof search === 'object') {
    try {
      const result = await searchListings({
        area: typeof search.area === 'string' ? search.area : null,
        max_price: typeof search.max_price === 'number' ? search.max_price : null,
        min_beds: typeof search.min_beds === 'number' ? search.min_beds : null,
        pets: typeof search.pets === 'boolean' ? search.pets : null,
        property_type: typeof search.property_type === 'string' ? search.property_type : null,
        keywords: typeof search.keywords === 'string' ? search.keywords : null,
        count: typeof search.count === 'number' ? search.count : null,
      }, Array.isArray(body.exclude) ? body.exclude.map(String) : [])
      if (result.listings.length) {
        listings = result.listings
        // Stayloop-first results may be topped up with external — derive the
        // banner from what actually came back.
        const hasStay = result.listings.some((l) => l.source === 'stayloop')
        const hasRealtor = result.listings.some((l) => l.source === 'realtor')
        listingsSource = hasStay && !hasRealtor ? 'stayloop' : !hasStay && hasRealtor ? 'realtor' : undefined
      }
    } catch (e) {
      console.warn('[agent] listing search failed', (e as Error).message)
    }
  }

  // Draft listing (landlord): when the model returns a draft_listing object,
  // pass it through so the client can render a preview card in the chat.
  let draftListing: DraftListing | undefined
  const dl = parsed?.draft_listing as Record<string, unknown> | null | undefined
  if (role === 'landlord' && dl && typeof dl === 'object' && typeof dl.address === 'string' && typeof dl.monthly_rent === 'number') {
    const dlImages = Array.isArray(dl.images) ? (dl.images as unknown[]).map(String).filter((u: string) => u.startsWith('http')) : []
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    const strArr = (v: unknown) => (Array.isArray(v) && v.length ? (v as unknown[]).map(String) : undefined)
    draftListing = {
      address: String(dl.address),
      monthly_rent: dl.monthly_rent as number,
      title: typeof dl.title === 'string' ? dl.title : undefined,
      unit: typeof dl.unit === 'string' ? dl.unit : undefined,
      city: typeof dl.city === 'string' ? dl.city : 'Toronto',
      neighborhood: typeof dl.neighborhood === 'string' ? dl.neighborhood : undefined,
      bedrooms: typeof dl.bedrooms === 'number' ? dl.bedrooms : undefined,
      bathrooms: typeof dl.bathrooms === 'number' ? dl.bathrooms : undefined,
      sqft: typeof dl.sqft === 'number' ? dl.sqft : undefined,
      available_date: typeof dl.available_date === 'string' ? dl.available_date : undefined,
      description: typeof dl.description === 'string' ? dl.description : undefined,
      parking: typeof dl.parking === 'string' ? dl.parking : undefined,
      pet_policy: typeof dl.pet_policy === 'string' ? dl.pet_policy : undefined,
      amenities: Array.isArray(dl.amenities) ? (dl.amenities as unknown[]).map(String) : undefined,
      has_den: typeof dl.has_den === 'boolean' ? dl.has_den : undefined,
      property_type:
        typeof dl.property_type === 'string' &&
        ['apartment', 'condo', 'house', 'townhouse', 'basement', 'duplex'].includes(dl.property_type)
          ? dl.property_type
          : 'condo',
      // Realtor.ca / CREA DDF-aligned fields — extracted when the source
      // content mentions them, otherwise left empty.
      ownership_title: ['condominium', 'freehold'].includes(String(dl.ownership_title)) ? String(dl.ownership_title) : undefined,
      year_built: num(dl.year_built),
      storeys: num(dl.storeys),
      sqft_max: num(dl.sqft_max),
      bedrooms_above_grade: num(dl.bedrooms_above_grade),
      bedrooms_below_grade: num(dl.bedrooms_below_grade),
      bathrooms_half: num(dl.bathrooms_half),
      furnished: typeof dl.furnished === 'boolean' ? dl.furnished : undefined,
      pets_allowed: ['yes', 'no', 'restricted'].includes(String(dl.pets_allowed)) ? String(dl.pets_allowed) : undefined,
      heating_type: str(dl.heating_type),
      heating_fuel: str(dl.heating_fuel),
      cooling: str(dl.cooling),
      basement_type: str(dl.basement_type),
      exterior_finish: str(dl.exterior_finish),
      land_size: str(dl.land_size),
      appliances: strArr(dl.appliances),
      building_features: strArr(dl.building_features),
      parking_spaces: num(dl.parking_spaces),
      maintenance_fee: num(dl.maintenance_fee),
      management_company: str(dl.management_company),
      cross_streets: str(dl.cross_streets),
      deposit: num(dl.deposit),
      lease_term: str(dl.lease_term),
      virtual_tour_url: str(dl.virtual_tour_url)?.startsWith('http') ? str(dl.virtual_tour_url) : undefined,
      mls_number: str(dl.mls_number),
      source_url: urls[0] || undefined,
      images: urlImages.length ? urlImages : dlImages.length ? dlImages : undefined,
    }
    // The draft card renders with an edit/publish CTA — it must pass the
    // same OHRC/RTA compliance filters as the reply text.
    const sanitized = sanitizeDraftListing(draftListing)
    draftListing = sanitized.draft
    if (sanitized.flags.length) {
      flags.push(...sanitized.flags)
      if (sanitized.note) out.reply += `\n\n${sanitized.note}`
    }

    // Grounding backstop: the address must actually come from something the
    // user provided (this message, recent history, or fetched link content).
    // The model is instructed never to invent one, but a deterministic check
    // is the guarantee — a hallucinated address on a publish-ready card is
    // worse than no card. Heuristic: the street NUMBER (the least ambiguous
    // token) must appear in the user-provided text.
    if (draftListing) {
      const groundText = [
        message,
        ...(Array.isArray(body.history) ? body.history.map((h) => h?.text || '') : []),
        urlContext,
      ].join(' ').toLowerCase()
      const streetNum = draftListing.address.match(/\d{1,6}/)?.[0]
      if (streetNum && !groundText.includes(streetNum)) {
        flags.push('draft_listing_ungrounded_address')
        draftListing = undefined
        out.reply +=
          '\n\n⚠️ 我刚才差点用了一个不是你提供的地址，已经拦下。请把房源地址（含门牌号和单元号）发给我，我再生成预览卡片。'
      }
    }
  }

  return {
    reply: out.reply,
    memory_writes: out.memoryWrites,
    proposed_action: out.proposedAction,
    next_stage: out.nextStage,
    listings,
    listings_source: listingsSource,
    draft_listing: draftListing,
    url_images: urlImages.length ? urlImages : undefined,
    guardrail: { flagged: flags.length > 0, notes: flags },
  }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(' '))
      const hb = setInterval(() => {
        try { controller.enqueue(encoder.encode(' ')) } catch { clearInterval(hb) }
      }, 3000)
      runTurn()
        .then((payload) => {
          clearInterval(hb)
          controller.enqueue(encoder.encode(JSON.stringify(payload)))
          controller.close()
        })
        .catch((e) => {
          clearInterval(hb)
          try {
            controller.enqueue(encoder.encode(JSON.stringify({ error: ((e as Error)?.message || 'turn failed').slice(0, 300) })))
            controller.close()
          } catch { /* stream already dead */ }
        })
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
