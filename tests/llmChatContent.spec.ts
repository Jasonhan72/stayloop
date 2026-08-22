// openai-compat content conversion: Anthropic-shaped image/document blocks →
// OpenAI parts per ModelDef.pdfInput (measured 2026-08-22: OpenAI/Qwen3.8 take
// `file`, Gemini takes image_url+PDF, everyone else gets extracted text).
import { describe, expect, it } from 'vitest'
import { toOpenAIContent } from '@/lib/llmChat'
import type { ModelDef } from '@/lib/modelConfig'

const base: ModelDef = { id: 'm', label: 'm', note: '', provider: 'openai-compat', baseUrl: 'https://x.example/v1', apiKeyEnv: 'OPENAI_API_KEY', vision: true, costTier: '低', allowedSlots: ['turn', 'screening'] }

describe('toOpenAIContent', () => {
  it('text-only → plain string; image base64 → image_url data URL', async () => {
    expect(await toOpenAIContent([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], base)).toBe('a\n\nb')
    const parts = await toOpenAIContent([{ type: 'text', text: 'look' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }], base) as Array<Record<string, unknown>>
    expect(parts[0]).toEqual({ type: 'text', text: 'look' })
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } })
  })
  it('PDF document → file part (pdfInput=file) / image_url part (pdfInput=image_url)', async () => {
    const doc = [{ type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf', data: 'JVBERi0=' }, title: 'pay stub: March.pdf' }]
    const f = await toOpenAIContent(doc, { ...base, pdfInput: 'file' }) as Array<Record<string, any>>
    expect(f[1].type).toBe('file')
    expect(f[1].file.filename).toBe('pay stub_ March.pdf')
    expect(f[1].file.file_data).toBe('data:application/pdf;base64,JVBERi0=')
    const g = await toOpenAIContent(doc, { ...base, pdfInput: 'image_url' }) as Array<Record<string, any>>
    expect(g[1]).toEqual({ type: 'image_url', image_url: { url: 'data:application/pdf;base64,JVBERi0=' } })
  })
  it('PDF document with pdfInput=text → an explicit unreadable note for a non-PDF payload (never silent)', async () => {
    const out = await toOpenAIContent([{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' }, title: 'x.pdf' }], { ...base, pdfInput: 'text' })
    expect(typeof out).toBe('string')
    expect(out as string).toMatch(/UNREADABLE/)
  })
  it('image on a non-vision model throws', async () => {
    await expect(toOpenAIContent([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }], { ...base, vision: false })).rejects.toThrow(/no vision support/)
  })
})
