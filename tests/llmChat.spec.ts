// llmChat — typed error construction + openai-compat request conversion.
// fetch is stubbed; no network is touched.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  llmChat,
  LlmHttpError,
  LlmKeyMissingError,
  LlmTruncatedError,
  type ChatMessage,
} from '@/lib/llmChat'
import type { ModelDef } from '@/lib/modelConfig'

const compatModel: ModelDef = {
  id: 'test-compat-model',
  label: 'Test',
  note: '',
  provider: 'openai-compat',
  baseUrl: 'https://compat.example.com/v1',
  apiKeyEnv: 'TEST_LLM_KEY',
  vision: false,
  costTier: '低',
  allowedSlots: ['turn'],
}

function stubFetch(payload: unknown, ok = true, status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return {
      ok,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('typed errors', () => {
  it('LlmKeyMissingError carries the env-var name, never a key value', () => {
    const e = new LlmKeyMissingError('DEEPSEEK_API_KEY')
    expect(e.name).toBe('LlmKeyMissingError')
    expect(e.apiKeyEnv).toBe('DEEPSEEK_API_KEY')
    expect(e.message).toContain('DEEPSEEK_API_KEY')
    expect(e).toBeInstanceOf(Error)
  })

  it('LlmHttpError carries status and (truncatable) body', () => {
    const e = new LlmHttpError(429, 'rate limited')
    expect(e.name).toBe('LlmHttpError')
    expect(e.status).toBe(429)
    expect(e.body).toBe('rate limited')
    expect(e.message).toContain('429')
  })

  it('LlmTruncatedError explains the reasoning-budget failure mode', () => {
    const e = new LlmTruncatedError('finish_reason=length')
    expect(e.name).toBe('LlmTruncatedError')
    expect(e.message).toContain('finish_reason=length')
  })

  it('llmChat rejects with LlmKeyMissingError when the provider key env is unset', async () => {
    vi.stubEnv('TEST_LLM_KEY', '')
    await expect(
      llmChat({ model: compatModel, system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 }),
    ).rejects.toBeInstanceOf(LlmKeyMissingError)
  })
})

describe('openai-compat message conversion', () => {
  it('prepends the system prompt as the first message and flattens text blocks', async () => {
    vi.stubEnv('TEST_LLM_KEY', 'test-key')
    const calls = stubFetch({ choices: [{ message: { content: 'hello' } }] })
    const messages: ChatMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'part one' }, { type: 'text', text: 'part two' }] },
      { role: 'assistant', content: 'earlier answer' },
    ]
    const res = await llmChat({ model: compatModel, system: 'SYS PROMPT', messages, maxTokens: 100, jsonMode: true })
    expect(res.text).toBe('hello')

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://compat.example.com/v1/chat/completions')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS PROMPT' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'part one\n\npart two' })
    expect(body.messages[2]).toEqual({ role: 'assistant', content: 'earlier answer' })
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('throws on image blocks — vision turns must never route to text-only models', async () => {
    vi.stubEnv('TEST_LLM_KEY', 'test-key')
    stubFetch({})
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        ],
      },
    ]
    await expect(
      llmChat({ model: compatModel, system: 's', messages, maxTokens: 100 }),
    ).rejects.toThrow(/no vision support/)
  })

  it('omits temperature for omitTemperature models, includes it otherwise', async () => {
    vi.stubEnv('TEST_LLM_KEY', 'test-key')
    const calls = stubFetch({ choices: [{ message: { content: 'x' } }] })
    const base = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 50, temperature: 0.4 }
    await llmChat({ ...base, model: compatModel })
    await llmChat({ ...base, model: { ...compatModel, omitTemperature: true } })
    expect(JSON.parse(calls[0].init.body as string).temperature).toBe(0.4)
    expect(JSON.parse(calls[1].init.body as string)).not.toHaveProperty('temperature')
  })

  it('surfaces empty-content length cuts / reasoning-only answers as LlmTruncatedError', async () => {
    vi.stubEnv('TEST_LLM_KEY', 'test-key')
    stubFetch({ choices: [{ finish_reason: 'length', message: { content: '' } }] })
    const base = { model: compatModel, system: 's', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 10 }
    await expect(llmChat(base)).rejects.toBeInstanceOf(LlmTruncatedError)

    stubFetch({ choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: 'thinking…' } }] })
    await expect(llmChat(base)).rejects.toBeInstanceOf(LlmTruncatedError)
  })

  it('raises LlmHttpError with the provider status on non-2xx', async () => {
    vi.stubEnv('TEST_LLM_KEY', 'test-key')
    stubFetch({ error: 'nope' }, false, 500)
    await expect(
      llmChat({ model: compatModel, system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }),
    ).rejects.toMatchObject({ name: 'LlmHttpError', status: 500 })
  })
})
