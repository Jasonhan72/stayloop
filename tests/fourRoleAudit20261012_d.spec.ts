// 四角色审计 2026-10-12 · P1-4: a delegation link to `qa-test-wang1@example.com` was refused by
// Resend (422 "Invalid `to` field … domains like example.com") and the client book only said
// 「邮件服务出错」. Now: the provider's reason travels back (route JSON + audit metadata), the
// client book names a domain that cannot receive mail, and reserved / test domains are refused
// at entry so the row never produces such a delegation.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { classifyEmailFailure, isUndeliverableEmailDomain } from '@/lib/emailDeliverability'

const read = (p: string) => readFileSync(p, 'utf8')
const RESEND_422 = 'resend 422: {"message":"Invalid `to` field. Please use our testing email address instead of domains like `example.com`.","name":"validation_error"}'

describe('isUndeliverableEmailDomain · reserved and test domains', () => {
  it('refuses example.com / .net / .org, their subdomains and example.<tld>', () => {
    for (const e of ['qa-test-wang1@example.com', 'a@EXAMPLE.COM', 'a@example.net', 'a@example.org', 'a@mail.example.com', 'a@example.ca', 'a@sub.example.org.']) {
      expect(isUndeliverableEmailDomain(e), e).toBe(true)
    }
  })
  it('refuses *.test, *.invalid, *.localhost, .example and bare localhost', () => {
    for (const e of ['a@foo.test', 'a@bar.invalid', 'a@app.localhost', 'a@localhost', 'a@corp.example', 'a@x.y.test']) {
      expect(isUndeliverableEmailDomain(e), e).toBe(true)
    }
  })
  it('accepts real domains, including ones that merely contain the words', () => {
    for (const e of ['muse-tenant@stayloop.ai', 'jason+alias@gmail.com', 'a@examples.com', 'a@myexample.com', 'a@example-corp.com', 'a@testing.ca', 'a@localhost.com', 'a@invalid-mail.ca']) {
      expect(isUndeliverableEmailDomain(e), e).toBe(false)
    }
  })
  it('does not judge shape: no @, empty, null → false (the EMAIL_RE check owns that)', () => {
    expect(isUndeliverableEmailDomain('example.com')).toBe(false)
    expect(isUndeliverableEmailDomain('')).toBe(false)
    expect(isUndeliverableEmailDomain(null)).toBe(false)
    expect(isUndeliverableEmailDomain(undefined)).toBe(false)
  })
})

describe('classifyEmailFailure · the provider message becomes a reason + a short detail', () => {
  it('Resend’s example.com refusal → undeliverable_domain with the provider’s own words as detail', () => {
    const f = classifyEmailFailure(RESEND_422, 'qa-test-wang1@example.com')
    expect(f.reason).toBe('undeliverable_domain')
    expect(f.detail).toBe('Invalid `to` field. Please use our testing email address instead of domains like `example.com`.')
    expect(f.detail.length).toBeLessThanOrEqual(200)
  })
  it('a reserved recipient domain names the reason even when the provider wording changes', () => {
    expect(classifyEmailFailure('resend 400: {"message":"bad recipient"}', 'x@foo.test').reason).toBe('undeliverable_domain')
    expect(classifyEmailFailure('resend 422: Invalid `to` field', 'x@real.ca').reason).toBe('undeliverable_domain')
  })
  it('429 / rate limit → rate_limited; anything else → provider_error', () => {
    expect(classifyEmailFailure('resend 429: {"message":"Too many requests"}', 'x@real.ca').reason).toBe('rate_limited')
    expect(classifyEmailFailure('resend 500: {"message":"Internal server error"}', 'x@real.ca')).toEqual({ reason: 'provider_error', detail: 'Internal server error' })
    expect(classifyEmailFailure('resend fetch failed', 'x@real.ca')).toEqual({ reason: 'provider_error', detail: 'resend fetch failed' })
    expect(classifyEmailFailure(undefined, 'x@real.ca')).toEqual({ reason: 'provider_error', detail: '' })
  })
  it('detail is trimmed to 200 characters and never the whole JSON body', () => {
    const long = 'resend 500: {"message":"' + 'x'.repeat(400) + '"}'
    const f = classifyEmailFailure(long, 'x@real.ca')
    expect(f.detail).toHaveLength(200)
    expect(f.detail).not.toContain('{')
  })
})

describe('the delegation routes return the reason and write it to the audit row (no new column)', () => {
  const confirm = read('app/api/delegations/confirmEmail.ts')
  const propose = read('app/api/delegations/route.ts')
  const act = read('app/api/delegations/[id]/route.ts')
  it('sendDelegationLink returns { ok, reason?, detail? } and still records link_emailed on the row', () => {
    expect(confirm).toContain('export type LinkEmailOutcome = { ok: boolean; reason?: EmailFailureReason; detail?: string }')
    expect(confirm).toContain('Promise<LinkEmailOutcome>')
    expect(confirm).toContain("update({ link_emailed: sent.ok, link_emailed_at: new Date().toISOString() })")
    expect(confirm).toContain('const f = classifyEmailFailure(sent.error, a.to)')
    expect(confirm).toContain("return { ok: false, reason: 'undeliverable_domain'")
    expect(confirm).not.toContain('Promise<boolean>')
  })
  it('propose: a reserved-domain client email is refused before any row is inserted', () => {
    expect(propose).toContain("if (isUndeliverableEmailDomain(c.email)) return NextResponse.json({ error: 'client_email_undeliverable', reason: 'undeliverable_domain' }, { status: 422 })")
    expect(propose.indexOf('client_email_undeliverable')).toBeLessThan(propose.indexOf(".from('delegations').insert("))
  })
  it('propose + resend: reason / detail ride on the JSON and in agent_audit_events.metadata; no migration', () => {
    for (const [name, src] of [['propose', propose], ['resend', act]] as const) {
      expect(src, name).toContain('const failure = emailed.ok ? {} : { reason: emailed.reason, detail: emailed.detail }')
      expect(src, name).toContain('emailed: emailed.ok, ...failure }')
      expect(src, name).toContain('...failure })')
      expect(src, name).not.toMatch(/update\(\{[^}]*(reason|detail)/)
    }
    expect(propose).toContain("return NextResponse.json({ delegation: row, emailed: emailed.ok, ...failure })")
    expect(act).toContain('return NextResponse.json({ ok: true, emailed: emailed.ok, ...failure })')
  })
  it('sendEmail keeps its shape ({ ok, id?, error? }) and lib/email re-exports the helpers', () => {
    const email = read('lib/email.ts')
    expect(email).toContain('export interface SendEmailResult {\n  ok: boolean\n  id?: string\n')
    expect(email).toContain("export { classifyEmailFailure, isUndeliverableEmailDomain, type EmailFailure, type EmailFailureReason } from './emailDeliverability'")
    // The helper module is importable from the client bundle: no env reads, no imports, no directive.
    const helper = read('lib/emailDeliverability.ts')
    expect(helper).not.toContain('process.env')
    expect(helper).not.toMatch(/^import /m)
  })
})

describe('the client book names the reason and refuses reserved domains at entry', () => {
  const c = read('components/agent/ClientBook.tsx')
  it('after a failed resend the banner reads the reason: undeliverable_domain / rate_limited / provider_error + detail', () => {
    expect(c).toContain("reason === 'undeliverable_domain'")
    expect(c).toContain("reason === 'rate_limited'")
    expect(c).toContain('这个邮箱域名无法投递（example.com 这类测试域名收不到信）。改成客户真实的邮箱后再重发。')
    expect(c).toContain('This email domain cannot receive mail (test domains like example.com never get delivered). Change it to the client’s real email, then resend.')
    expect(c).toContain("const detail = j.detail ? ` ${zh ? '邮件服务返回：' : 'Mail service said: '}${j.detail}` : ''")
    expect(c).toContain('还是没有发出去（邮件服务出错）。请稍后再试，或撤回后检查邮箱 ${d.principal_email} 是否正确。${detail}')
    // A delegation proposed before this fix (no reason in the response) is still explained from the address itself.
    expect(c).toContain("j.reason ?? (isUndeliverableEmailDomain(d.principal_email) ? 'undeliverable_domain' : undefined)")
  })
  it('the pending-row label says the domain cannot receive mail, and 发起委托 is not offered for such an email', () => {
    expect(c).toContain("'确认邮件未发出 · 邮箱域名无法投递'")
    expect(c).toContain('data-testid="propose-delegation-undeliverable"')
    expect(c).toContain('委托（邮箱域名无法投递 · 请改邮箱）')
    expect(c.indexOf('propose-delegation-undeliverable')).toBeLessThan(c.indexOf('data-testid="propose-delegation-button"'))
  })
  it('add and edit refuse example.com / .test / .invalid / localhost with plain copy; the format hint no longer suggests example.com', () => {
    expect(c).toContain("const RESERVED_DOMAIN_MSG = { zh: '这是测试用的保留域名，邮件发不到；请填客户真实邮箱。'")
    expect(c.match(/isUndeliverableEmailDomain\((email|f\.email)\)\) \{ setErr\(zh \? RESERVED_DOMAIN_MSG\.zh : RESERVED_DOMAIN_MSG\.en\); return \}/g)).toHaveLength(2)
    expect(c).not.toContain('name@example.com')
  })
  it('copy stays plain and calls the assistant AI 助理 if at all', () => {
    for (const bad of ['助手', '管家', '背调', '诸事', '托付']) expect(c, bad).not.toContain(bad)
  })
})

describe('ProposeDelegation reads the reason too (audit 2026-10-12 P1-4)', () => {
  it('maps the pre-insert 422 and the undeliverable_domain reason to plain copy', () => {
    const s = readFileSync('components/delegations/ProposeDelegation.tsx', 'utf8')
    expect(s).toMatch(/client_email_undeliverable: \{ zh: '客户邮箱是测试用的保留域名/)
    expect(s).toMatch(/j\.reason === 'undeliverable_domain'/)
    expect(s).toMatch(/这个邮箱域名无法投递（example\.com 这类测试域名收不到信）/)
  })
})
