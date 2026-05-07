// -----------------------------------------------------------------------------
// Tool: import_listing
// -----------------------------------------------------------------------------
// Convert messy listing input (pasted text, URL, or MLS export) into a
// structured listing object with bilingual title + description.
//
// Supports:
//   - Pasted text (free-form description)
//   - Realtor.ca / Kijiji / 51.ca URLs (Cloudflare Worker fetches HTML, AI extracts)
//   - MLS PDF export (passed in as Supabase Storage path)
// -----------------------------------------------------------------------------

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

const HAIKU_MODEL = 'claude-haiku-4-5'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

interface ImportInput {
  /** Source kind. 'text' is the simplest — just paste the description. */
  source: 'text' | 'url' | 'pdf'
  /** Free-form text (when source='text'). */
  text?: string
  /** URL to fetch (when source='url'). */
  url?: string
  /** Supabase Storage path to a PDF (when source='pdf'). */
  pdf_path?: string
}

interface ImportOutput {
  listing: {
    title_en: string | null
    title_zh: string | null
    description_en: string | null
    description_zh: string | null
    address: string | null
    city: string | null
    province: string | null
    postal_code: string | null
    monthly_rent: number | null
    bedrooms: number | null
    bathrooms: number | null
    sqft: number | null
    parking: string | null
    utilities_included: string[]
    pet_policy: string | null
    available_date: string | null
    mls_number: string | null
    selling_points_zh: string[]
    selling_points_en: string[]
    /** Photo URLs in display order (best 8-12). */
    images: string[]
    /** Building / unit amenities — gym, pool, doorman, in-unit laundry... */
    amenities: string[]
    /** Year the building was built, if visible. */
    year_built: number | null
    /** Listing broker / agent name. */
    broker_name: string | null
    /** Listing broker phone. */
    broker_phone: string | null
    /** Brokerage / management company. */
    brokerage: string | null
  }
  source: string
  errors: string[]
}

const EXTRACT_PROMPT = `You are extracting structured Canadian rental listing data from messy input. Return ONLY this JSON (no markdown):

{
  "title_en": string | null,            // Short SEO-friendly EN title (~60 chars)
  "title_zh": string | null,            // Short Chinese title
  "description_en": string | null,      // Full English description (200-600 chars)
  "description_zh": string | null,      // Full Chinese description
  "address": string | null,             // Street address (no unit number)
  "city": string | null,
  "province": string | null,            // ISO province code (ON, BC, AB...)
  "postal_code": string | null,
  "monthly_rent": number | null,        // CAD per month, no commas
  "bedrooms": number | null,            // 0 = studio, 0.5 = den
  "bathrooms": number | null,           // Half-baths counted as 0.5
  "sqft": number | null,                // Interior square feet, integer
  "parking": string | null,             // "1 underground", "street", "none"
  "utilities_included": string[],       // ["heat", "water", "internet", ...]
  "pet_policy": string | null,          // "no pets", "cats only", "small dogs ok", etc.
  "available_date": string | null,      // YYYY-MM-DD if mentioned, else null
  "mls_number": string | null,
  "year_built": number | null,          // 4-digit year if visible
  "broker_name": string | null,         // Listing agent / leasing office name
  "broker_phone": string | null,        // Listing agent phone, digits + dashes
  "brokerage": string | null,           // Brokerage / management company
  "selling_points_zh": string[],        // 3-5 short Chinese selling points ("步行5分钟到地铁", "南向落地窗")
  "selling_points_en": string[],        // 3-5 short English selling points
  "amenities": string[],                // Building/unit amenities, e.g. "in-unit laundry", "rooftop deck", "concierge", "gym", "doorman", "balcony", "central A/C", "dishwasher". Combine unit + building amenities; keep each entry short (2-4 words). 8-15 entries when source is rich.
  "images": string[]                    // Direct photo URLs (https://...). Pull from JSON-LD "image" arrays, og:image, listing media galleries. Order: hero photo first, then floor plan, kitchen, bedroom, bathroom, exterior. 6-16 entries when available. Skip placeholder / map / branding / logo images. Always full https URLs.
}

Rules:
- Do NOT include any Ontario Human Rights Code protected language: race, religion, age, family status, "ideal for young professionals", "no children", etc. Strip if present in source.
- If only annual rent visible, divide by 12.
- Bilingual fields: if input is only in one language, translate to the other naturally.
- For images, the source body often ends with an "Images:" markdown list (\`- ![Image N](https://...)\`). Pull listing photo URLs from that list. Prefer URLs ending in .jpg / .jpeg / .png / .webp under listing CDN paths (cdn.realtor.ca/listings/, photos.zillowstatic.com/, photos.streeteasy.com/, etc.). REJECT every URL that contains: "icon", "svg", "logo", "sprite", "favicon", "ad.gt", "doubleclick", "pinterest", "facebook.com/tr", "openx", "rubicon", "pubmatic", "static.realtor.ca/images/common", "/images/en-ca/", or that ends in .svg. The good URLs include "highres", "medres", or look like c<MLS>_N.jpg. Aim for 8-16 photos in display order (the lowest c<MLS>_N.jpg first).
- For images, prefer JSON-LD or __NEXT_DATA__ image arrays when present. Include up to 16 photos.
- For amenities, dedupe and lowercase the first word ("In-unit laundry" → "in-unit laundry").
- For broker_phone, format like "+1-555-123-4567" or "(555) 123-4567" — preserve source format.`

const tool: CapabilityTool<ImportInput, ImportOutput> = {
  name: 'import_listing',
  version: '1.0.0',
  description:
    'Convert messy listing input (free-form text, Realtor.ca/Kijiji URL, or MLS PDF) into a structured rental listing with bilingual title + description + selling points. Strips Ontario Human Rights Code protected language. Use when a landlord or agent wants to add a property to Stayloop. ' +
    '把杂乱的房源输入（自由文字、Realtor.ca/Kijiji 链接、MLS PDF 导出）转成结构化房源数据，含中英双语标题+描述+卖点。自动剔除安省人权法禁止用语。',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', enum: ['text', 'url', 'pdf'] },
      text: { type: 'string' },
      url: { type: 'string' },
      pdf_path: { type: 'string' },
    },
    required: ['source'],
  },
  needsApproval: false,
  handler: async (input, ctx) => {
    if (!ctx.anthropicApiKey) {
      return { listing: emptyListing(), source: input.source, errors: ['no_api_key'] }
    }

    const content: any[] = [{ type: 'text', text: EXTRACT_PROMPT }]

    if (input.source === 'text') {
      if (!input.text) {
        return { listing: emptyListing(), source: 'text', errors: ['no_text'] }
      }
      content.push({ type: 'text', text: `\nListing source — pasted text:\n${input.text.slice(0, 8000)}` })
    } else if (input.source === 'url') {
      if (!input.url) {
        return { listing: emptyListing(), source: 'url', errors: ['no_url'] }
      }
      const urlContent = await fetchUrlContent(input.url)
      if (!urlContent.ok) {
        return { listing: emptyListing(), source: 'url', errors: [urlContent.error] }
      }
      // Pin the source URL into the body so Haiku can also extract things
      // like the realtor.ca numeric ID into our listing payload (and so
      // our caller can stash source_url on the saved row).
      const augmented = `Source URL: ${input.url}\n\n${urlContent.body}`
      content.push({
        type: 'text',
        text: `\nListing source — fetched ${urlContent.via} from ${input.url}:\n${augmented}`,
      })
    } else if (input.source === 'pdf') {
      if (!input.pdf_path) {
        return { listing: emptyListing(), source: 'pdf', errors: ['no_pdf_path'] }
      }
      const { data } = await ctx.supabaseAdmin.storage
        .from('tenant-files')
        .createSignedUrl(input.pdf_path, 600)
      if (!data?.signedUrl) {
        return { listing: emptyListing(), source: 'pdf', errors: ['signed_url_failed'] }
      }
      content.push({ type: 'document', source: { type: 'url', url: data.signedUrl } })
    }

    try {
      const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ctx.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 3000,
          messages: [
            { role: 'user', content },
            { role: 'assistant', content: '{' },
          ],
        }),
        signal: AbortSignal.timeout(40000),
      })
      if (!res.ok) {
        return { listing: emptyListing(), source: input.source, errors: [`haiku_${res.status}`] }
      }
      const json: any = await res.json()
      const raw = (json?.content?.[0]?.text || '').trim()
      const text = raw.startsWith('{') ? raw : '{' + raw
      const parsed = parseListingJson(text)
      if (!parsed) {
        return { listing: emptyListing(), source: input.source, errors: ['parse_failed'] }
      }
      return { listing: parsed, source: input.source, errors: [] }
    } catch (e: any) {
      return { listing: emptyListing(), source: input.source, errors: [e?.message?.slice(0, 100) || 'failed'] }
    }
  },
}

// -----------------------------------------------------------------------------
// fetchUrlContent — multi-strategy URL reader
// -----------------------------------------------------------------------------
// Realtor.ca / Kijiji / Facebook Marketplace etc. sit behind Cloudflare-style
// anti-bot protection that returns 403 to a vanilla server-side fetch with a
// generic User-Agent. We try three strategies in order:
//
//   1. r.jina.ai — free public reader that proxies the URL through a headless
//      browser and returns clean markdown. Bypasses most anti-bot, no API key.
//   2. Direct fetch with full browser-like headers, then strip script/style
//      and extract JSON-LD blocks (which usually carry the listing schema).
//   3. Direct fetch as plain HTML (last-resort).
//
// We return the first strategy that produces content — the AI extractor that
// runs on top is robust to either markdown or stripped HTML.
// -----------------------------------------------------------------------------

interface UrlFetchOk { ok: true; body: string; via: 'jina' | 'jina-r' | 'html' | 'json-ld' | 'allorigins' | 'cors-anywhere' | 'web-archive' }
interface UrlFetchErr { ok: false; error: string }

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-CA,en;q=0.9,zh;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="124", "Not-A.Brand";v="99"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
}

/**
 * Multi-strategy URL reader. Each strategy is tried in turn; first one to
 * return enough content wins. Strategies, ordered by reliability for the
 * Realtor.ca / Kijiji / StreetEasy class of sites:
 *
 *   1. r.jina.ai             — free reader proxy, clean markdown, bypasses
 *                               most anti-bot. Often the best result.
 *   2. r.jina.ai (no scheme)  — Jina also accepts URL with the scheme stripped;
 *                               sometimes works when (1) returns a captcha shell.
 *   3. Direct fetch           — full browser headers, then prefer JSON-LD /
 *                               __NEXT_DATA__ extraction over visible HTML.
 *   4. allorigins.win         — public CORS-relay; returns raw page HTML.
 *   5. corsproxy.io           — same idea, different provider.
 *   6. web.archive.org/web    — last-resort: most listings get archived; even
 *                               an old snapshot is enough for the extractor.
 *
 * Each strategy validates the response (length / not-an-interstitial) before
 * declaring success.
 */
async function fetchUrlContent(url: string): Promise<UrlFetchOk | UrlFetchErr> {
  const tries: Array<{ name: UrlFetchOk['via']; run: () => Promise<UrlFetchOk | UrlFetchErr> }> = [
    { name: 'jina', run: () => tryJina(`https://r.jina.ai/${url}`, 'markdown') },
    { name: 'jina-r', run: () => tryJina(`https://r.jina.ai/${url.replace(/^https?:\/\//, '')}`, 'markdown') },
    { name: 'html', run: () => tryDirect(url) },
    { name: 'allorigins', run: () => tryProxy(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, 'allorigins') },
    { name: 'cors-anywhere', run: () => tryProxy(`https://corsproxy.io/?${encodeURIComponent(url)}`, 'cors-anywhere') },
    { name: 'web-archive', run: () => tryArchive(url) },
  ]

  const errors: string[] = []
  for (const { name, run } of tries) {
    try {
      const out = await run()
      if (out.ok) return out
      errors.push(`${name}=${out.error}`)
    } catch (e: any) {
      errors.push(`${name}=${(e?.message || 'failed').slice(0, 60)}`)
    }
  }
  return { ok: false, error: `all_strategies_failed (${errors.join(', ').slice(0, 200)})` }
}

async function tryJina(jinaUrl: string, format: 'markdown'): Promise<UrlFetchOk | UrlFetchErr> {
  const res = await fetch(jinaUrl, {
    headers: {
      'X-Return-Format': format,
      // Append a flat 'Images' list at the end of the markdown so we
      // capture every photo URL the page references. Without this,
      // realtor.ca / StreetEasy markdown ends up with only a few icons
      // and zero listing photos — Haiku then has nothing to extract.
      'X-With-Images-Summary': 'true',
      Accept: 'text/markdown, text/plain, */*',
    },
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) return { ok: false, error: `jina_${res.status}` }
  const md = await res.text()
  // Reject HTML interstitials and obvious captcha shells.
  const looksLikeHtml = /^\s*<(\!doctype|html|head|body)\b/i.test(md)
  const captchaHint = /captcha|cf-browser-verification|access denied|are you a robot/i.test(md.slice(0, 2000))
  const looksLikeMarkdown = /[\n#*\-]/.test(md)
  if (md.length > 200 && !looksLikeHtml && !captchaHint && looksLikeMarkdown) {
    // Bump cap to 60k so the appended image list (sometimes 5-10kB on
    // photo-rich pages) doesn't get truncated before Haiku sees it.
    return { ok: true, body: md.slice(0, 60_000), via: jinaUrl.includes('://r.jina.ai/http') ? 'jina' : 'jina-r' }
  }
  return { ok: false, error: `jina_unparseable_${md.length}` }
}

async function tryDirect(url: string): Promise<UrlFetchOk | UrlFetchErr> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) })
  if (!res.ok) return { ok: false, error: `fetch_${res.status}` }
  return parseHtmlPayload(await res.text(), 'html')
}

async function tryProxy(proxyUrl: string, via: 'allorigins' | 'cors-anywhere'): Promise<UrlFetchOk | UrlFetchErr> {
  const res = await fetch(proxyUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) return { ok: false, error: `${via}_${res.status}` }
  return parseHtmlPayload(await res.text(), via)
}

async function tryArchive(url: string): Promise<UrlFetchOk | UrlFetchErr> {
  // Resolve to the latest snapshot via the Wayback Machine availability API.
  const availRes = await fetch(
    `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
    { signal: AbortSignal.timeout(8000) },
  )
  if (!availRes.ok) return { ok: false, error: `archive_avail_${availRes.status}` }
  const data: any = await availRes.json().catch(() => null)
  const snap = data?.archived_snapshots?.closest
  if (!snap?.url || snap.status !== '200') return { ok: false, error: 'archive_no_snapshot' }
  // Wayback URLs serve the original HTML almost as-is — go through tryDirect logic.
  const res = await fetch(snap.url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15000) })
  if (!res.ok) return { ok: false, error: `archive_fetch_${res.status}` }
  return parseHtmlPayload(await res.text(), 'web-archive')
}

function parseHtmlPayload(html: string, via: UrlFetchOk['via']): UrlFetchOk | UrlFetchErr {
  // Try to pull all JSON-LD blocks first — Realtor.ca and most listing sites
  // embed structured RealEstateListing / Product schema there.
  const jsonLdBlocks: string[] = []
  const jsonLdRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = jsonLdRe.exec(html)) !== null && jsonLdBlocks.length < 10) {
    jsonLdBlocks.push(m[1].trim())
  }
  const nextDataMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  )
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 20_000)

  if (jsonLdBlocks.length > 0) {
    let body = `JSON-LD blocks:\n${jsonLdBlocks.join('\n---\n').slice(0, 18_000)}`
    if (nextDataMatch) body += `\n\n__NEXT_DATA__:\n${nextDataMatch[1].slice(0, 6_000)}`
    body += `\n\nVisible HTML (stripped):\n${cleaned.slice(0, 8_000)}`
    return { ok: true, body, via: 'json-ld' }
  }
  // Surface a captcha-flavoured failure clearly so we can fall through.
  if (/captcha|cloudflare|access denied|browser verification/i.test(cleaned.slice(0, 2000))) {
    return { ok: false, error: `${via}_captcha` }
  }
  if (cleaned.length < 200) return { ok: false, error: `${via}_no_content` }
  return { ok: true, body: cleaned, via }
}

function emptyListing(): ImportOutput['listing'] {
  return {
    title_en: null,
    title_zh: null,
    description_en: null,
    description_zh: null,
    address: null,
    city: null,
    province: null,
    postal_code: null,
    monthly_rent: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    parking: null,
    utilities_included: [],
    pet_policy: null,
    available_date: null,
    mls_number: null,
    selling_points_zh: [],
    selling_points_en: [],
    images: [],
    amenities: [],
    year_built: null,
    broker_name: null,
    broker_phone: null,
    brokerage: null,
  }
}

/** Sanity-filter image URLs Haiku returned: must be https, must look like
 *  a real listing photo (not a 1×1 tracking pixel or a sprite). */
function cleanImages(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of arr) {
    if (typeof raw !== 'string') continue
    const url = raw.trim()
    if (!/^https:\/\//i.test(url)) continue
    if (url.length > 1000) continue
    // Common reject patterns: 1x1 trackers, sprites, brand logos, blank/spacer
    if (/(1x1|spacer|blank|pixel|logo|sprite|favicon)\b/i.test(url)) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length >= 16) break
  }
  return out
}

/** Normalize amenity strings: dedupe, lowercase first word, trim. */
function cleanAmenities(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of arr) {
    if (typeof raw !== 'string') continue
    const t = raw.trim().slice(0, 60)
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    // Lowercase first character to match StreetEasy convention.
    out.push(t.charAt(0).toLowerCase() + t.slice(1))
    if (out.length >= 20) break
  }
  return out
}

function parseListingJson(text: string): ImportOutput['listing'] | null {
  try {
    const start = text.indexOf('{')
    if (start < 0) return null
    let depth = 0
    let inStr = false
    let escape = false
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (escape) { escape = false; continue }
      if (c === '\\') { escape = true; continue }
      if (c === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          const slice = text.slice(start, i + 1).replace(/,(\s*[}\]])/g, '$1')
          const obj = JSON.parse(slice)
          return {
            ...emptyListing(),
            ...obj,
            utilities_included: Array.isArray(obj.utilities_included) ? obj.utilities_included : [],
            selling_points_zh: Array.isArray(obj.selling_points_zh) ? obj.selling_points_zh : [],
            selling_points_en: Array.isArray(obj.selling_points_en) ? obj.selling_points_en : [],
            images: cleanImages(obj.images),
            amenities: cleanAmenities(obj.amenities),
            year_built: typeof obj.year_built === 'number' && obj.year_built > 1800 && obj.year_built < 2100 ? obj.year_built : null,
            broker_name: typeof obj.broker_name === 'string' && obj.broker_name.length > 0 ? obj.broker_name.slice(0, 80) : null,
            broker_phone: typeof obj.broker_phone === 'string' && obj.broker_phone.length > 0 ? obj.broker_phone.slice(0, 30) : null,
            brokerage: typeof obj.brokerage === 'string' && obj.brokerage.length > 0 ? obj.brokerage.slice(0, 80) : null,
          }
        }
      }
    }
    return null
  } catch {
    return null
  }
}

registerTool(tool)
export default tool
