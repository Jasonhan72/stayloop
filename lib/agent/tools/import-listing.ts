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
  }
  source: string
  errors: string[]
}

const EXTRACT_PROMPT = `You are extracting structured Canadian rental listing data from messy input. Return ONLY this JSON (no markdown):

{
  "title_en": string | null,            // Short SEO-friendly EN title (~60 chars)
  "title_zh": string | null,            // Short Chinese title
  "description_en": string | null,      // Full English description (200-400 chars)
  "description_zh": string | null,      // Full Chinese description
  "address": string | null,             // Street address
  "city": string | null,
  "province": string | null,            // ISO province code (ON, BC, AB...)
  "postal_code": string | null,
  "monthly_rent": number | null,        // CAD per month, no commas
  "bedrooms": number | null,
  "bathrooms": number | null,           // Half-baths counted as 0.5
  "sqft": number | null,
  "parking": string | null,             // "1 underground", "street", "none"
  "utilities_included": string[],       // ["heat", "water", "internet", ...]
  "pet_policy": string | null,          // "no pets", "cats only", "small dogs ok", etc.
  "available_date": string | null,      // YYYY-MM-DD if mentioned, else null
  "mls_number": string | null,
  "selling_points_zh": string[],        // 3-5 短中文卖点 ("步行5分钟到地铁", "南向落地窗")
  "selling_points_en": string[]         // 3-5 short English selling points
}

Rules:
- Do NOT include any Ontario Human Rights Code protected language: race, religion, age, family status, "ideal for young professionals", "no children", etc. Strip if present in source.
- If only annual rent visible, divide by 12.
- Bilingual fields: if input is only in one language, translate to the other naturally.`

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
      content.push({
        type: 'text',
        text: `\nListing source — fetched ${urlContent.via} from ${input.url}:\n${urlContent.body}`,
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

interface UrlFetchOk { ok: true; body: string; via: 'jina' | 'html' | 'json-ld' }
interface UrlFetchErr { ok: false; error: string }

async function fetchUrlContent(url: string): Promise<UrlFetchOk | UrlFetchErr> {
  // 1. Try r.jina.ai (clean markdown, bypasses anti-bot)
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const res = await fetch(jinaUrl, {
      headers: {
        // Jina honours the X-Return-Format header to produce clean markdown
        'X-Return-Format': 'markdown',
        Accept: 'text/markdown, text/plain, */*',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) {
      const md = await res.text()
      // Guard: Jina occasionally returns 200 with an HTML "Reader is loading"
      // / "Access denied" interstitial instead of markdown. Treat any
      // response that opens with HTML or doesn't have plausible markdown
      // length/shape as a soft failure and fall through to direct fetch.
      const looksLikeHtml = /^\s*<(\!doctype|html|head|body)\b/i.test(md)
      const looksLikeMarkdown = /[\n#*\-]/.test(md) // line breaks / md tokens
      if (md && md.length > 200 && !looksLikeHtml && looksLikeMarkdown) {
        return { ok: true, body: md.slice(0, 30_000), via: 'jina' }
      }
    }
  } catch {
    // fall through
  }

  // 2. Direct fetch with browser-like headers, prefer JSON-LD
  try {
    const res = await fetch(url, {
      headers: {
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
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      return { ok: false, error: `fetch_${res.status}` }
    }
    const html = await res.text()

    // Try to pull all JSON-LD blocks first — Realtor.ca and most listing sites
    // embed structured RealEstateListing / Product schema there.
    const jsonLdBlocks: string[] = []
    const jsonLdRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m: RegExpExecArray | null
    while ((m = jsonLdRe.exec(html)) !== null && jsonLdBlocks.length < 10) {
      jsonLdBlocks.push(m[1].trim())
    }

    // Also try Next.js __NEXT_DATA__ which carries the rendered server props
    const nextDataMatch = html.match(
      /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    )

    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/\s+/g, ' ')
      .slice(0, 20_000)

    // If we got structured data, prefer it — much higher signal-to-noise
    // ratio for the AI extractor than minified HTML.
    if (jsonLdBlocks.length > 0) {
      let body = `JSON-LD blocks:\n${jsonLdBlocks.join('\n---\n').slice(0, 18_000)}`
      if (nextDataMatch) body += `\n\n__NEXT_DATA__:\n${nextDataMatch[1].slice(0, 6_000)}`
      body += `\n\nVisible HTML (stripped):\n${cleaned.slice(0, 8_000)}`
      return { ok: true, body, via: 'json-ld' }
    }
    // Guard: SPA shells / blocked pages can return a near-empty body once
    // scripts and styles are stripped. If there's almost nothing useful to
    // hand the extractor, surface a clear error to Nova instead of letting
    // Haiku silently produce a null-filled listing.
    if (cleaned.length < 200) {
      return { ok: false, error: 'fetch_no_content' }
    }
    return { ok: true, body: cleaned, via: 'html' }
  } catch (e: any) {
    return { ok: false, error: e?.message?.slice(0, 100) || 'fetch_failed' }
  }
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
  }
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
