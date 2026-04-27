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
      // Fetch the URL HTML server-side
      try {
        const res = await fetch(input.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
            Accept: 'text/html',
          },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) {
          return {
            listing: emptyListing(),
            source: 'url',
            errors: [`fetch_${res.status}`],
          }
        }
        const html = await res.text()
        // Strip scripts/styles for token economy; keep text + meta
        const cleaned = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/\s+/g, ' ')
          .slice(0, 15_000)
        content.push({ type: 'text', text: `\nListing source — fetched HTML from ${input.url}:\n${cleaned}` })
      } catch (e: any) {
        return { listing: emptyListing(), source: 'url', errors: [e?.message?.slice(0, 100) || 'fetch_failed'] }
      }
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
          max_tokens: 2000,
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
