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

    // Holds the deterministic extract from realtor.ca, if applicable. Used
    // after Haiku returns to merge objective fields over its output.
    let realtorDet: RealtorExtract | null = null

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
        // Cloudflare Worker datacenter IPs sometimes get rate-limited or
        // served degraded responses by jina / allorigins / corsproxy. When
        // every strategy fails BUT the URL is realtor.ca, we can still
        // recover something useful — the URL itself encodes the listing ID
        // (RLT prefix MLS), and Nova can take that + the source_url and
        // ask the user to paste the page text to fill in the rest.
        if (/realtor\.ca/i.test(input.url)) {
          const det = parseRealtorMarkdown('', input.url) // empty body → URL-only RLT MLS
          if (det.mls_number) {
            const salvaged = mergeRealtorIntoListing(emptyListing(), det)
            console.warn('[import_listing] realtor_fetch_failed_url_recovery', {
              url: input.url.slice(0, 100),
              fetch_error: urlContent.error.slice(0, 200),
            })
            return {
              listing: salvaged,
              source: 'url',
              errors: ['fetch_failed_url_recovered'],
            }
          }
        }
        return { listing: emptyListing(), source: 'url', errors: [urlContent.error] }
      }
      // Pin the source URL into the body so Haiku can also extract things
      // like the realtor.ca numeric ID into our listing payload (and so
      // our caller can stash source_url on the saved row).
      let augmented = `Source URL: ${input.url}\n\n${urlContent.body}`

      // Realtor.ca deterministic extraction — pull stable objective fields
      // (rent / address / MLS / sqft / beds / baths / images) from the
      // markdown via regex, hand them to Haiku as a hint, and re-merge them
      // over Haiku's output below so we never come back empty on these
      // fields even when Haiku times out or returns all-null JSON.
      if (/realtor\.ca/i.test(input.url)) {
        realtorDet = parseRealtorMarkdown(urlContent.body, input.url)
        const det = realtorDet
        const detSummary = [
          det.address && `address: ${det.address}`,
          det.city && `city: ${det.city}`,
          det.province && `province: ${det.province}`,
          det.postal_code && `postal_code: ${det.postal_code}`,
          det.monthly_rent && `monthly_rent: ${det.monthly_rent}`,
          det.bedrooms !== null && `bedrooms: ${det.bedrooms}`,
          det.bathrooms !== null && `bathrooms: ${det.bathrooms}`,
          det.sqft && `sqft: ${det.sqft}`,
          det.mls_number && `mls_number: ${det.mls_number}`,
          det.year_built && `year_built: ${det.year_built}`,
          det.parking && `parking: ${det.parking}`,
          det.brokerage && `brokerage: ${det.brokerage}`,
          det.broker_name && `broker_name: ${det.broker_name}`,
          det.broker_phone && `broker_phone: ${det.broker_phone}`,
          det.images.length > 0 && `images_count: ${det.images.length}`,
        ]
          .filter(Boolean)
          .join('\n')
        if (detSummary) {
          augmented =
            `Source URL: ${input.url}\n\n` +
            `[REALTOR.CA DETERMINISTIC EXTRACT — these objective fields were already pulled from the page; use them as ground truth and focus on writing good bilingual title/description + amenities + selling_points]\n${detSummary}\n\n` +
            urlContent.body
        }
      }

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
          // Bumped from 3000: 16 image URLs (~120 chars each) + 8-15 amenities
          // + bilingual title + bilingual description (200-600 chars × 2) +
          // selling-points × 2 routinely pushes 3000 over the cliff and
          // truncates output mid-images-array.
          max_tokens: 5000,
          messages: [
            { role: 'user', content },
            { role: 'assistant', content: '{' },
          ],
        }),
        // Slightly longer timeout to match the larger body + larger output.
        signal: AbortSignal.timeout(55000),
      })
      if (!res.ok) {
        return { listing: emptyListing(), source: input.source, errors: [`haiku_${res.status}`] }
      }
      const json: any = await res.json()
      const raw = (json?.content?.[0]?.text || '').trim()
      const stopReason = json?.stop_reason
      const text = raw.startsWith('{') ? raw : '{' + raw
      const parsed = parseListingJson(text)
      if (!parsed) {
        // Diagnostic: log the first 500 chars of Haiku's reply so we can see
        // why the JSON didn't parse (Cloudflare Pages function logs).
        console.warn('[import_listing] parse_failed', {
          source: input.source,
          url: input.url?.slice(0, 100),
          stop_reason: stopReason,
          raw_head: raw.slice(0, 500),
        })
        // If we have a realtor.ca deterministic extract, salvage what we can
        // — Nova still gets a usable listing object instead of all-null.
        if (realtorDet) {
          const salvaged = mergeRealtorIntoListing(emptyListing(), realtorDet)
          return { listing: salvaged, source: input.source, errors: ['parse_failed_recovered_partial'] }
        }
        return { listing: emptyListing(), source: input.source, errors: ['parse_failed'] }
      }
      // Defence in depth: Haiku occasionally returns valid JSON but with every
      // field set to null — usually because it timed out reading a 60 KB body
      // or hit max_tokens before producing useful content. When that happens,
      // surface 'extraction_empty' so Nova can fall back to asking the user
      // for paste-in fields, and Nova won't mis-blame the URL fetch (the page
      // body was actually fine — Haiku just didn't extract from it).
      const hasAnyContent =
        !!parsed.address ||
        !!parsed.title_en ||
        !!parsed.title_zh ||
        (typeof parsed.monthly_rent === 'number' && parsed.monthly_rent > 0) ||
        !!parsed.description_en ||
        !!parsed.description_zh
      if (!hasAnyContent) {
        console.warn('[import_listing] extraction_empty', {
          source: input.source,
          url: input.url?.slice(0, 100),
          stop_reason: stopReason,
          raw_head: raw.slice(0, 500),
        })
        // Realtor.ca recovery: if Haiku came back empty but our deterministic
        // parser extracted real data, return that instead of failing. Nova
        // can then prompt the user to confirm and we still ship a draft.
        if (realtorDet) {
          const detHasReal =
            !!realtorDet.address ||
            !!realtorDet.monthly_rent ||
            !!realtorDet.mls_number ||
            (realtorDet.images?.length || 0) > 0
          if (detHasReal) {
            const salvaged = mergeRealtorIntoListing(parsed, realtorDet)
            return {
              listing: salvaged,
              source: input.source,
              errors: ['extraction_recovered_deterministic'],
            }
          }
        }
        return {
          listing: parsed,
          source: input.source,
          errors: stopReason === 'max_tokens' ? ['extraction_truncated'] : ['extraction_empty'],
        }
      }
      // Happy path — Haiku produced content. If this is realtor.ca, overlay
      // deterministic objective fields so the rent / MLS / images stay
      // ground-truth even if Haiku hallucinated or guessed wrong.
      const finalListing = realtorDet ? mergeRealtorIntoListing(parsed, realtorDet) : parsed
      return { listing: finalListing, source: input.source, errors: [] }
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
  // Realtor.ca aggressively blocks every datacenter-IP scraper proxy we
  // know of (jina rate-limits CF IPs, allorigins/corsproxy get 403'd by
  // realtor's anti-bot, archive.org rarely has a recent snapshot). We
  // know empirically that running all 6 strategies wastes 30-100s and
  // still fails. So for realtor.ca, only attempt jina (with API key when
  // set — that's the one path that DOES work reliably) and fail fast.
  const isRealtor = /realtor\.ca/i.test(url)
  const tries: Array<{ name: UrlFetchOk['via']; run: () => Promise<UrlFetchOk | UrlFetchErr> }> = isRealtor
    ? [
        { name: 'jina', run: () => tryJina(`https://r.jina.ai/${url}`, 'markdown') },
        { name: 'jina-r', run: () => tryJina(`https://r.jina.ai/${url.replace(/^https?:\/\//, '')}`, 'markdown') },
      ]
    : [
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
      if (out.ok) {
        // Trace which strategy won + body size — helps diagnose CF Worker
        // datacenter-IP issues where a strategy returns minimal content.
        console.warn('[import_listing] fetch_ok', {
          via: out.via,
          body_len: out.body.length,
          url: url.slice(0, 100),
        })
        return out
      }
      errors.push(`${name}=${out.error}`)
    } catch (e: any) {
      errors.push(`${name}=${(e?.message || 'failed').slice(0, 60)}`)
    }
  }
  console.warn('[import_listing] all_strategies_failed', {
    url: url.slice(0, 100),
    errors: errors.slice(0, 6),
  })
  return { ok: false, error: `all_strategies_failed (${errors.join(', ').slice(0, 200)})` }
}

async function tryJina(jinaUrl: string, format: 'markdown'): Promise<UrlFetchOk | UrlFetchErr> {
  // Jina's free tier rate-limits Cloudflare datacenter IPs aggressively.
  // When JINA_API_KEY is set we authenticate, which lifts the IP-based
  // limits and grants the account's quota (1M tokens/mo on free tier).
  // Without the key we still try the unauthenticated endpoint as a
  // best-effort — it works ~50% of the time on retry.
  const headers: Record<string, string> = {
    'X-Return-Format': format,
    // Append a flat 'Images' list at the end of the markdown so we
    // capture every photo URL the page references. Without this,
    // realtor.ca / StreetEasy markdown ends up with only a few icons
    // and zero listing photos — Haiku then has nothing to extract.
    'X-With-Images-Summary': 'true',
    Accept: 'text/markdown, text/plain, */*',
  }
  // Cloudflare Pages Functions expose env via process.env (next-on-pages
  // shims it). globalThis fallback covers Workers runtime quirks.
  const jinaKey =
    (typeof process !== 'undefined' && process.env?.JINA_API_KEY) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).JINA_API_KEY) ||
    ''
  if (jinaKey) {
    headers['Authorization'] = `Bearer ${jinaKey}`
  }

  const res = await fetch(jinaUrl, {
    headers,
    // Authenticated jina is fast (3-8s); unauthenticated can take 15-25s.
    // 18s is a sane compromise that fails fast when blocked.
    signal: AbortSignal.timeout(jinaKey ? 25000 : 18000),
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

// -----------------------------------------------------------------------------
// parseRealtorMarkdown — deterministic regex extractor for realtor.ca
// -----------------------------------------------------------------------------
// realtor.ca pages have a stable structure once jina renders them to markdown
// (price line, "X Bedrooms", "X Bathrooms", "MLS®/MLS® Number", a Photo
// Gallery section with cdn.realtor.ca URLs). When Haiku times out or returns
// all-null we still want to recover the objective fields. This parser pulls
// them straight from the markdown so we never come back empty-handed.
//
// Output ONLY contains fields we successfully extracted — caller merges these
// over Haiku output, deterministic values winning for objective fields and
// Haiku owning bilingual title/description/amenities/selling_points.
// -----------------------------------------------------------------------------

interface RealtorExtract {
  address: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  monthly_rent: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  parking: string | null
  mls_number: string | null
  year_built: number | null
  images: string[]
  broker_name: string | null
  broker_phone: string | null
  brokerage: string | null
}

function emptyRealtorExtract(): RealtorExtract {
  return {
    address: null,
    city: null,
    province: null,
    postal_code: null,
    monthly_rent: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    parking: null,
    mls_number: null,
    year_built: null,
    images: [],
    broker_name: null,
    broker_phone: null,
    brokerage: null,
  }
}

export function parseRealtorMarkdown(body: string, sourceUrl?: string): RealtorExtract {
  const out = emptyRealtorExtract()

  // Even with no body at all, we can still salvage the listing-id from
  // the realtor.ca URL itself. /real-estate/<id>/... → "RLT<id>" MLS.
  // This runs first so the caller always has at least the URL identifier.
  if (sourceUrl) {
    const urlId = sourceUrl.match(/\/real-estate\/(\d+)\//)
    if (urlId) out.mls_number = `RLT${urlId[1]}`
  }

  // Body too short to scan — return URL-only extract.
  if (!body || body.length < 80) return out

  // ---------- Address / city / province / postal ----------
  // realtor.ca jina output starts with "Title: ..." line and a "# <address>"
  // header within the first KB. Examples:
  //   "Title: 1201 - 155 Cumberland Street, Toronto, Ontario M5R0B6"
  //   "# 1201 - 155 Cumberland Street, Toronto, Ontario M5R0B6"
  const head = body.slice(0, 4000)
  // Title: line is the most reliable on realtor.ca jina output.
  const titleLine = head.match(/^Title:\s*([^\n]+)/im)?.[1]?.trim()
  // Fallback: first H1 with a number+street pattern.
  const h1 = head.match(/^#\s+([^\n]+)/m)?.[1]?.trim()
  // ---------- MLS from H1 (most reliable — beats body scan) ----------
  // realtor.ca H1 is ALWAYS "# For rent: <addr>, <city>, <prov> <postal> - <MLS> | REALTOR.ca"
  // — even when the rest of the body is truncated/broken, the H1 holds.
  // Run this BEFORE the postal/address extraction so a partial H1 still
  // yields the MLS number even if the address parse later fails.
  const h1MlsMatch = (h1 || '').match(/-\s+([CWNXEH]\d{7,10})\s*(?:\||$)/i)
  if (h1MlsMatch) {
    const id = h1MlsMatch[1].toUpperCase()
    if (id.length >= 6 && id.length <= 15) {
      out.mls_number = id // override URL-RLT fallback with the real MLS
    }
  }

  // Pick whichever looks like a Canadian street address.
  const addrCandidates = [titleLine, h1].filter(Boolean) as string[]
  for (const cand of addrCandidates) {
    // Strip realtor.ca SEO suffixes and prefixes:
    //   "For rent: 1201 - 155 CUMBERLAND STREET, ..." → drop "For rent: "
    //   "... | REALTOR.ca"  → drop trailing
    //   "... - C12801652 | REALTOR.ca"  → drop the MLS-suffix tail
    //   "... - For sale" / "... For lease" → drop
    const cleaned = cand
      .replace(/^For\s+(rent|sale|lease)\s*[:\-]\s*/i, '')
      .replace(/\s*\|\s*realtor\.ca.*$/i, '')
      .replace(/\s*-\s*[CWNXE]\d{7,10}\s*$/i, '')
      .replace(/\s*-\s*for (sale|rent|lease).*$/i, '')
      .trim()
    // Postal code first — it's a strong signal we found the right line.
    const postal = cleaned.match(/\b([A-Z]\d[A-Z])\s*(\d[A-Z]\d)\b/i)
    if (postal) {
      out.postal_code = `${postal[1].toUpperCase()} ${postal[2].toUpperCase()}`
      // Province name immediately precedes postal code.
      const before = cleaned.slice(0, postal.index || 0).replace(/[\s,]+$/, '')
      const provMatch = before.match(/,\s*(Ontario|Quebec|Québec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland( and Labrador)?|Prince Edward Island|Yukon|Northwest Territories|Nunavut|ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\s*$/i)
      if (provMatch) {
        out.province = canonicalProvince(provMatch[1])
        const beforeProv = before.slice(0, provMatch.index!).replace(/[\s,]+$/, '')
        // What's left should be "<address>, <city>" — and city may carry a
        // realtor.ca neighbourhood tag in parens, e.g. "Toronto (Annex)".
        // Allow letters / accents / spaces / dots / hyphens / apostrophes /
        // parens.
        const cityMatch = beforeProv.match(/,\s*([A-Za-zÀ-ÿ'()&. \-]+)$/)
        if (cityMatch) {
          // Strip neighbourhood parens for the canonical city field; we keep
          // the full label inside the address line for the user to see.
          const fullCity = cityMatch[1].trim()
          out.city = fullCity.replace(/\s*\([^)]*\)\s*$/, '').trim()
          out.address = beforeProv.slice(0, cityMatch.index!).replace(/[\s,]+$/, '')
        } else {
          out.address = beforeProv
        }
        break
      }
    }
  }

  // ---------- Monthly rent ----------
  // realtor.ca's listing page shows the price as either "$3,200/Monthly" or
  // a stand-alone "$3,200" near "For rent". Jina markdown sometimes gives
  // "## $3,200" or "**$3,200**". We scan a generous window for the strongest
  // signal: dollar amount adjacent to:
  //   /Monthly, /Monthly., /Mo, /mo., per month, /month, / month, monthly
  // Case-insensitive — realtor.ca uses capital "M" in /Monthly.
  const rentRe = /\$\s*([\d]{1,3}(?:,\d{3})*|\d{4,6})(?:\.\d{2})?\s*(?:\/\s*(?:month(?:ly)?|mo\.?)|per\s+month|monthly)/i
  const rentMatch = body.match(rentRe)
  if (rentMatch) {
    const num = parseInt(rentMatch[1].replace(/,/g, ''), 10)
    if (num >= 500 && num <= 50000) out.monthly_rent = num
  }
  if (!out.monthly_rent) {
    // Fallback: first $X,XXX in the first 8KB that's a plausible rent.
    const fallback = body.slice(0, 8000).match(/\$\s*([1-9]\d?,\d{3}|\d{4})\b/)
    if (fallback) {
      const num = parseInt(fallback[1].replace(/,/g, ''), 10)
      if (num >= 800 && num <= 25000) out.monthly_rent = num
    }
  }

  // ---------- Bedrooms / Bathrooms ----------
  // realtor.ca puts these in a stats strip: "2 Beds  2 Baths  833 sqft"
  // and also in a property-summary block as "Bedrooms 2 / Bathrooms 2".
  const bedMatch =
    body.match(/(\d+(?:\.\d)?)\s*(?:bed(?:room)?s?|chambres?)\b/i) ||
    body.match(/Bedrooms?\s*[:|]\s*(\d+(?:\.\d)?)/i)
  if (bedMatch) {
    const n = parseFloat(bedMatch[1])
    if (n >= 0 && n <= 12) out.bedrooms = n
  }
  const bathMatch =
    body.match(/(\d+(?:\.\d)?)\s*(?:bath(?:room)?s?|salles? de bain)\b/i) ||
    body.match(/Bathrooms?\s*[:|]\s*(\d+(?:\.\d)?)/i)
  if (bathMatch) {
    const n = parseFloat(bathMatch[1])
    if (n >= 0 && n <= 12) out.bathrooms = n
  }
  // Studio detection: if the markdown says "Studio" near top and bedrooms is null,
  // treat as 0.
  if (out.bedrooms === null && /\bstudio\b/i.test(head)) out.bedrooms = 0

  // ---------- Sqft ----------
  // Realtor.ca shows things like "833 sqft", "833 sq.ft.", "Square Footage 833".
  // Sometimes it gives a range "833 - 850 sqft" — take the lower bound.
  const sqftMatch =
    body.match(/(\d{2,5})\s*(?:-\s*\d{2,5}\s*)?(?:sq\.?\s*ft\.?|square\s*feet|sqft)/i) ||
    body.match(/Square\s*Foot(?:age)?\s*[:|]\s*(\d{2,5})/i) ||
    body.match(/Living\s*Area\s*\(?[^)]*\)?\s*[:|]\s*(\d{2,5})/i)
  if (sqftMatch) {
    const n = parseInt(sqftMatch[1], 10)
    if (n >= 80 && n <= 50000) out.sqft = n
  }

  // ---------- MLS number ----------
  // realtor.ca always prints "MLS®/MLS® Number: <ID>" or just "MLS® <ID>".
  // IDs are 8-12 alphanumeric (e.g. C8123456, X9234567, 26012345).
  const mlsMatch =
    body.match(/MLS(?:®|\(R\))?\s*(?:Number|#|No\.?)?\s*[:|]?\s*([A-Z0-9]{6,15})/i) ||
    body.match(/(?:^|\s)([CWNXE]\d{7,10})(?:\s|$)/m)
  if (mlsMatch) {
    const id = mlsMatch[1].trim().toUpperCase()
    // Reject obvious false-positives (years, plain numbers <6, "REALTOR")
    if (id.length >= 6 && id.length <= 15 && !/^(REALTOR|TORONTO|ONTARIO)$/i.test(id)) {
      out.mls_number = id
    }
  }
  // realtor.ca URL pattern often has the listing ID:
  // https://www.realtor.ca/real-estate/<NUM>/...
  // That number is realtor.ca's own ID, not the MLS, but it's still useful.
  if (!out.mls_number && sourceUrl) {
    const urlId = sourceUrl.match(/\/real-estate\/(\d+)\//)
    if (urlId) out.mls_number = `RLT${urlId[1]}`
  }

  // ---------- Year built ----------
  const yearMatch =
    body.match(/(?:Year\s*Built|Built\s*in|Construction)\s*[:|]?\s*(\d{4})/i) ||
    body.match(/\b(?:built|constructed)\s+in\s+(\d{4})\b/i)
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10)
    if (y >= 1800 && y <= new Date().getFullYear() + 5) out.year_built = y
  }

  // ---------- Parking ----------
  const parkingMatch = body.match(/Parking(?:\s*Type)?\s*[:|]\s*([^\n|]{2,40})/i)
  if (parkingMatch) {
    out.parking = parkingMatch[1].trim().slice(0, 60)
  } else if (/underground\s+parking/i.test(body)) {
    out.parking = '1 underground'
  } else if (/no\s+parking/i.test(body)) {
    out.parking = 'none'
  }

  // ---------- Broker / brokerage / phone ----------
  // realtor.ca typically renders "Listed by <Brokerage>" and a phone line.
  const brokerage = body.match(/Listed\s+by[:\s]+([^\n]{3,80})/i)
  if (brokerage) {
    out.brokerage = brokerage[1].replace(/\s*\|\s*$/, '').trim().slice(0, 80)
  }
  // Broker name commonly appears as a salesperson or REALTOR® label.
  const brokerName = body.match(/(?:Salesperson|REALTOR®|Sales Representative)[:\s]+([A-Z][A-Za-z'\-. ]{2,50})/)
  if (brokerName) out.broker_name = brokerName[1].trim().slice(0, 80)
  const phone = body.match(/\b(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})\b/)
  if (phone) out.broker_phone = phone[1].trim()

  // ---------- Images ----------
  // Two sources of truth on realtor.ca jina output:
  //   1. Inline markdown image refs:  ![alt](https://cdn.realtor.ca/listings/...)
  //   2. The "Images:" summary block jina appends with X-With-Images-Summary.
  const imgRe = /https:\/\/cdn\.realtor\.ca\/listings\/[A-Za-z0-9_/\-]+\.(?:jpg|jpeg|png|webp)/gi
  const seen = new Set<string>()
  const photos: string[] = []
  for (const m of body.matchAll(imgRe)) {
    const url = m[0]
    if (seen.has(url)) continue
    seen.add(url)
    photos.push(url)
    if (photos.length >= 24) break
  }
  // Sort lowest-numbered first (realtor.ca uses .../highres/c<id>_<n>.jpg —
  // _1.jpg is the hero photo). When the pattern isn't present, preserve order.
  photos.sort((a, b) => extractPhotoIndex(a) - extractPhotoIndex(b))
  out.images = photos.slice(0, 16)

  return out
}

function extractPhotoIndex(url: string): number {
  // realtor.ca CDN URL form: .../highres/c12345_1.jpg
  const m = url.match(/_(\d+)\.(?:jpg|jpeg|png|webp)$/i)
  if (m) return parseInt(m[1], 10)
  return 999 // unknown ordering — push to end
}

function canonicalProvince(input: string): string {
  const s = input.trim().toLowerCase()
  if (/^(ontario|on)$/i.test(s)) return 'ON'
  if (/^(qu[eé]bec|qc)$/i.test(s)) return 'QC'
  if (/^(british columbia|bc)$/i.test(s)) return 'BC'
  if (/^(alberta|ab)$/i.test(s)) return 'AB'
  if (/^(manitoba|mb)$/i.test(s)) return 'MB'
  if (/^(saskatchewan|sk)$/i.test(s)) return 'SK'
  if (/^(nova scotia|ns)$/i.test(s)) return 'NS'
  if (/^(new brunswick|nb)$/i.test(s)) return 'NB'
  if (/^(newfoundland( and labrador)?|nl)$/i.test(s)) return 'NL'
  if (/^(prince edward island|pe)$/i.test(s)) return 'PE'
  if (/^(yukon|yt)$/i.test(s)) return 'YT'
  if (/^(northwest territories|nt)$/i.test(s)) return 'NT'
  if (/^(nunavut|nu)$/i.test(s)) return 'NU'
  return input.toUpperCase().slice(0, 2)
}

/**
 * Merge a deterministic extract over Haiku's listing object. Deterministic
 * fields win for objective values (rent / address / MLS / sqft / beds /
 * baths / year_built / images / broker_*) — Haiku keeps ownership of the
 * subjective bilingual fields (titles, descriptions, selling points,
 * amenities, utilities_included, pet_policy, available_date).
 *
 * Images are MERGED — deterministic photos go first (they're already sorted
 * by hero index), Haiku's are appended only if not already in the set.
 */
export function mergeRealtorIntoListing(
  haiku: ImportOutput['listing'],
  det: RealtorExtract,
): ImportOutput['listing'] {
  const merged: ImportOutput['listing'] = { ...haiku }
  const winIfHas = <K extends keyof RealtorExtract & keyof ImportOutput['listing']>(k: K) => {
    const v = det[k]
    if (v !== null && v !== undefined && v !== '' && (typeof v !== 'number' || !Number.isNaN(v))) {
      ;(merged[k] as any) = v
    }
  }
  winIfHas('address')
  winIfHas('city')
  winIfHas('province')
  winIfHas('postal_code')
  winIfHas('monthly_rent')
  winIfHas('bedrooms')
  winIfHas('bathrooms')
  winIfHas('sqft')
  winIfHas('parking')
  winIfHas('mls_number')
  winIfHas('year_built')
  winIfHas('broker_name')
  winIfHas('broker_phone')
  winIfHas('brokerage')

  // Images: deterministic-first merge, dedupe.
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of det.images) {
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  for (const u of haiku.images || []) {
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push(u)
    if (out.length >= 16) break
  }
  if (out.length > 0) merged.images = out

  return merged
}

registerTool(tool)
export default tool
