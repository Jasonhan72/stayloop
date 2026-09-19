import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeThrottle, renderContactEmail, validateContact } from '@/lib/contact'

const good = {
  name: 'Sarah Chen',
  company: 'Acme',
  email: 'sarah@example.com',
  topic: 'Press / PR',
  message: 'Hello, I would like to talk about a story.',
}

describe('contact form', () => {
  it('accepts a well-formed message and trims fields', () => {
    const r = validateContact({ ...good, name: '  Sarah Chen  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.name).toBe('Sarah Chen')
  })

  it('rejects bad emails, short / oversized messages and oversized fields', () => {
    expect(validateContact({ ...good, email: 'not-an-email' })).toEqual({ ok: false, error: 'invalid_email' })
    expect(validateContact({ ...good, email: 'a@b.co, evil@x.com' })).toEqual({ ok: false, error: 'invalid_email' })
    expect(validateContact({ ...good, message: 'too short' })).toEqual({ ok: false, error: 'invalid_message' })
    expect(validateContact({ ...good, message: 'x'.repeat(5001) })).toEqual({ ok: false, error: 'invalid_message' })
    expect(validateContact({ ...good, name: 'n'.repeat(121) })).toEqual({ ok: false, error: 'invalid_name' })
    expect(validateContact({ ...good, topic: 't'.repeat(121) })).toEqual({ ok: false, error: 'invalid_topic' })
    expect(validateContact(null)).toEqual({ ok: false, error: 'invalid_name' })
  })

  it('strips line breaks from header-bound fields (no header injection)', () => {
    const r = validateContact({ ...good, name: 'Eve\r\nBcc: victim@example.com', topic: 'Hi\nthere' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.name).not.toMatch(/[\r\n]/)
      expect(renderContactEmail(r.value).subject).not.toMatch(/[\r\n]/)
    }
  })

  it('HTML-escapes every visitor-supplied value in the email body', () => {
    const r = validateContact({
      ...good,
      name: '<img src=x onerror=alert(1)>',
      company: '"Acme" & <b>Sons</b>',
      message: '<script>alert("x")</script> and a second line\nhere',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { html, text } = renderContactEmail(r.value)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>Sons')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;Acme&quot; &amp; &lt;b&gt;Sons&lt;/b&gt;')
    expect(html).toContain('<br>')
    expect(text).toContain('<script>') // the plain-text part is not HTML
  })

  it('throttles per key inside the window and recovers after it', () => {
    const allow = makeThrottle(5, 1000)
    for (let i = 0; i < 5; i++) expect(allow('1.2.3.4', 100 + i)).toBe(true)
    expect(allow('1.2.3.4', 200)).toBe(false)
    expect(allow('5.6.7.8', 200)).toBe(true)
    expect(allow('1.2.3.4', 1200)).toBe(true)
  })

  it('the page shows success only on a 2xx and offers a mailto fallback', () => {
    const src = readFileSync('app/contact/page.tsx', 'utf8')
    expect(src).toContain("fetch('/api/contact'")
    expect(src).toContain('res.ok')
    expect(src).toContain("const CONTACT_EMAIL = 'privacy@stayloop.ai'")
    expect(src).toContain('mailto:${CONTACT_EMAIL}')
    expect(src).toMatch(/disabled=\{sending\}/)
    expect(src).not.toMatch(/in-app|右上角/)
  })
})
