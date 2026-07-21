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
import { DEFAULT_MODELS, getModel, getModelDef } from '@/lib/modelConfig'
import { llmChat, LlmHttpError, LlmKeyMissingError, LlmTruncatedError, type ChatMessage } from '@/lib/llmChat'

export const runtime = 'edge'

// ── Auth + rate limiting ─────────────────────────────────────────────────────
// This route spends real money (Claude call + up to 3 server-side URL
// fetches per turn), so every path is gated by a durable rate limit:
// - Authorization header present → must be a valid Supabase session
//   (401 otherwise), then per-user hourly limit via bump_agent_rate_limit.
// - No Authorization header → ANONYMOUS PREVIEW mode: real reasoning for
//   the homepage's 免注册体验, strictly limited (8/hour per hashed IP via
//   bump_anon_rate_limit, service-role only, fail-closed), zero persistence
//   (memory_writes/proposed_action forced empty server-side).
const RATE_LIMIT_PER_HOUR = 60
const ANON_RATE_LIMIT_PER_HOUR = 8

// Appended to the system prompt for anonymous preview turns. The server also
// hard-strips memory_writes/proposed_action from the output — this is the
// soft instruction, that is the enforcement.
const ANON_PROMPT_ADDENDUM = `

# 未登录预览会话（重要约束）
这是一个未登录访客的预览会话:
- 只做三类事:找房(search 照常可用)、市场行情解读、租约条款/租房流程解释。
- proposed_action 永远输出 null —— 不要拟议任何关键动作。
- memory_writes 永远输出空数组 [] —— 这个会话没有持久记忆,不要声称"我记住了/我已记下"。
- 当用户想提交申请、盖护照章、发布房源、保存偏好、联系房东/租客等需要账号的能力时,自然地说明"登录后我可以替你……",然后把当下能答的部分照样答好。`

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
    if (host === 'localhost' || host.endsWith('.local') || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host === '[::1]' || host.startsWith('169.254.') || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) || host === '0.0.0.0' || host.endsWith('.internal')) {
      return { content: '[blocked: private/internal URLs not allowed]', images: [] }
    }
    // IP-literal escape hatches the dotted-prefix checks above can't see:
    // bare decimal (http://2130706433 = 127.0.0.1), hex (0x7f000001), and
    // bracketed IPv6 (::ffff:127.0.0.1, fd00::/8, …). Some URL parsers
    // canonicalize these, some don't — reject them all conservatively; no
    // legitimate listing/marketing page is served off a raw IP literal.
    if (/^\d+$/.test(host) || /^0x/i.test(host) || host.startsWith('[')) {
      return { content: '[blocked: IP-literal URLs not allowed]', images: [] }
    }
    // Dotted all-numeric host = IPv4 literal. Re-check private ranges on the
    // parsed octets (catches unusual spellings), and reject leading-zero
    // octets outright — octal ambiguity (0177.0.0.1) can hide a private IP.
    const segs = host.split('.')
    if (segs.length === 4 && segs.every((s) => /^\d+$/.test(s))) {
      const n = segs.map(Number)
      const octal = segs.some((s) => s.length > 1 && s.startsWith('0'))
      const priv =
        n[0] === 0 || n[0] === 10 || n[0] === 127 ||
        (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
        (n[0] === 192 && n[1] === 168) ||
        (n[0] === 169 && n[1] === 254) ||
        (n[0] === 100 && n[1] >= 64 && n[1] <= 127)
      if (octal || priv || n.some((x) => x > 255)) {
        return { content: '[blocked: private/internal URLs not allowed]', images: [] }
      }
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
  // A turn can't populate the lease metadata (tenant_email, current_rent…) the
  // send_renewal_letter executor needs — approving it would 422 forever. Those
  // letters must originate from the proactive sweep (which carries the lease
  // data). Downgrade any turn-proposed renewal to an approval-only note.
  const rawType = pa && typeof pa === 'object' ? String(pa.action_type) : ''
  const safeType = rawType === 'send_renewal_letter' ? 'renewal_note' : rawType
  const proposedAction =
    pa && typeof pa === 'object' && typeof pa.action_type === 'string'
      ? {
          action_type: safeType,
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
  // Cost gate BEFORE any token spend. With an Authorization header the
  // caller must hold a valid session (401 otherwise — the authed path is
  // unchanged). WITHOUT one this is an anonymous preview turn: allowed, but
  // behind a strict fail-closed per-IP hourly limit and zero persistence.
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  const anonymous = !authHeader
  if (anonymous) {
    // Limit key: SHA-256 of the caller IP (Cloudflare's cf-connecting-ip in
    // prod, first x-forwarded-for hop otherwise). Hashing keeps raw IPs out
    // of the rate-limit table; 'unknown' collapses header-less callers into
    // one shared bucket, which fails safe (tighter, not looser).
    const rawIp =
      req.headers.get('cf-connecting-ip') ||
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown'
    // IPv6 callers can rotate interface IDs trivially (privacy extensions /
    // whole-/64 allocations), so bucket them by the /64 prefix instead of the
    // full address — approximated as the first 4 colon groups of the string
    // form via split(':').slice(0,4). Exact for uncompressed addresses; for
    // '::'-compressed forms the prefix may still carry interface bits, so the
    // grouping is partial there — but never looser than the previous
    // full-address key. Anything containing ':' is treated as IPv6; IPv4
    // keys are unchanged.
    const ip = rawIp.includes(':') ? rawIp.split(':').slice(0, 4).join(':') : rawIp
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('anon:' + ip))
    const anonKey = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
    // bump_anon_rate_limit is service-role-only by design (revoked from
    // anon/authenticated) — the service client never leaves this handler.
    // Fail-closed: missing key / RPC error / over limit all → 429.
    let underAnonLimit = false
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (serviceKey) {
      try {
        const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data: ok, error: anonErr } = await svc.rpc('bump_anon_rate_limit', {
          p_key: anonKey,
          p_limit: ANON_RATE_LIMIT_PER_HOUR,
        })
        underAnonLimit = !anonErr && ok === true
      } catch {
        underAnonLimit = false
      }
    }
    if (!underAnonLimit) {
      return NextResponse.json(
        { error: `匿名体验每小时限 ${ANON_RATE_LIMIT_PER_HOUR} 条 —— 登录后不受此额度限制。` },
        { status: 429, headers: { 'Retry-After': '3600' } },
      )
    }
  } else {
    const sbAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: ud, error: ue } = await sbAuth.auth.getUser()
    if (ue || !ud?.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    // Durable per-user hourly limit (edge module state is per-isolate and
    // resets on recycle, so it can't gate spend). Fail-closed on error: if the
    // limiter can't be reached we'd rather 429 than allow unbounded paid calls.
    const { data: underLimit, error: rlErr } = await sbAuth.rpc('bump_agent_rate_limit', { p_limit: RATE_LIMIT_PER_HOUR })
    if (rlErr || underLimit === false) {
      return NextResponse.json(
        { error: 'Rate limit exceeded — retry later' },
        { status: 429, headers: { 'Retry-After': '600' } },
      )
    }
  }

  let body: TurnRequest
  try {
    body = (await req.json()) as TurnRequest
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { role, message } = body
  // Input clamps (anonymous AND authed): every string here is interpolated
  // into the system/user prompt, so unbounded client payloads are unbounded
  // token spend. Truncate, don't reject — oversized-but-honest clients keep
  // working.
  const agentName = typeof body.agentName === 'string' ? body.agentName.slice(0, 40) : ''
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

  const memories = (Array.isArray(body.memories) ? body.memories : [])
    .slice(0, 50)
    .map((m) => ({
      ...m,
      key: typeof m?.key === 'string' ? m.key.slice(0, 500) : m?.key,
      value: typeof m?.value === 'string' ? m.value.slice(0, 500) : m?.value,
    }))
  // Field-level normalization, not just `?? default` — a crafted payload with
  // a partial workflow object (missing completed_steps) used to crash
  // buildSystemPrompt's .join() into a bare worker 500.
  const w = (body.workflow ?? {}) as Partial<WorkflowState>
  const workflow: WorkflowState = {
    workflow_type: typeof w.workflow_type === 'string' ? w.workflow_type : '',
    workflow_id: w.workflow_id ?? null,
    current_stage: typeof w.current_stage === 'string' ? w.current_stage : '',
    completed_steps: Array.isArray(w.completed_steps) ? w.completed_steps.slice(0, 20) : [],
    status: typeof w.status === 'string' ? w.status : 'active',
  }
  const system =
    buildSystemPrompt(role, agentName, memories, workflow, body.stageLabel) +
    (anonymous ? ANON_PROMPT_ADDENDUM : '')

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
  // Each pasted URL costs a server-side fetch (Jina render) — anonymous
  // preview turns get 1, authed turns keep 3.
  const urls = (message.match(URL_RE) || []).slice(0, anonymous ? 1 : 3)
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
  const userContent: ChatMessage['content'] = imgs.length
    ? [
        { type: 'text', text: userText },
        ...imgs.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.media_type, data: im.data } })),
      ]
    : userText

  let raw = ''
  let modelUsed = DEFAULT_MODELS.turn
  try {
    // Admin-configurable model slot (60s edge cache) — see lib/modelConfig.ts.
    // getModels() already guards allowedSlots + provider-key availability, so
    // an openai-compat id only reaches here when its key is configured.
    const configuredId = await getModel('turn')
    let def = getModelDef(configuredId) ?? getModelDef(DEFAULT_MODELS.turn)!
    // Vision guard: text-only 国产 models can't see image attachments — fall
    // back to the Anthropic default for THIS turn only (don't break the user).
    if (imgs.length && !def.vision) {
      console.warn(`[agent/turn] model fallback: ${def.id} lacks vision, image turn routed to ${DEFAULT_MODELS.turn}`)
      def = getModelDef(DEFAULT_MODELS.turn)!
    }
    modelUsed = def.id
    const { text } = await llmChat({
      model: def,
      system,
      messages: [{ role: 'user', content: userContent }],
      // openai-compat reasoning models (Kimi 思考型 etc.) spend part of the
      // budget on hidden reasoning_content before visible output — give them
      // headroom so the JSON answer isn't cut. Anthropic keeps 2500.
      maxTokens: def.provider === 'openai-compat' ? 4000 : 2500,
      temperature: 0.4,
      // 国产 openai-compat 路径强制 json_object，配合下方既有的 JSON 解析
      // + prose 抢救逻辑；Anthropic 路径行为不变（prompt 契约）。
      jsonMode: def.provider === 'openai-compat',
      signal: AbortSignal.timeout(45000),
    })
    raw = text
  } catch (e) {
    // Classify LLM failures HERE, once: full detail goes to the server log,
    // the client gets a stable coarse label it can match on ('llm http N' /
    // 'llm unavailable' / 'llm truncated') — provider response bodies are
    // never forwarded to the browser.
    if (e instanceof LlmHttpError) {
      console.error(`[agent/turn] llm http ${e.status} (${modelUsed}):`, e.body)
      throw new Error(`llm http ${e.status}`)
    }
    if (e instanceof LlmKeyMissingError) {
      console.error(`[agent/turn] ${e.message}`)
      throw new Error('llm unavailable')
    }
    if (e instanceof LlmTruncatedError) {
      console.error(`[agent/turn] (${modelUsed}) ${e.message}`)
      throw new Error('llm truncated')
    }
    const msg = (e as Error).message || ''
    if ((e as Error).name === 'TimeoutError') throw new Error(`reasoning timeout: ${msg}`)
    throw new Error(`reasoning failed: ${msg}`)
  }

  const parsed = safeParseJson(raw)
  // The model occasionally answers a factual question in plain prose despite
  // the JSON contract. Salvage that text as the reply — losing a real answer
  // behind a canned "我记下了" (which falsely implies success) is worse.
  let salvage = parsed ? '' : raw.replace(/```(?:json)?|```/g, '').trim()
  // BUT never surface a broken-JSON fragment as if it were prose: if the
  // unparseable output still looks like JSON (starts with '{' or carries a
  // "reply" field — typically truncated mid-object), pull just the value of
  // "reply" out with an escape-aware regex; if even that fails, fall through
  // to the honest 重发 copy below rather than echoing raw JSON at the user.
  if (salvage && (salvage.startsWith('{') || salvage.includes('"reply"'))) {
    const m = salvage.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (m) {
      try {
        salvage = JSON.parse(`"${m[1]}"`) as string
      } catch {
        salvage = m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
      }
    } else {
      salvage = ''
    }
  }
  const fallbackReply = salvage
    ? salvage.slice(0, 2000)
    : '这条我没生成出有效回复（输出格式出错了）。请把消息原样再发一次 —— 不用换措辞。'
  const normalized = normalizeOutput(parsed, fallbackReply)

  // Compliance Guardrail — the deterministic backstop on every AI output.
  const { out, flags } = applyGuardrail(role, normalized)

  // Listing search (tenant): when the model flags intent, search Stayloop's
  // own listings first, then fall back to external (Realtor.ca).
  let listings: ListingCard[] | undefined
  let listingsSource: 'stayloop' | 'realtor' | undefined
  let market: Record<string, unknown> | undefined
  let followups: { question: string; options: string[] }[] | undefined
  const search = parsed?.search as Record<string, unknown> | null | undefined
  if (role === 'tenant' && search && typeof search === 'object') {
    try {
      const result = await searchListings({
        area: typeof search.area === 'string' ? search.area : null,
        area_candidates: Array.isArray(search.area_candidates)
          ? (search.area_candidates as unknown[]).filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 3)
          : null,
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
        // The user asked for N and we found fewer — say so instead of letting
        // the reply's "马上给你 N 套" stand uncorrected.
        const wanted = typeof search.count === 'number' ? Math.min(Math.max(search.count, 1), 6) : null
        if (wanted && result.listings.length < wanted) {
          const zhMsg = /[一-鿿]/.test(message)
          out.reply += zhMsg
            ? `\n\n（符合条件且没给你看过的这次只找到 ${result.listings.length} 套 —— 该区域预算内的新房源有限。想看更多可以放宽预算/扩大区域，或过两天再来，我会盯着新上的。）`
            : `\n\n(Only ${result.listings.length} new matches this time — inventory in this area within budget is thin. Widen the budget/area for more, or check back soon; I'll keep watching new listings.)`
        }
      } else {
        // Zero real matches (Stayloop empty + Realtor.ca scrape missed).
        // The model's reply usually promises cards — correct it honestly
        // instead of fabricating inventory.
        const zhMsg = /[一-鿿]/.test(message)
        out.reply += zhMsg
          ? '\n\n这次没能拿到符合条件的实时房源（Stayloop 库里没有匹配，Realtor.ca 抓取也没返回结果）。你可以换个说法再让我搜一次，或放宽预算/区域试试 —— 我不会拿编造的房源充数。'
          : "\n\nI couldn't pull any real listings matching this just now (no Stayloop match, and the Realtor.ca fetch returned nothing). Try rephrasing or widening the budget/area — I won't pad the results with made-up listings."
      }
      // Proactive market context — real prices from the area sample, computed
      // server-side (never by the model).
      if (result.market) market = result.market as unknown as Record<string, unknown>

      // Proactive clarifying questions with tap-to-answer chips, derived from
      // whichever key criteria the user hasn't given yet (max 2 per turn).
      const cjk = /[一-鿿]/.test(message)
      const fq: { question: string; options: string[] }[] = []
      if (search.max_price == null)
        fq.push(
          cjk
            ? { question: '预算大概多少?', options: ['预算 $2,000 以内', '预算 $2,500 以内', '预算 $3,000 以内', '预算不限'] }
            : { question: "What's your budget?", options: ['Under $2,000', 'Under $2,500', 'Under $3,000', 'No limit'] }
        )
      if (search.min_beds == null)
        fq.push(
          cjk
            ? { question: '想要几居室?', options: ['Studio 就行', '一居室', '两居室', '三居以上'] }
            : { question: 'How many bedrooms?', options: ['Studio is fine', '1 bedroom', '2 bedrooms', '3+'] }
        )
      if (search.pets == null)
        fq.push(
          cjk
            ? { question: '有宠物吗?', options: ['要养宠物', '不养宠物'] }
            : { question: 'Any pets?', options: ['I have a pet', 'No pets'] }
        )
      if (search.property_type == null)
        fq.push(
          cjk
            ? { question: '公寓还是整套房子?', options: ['要公寓', '要整套 House', '都可以'] }
            : { question: 'Condo or a whole house?', options: ['Condo/apartment', 'Whole house', 'Either'] }
        )
      if (fq.length) followups = fq.slice(0, 2)
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
    // Anonymous preview is ZERO-persistence by contract — the model is told
    // not to emit these, but the server strip (post-guardrail) is the
    // guarantee, not the instruction.
    memory_writes: anonymous ? [] : out.memoryWrites,
    proposed_action: anonymous ? null : out.proposedAction,
    next_stage: out.nextStage,
    listings,
    listings_source: listingsSource,
    market,
    followups,
    draft_listing: draftListing,
    url_images: urlImages.length ? urlImages : undefined,
    // Non-sensitive: the model id string that actually served this turn
    // (post vision-fallback) — for verification and back-office debugging.
    model_used: modelUsed,
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
