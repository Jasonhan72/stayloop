// 2026-09-29 · 「当然要加上这个判断」— the homepage sign-in looks the email up
// after 继续 and routes like Muse: an account with a password → the password
// step, a new email → create-account, an account without a password → Google
// or an email to set one. The user accepted that this tells a visitor whether
// an address is registered; these guards keep the lookup to three booleans,
// service-role only, behind a per-IP and a global limit that fail closed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeLookupEmail, routeForEmail, toEmailStatus } from '../lib/auth/emailStatus'

const read = (p: string) => readFileSync(p, 'utf8')
const sql = read('supabase/migrations/20260929_auth_email_status.sql')
const route = read('app/api/auth/email-status/route.ts')
const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|--)/.test(l)).join('\n')

describe('the lookup rules', () => {
  it('normalizes the address and rejects anything that is not one', () => {
    expect(normalizeLookupEmail('  Mia@Example.COM ')).toBe('mia@example.com')
    for (const bad of ['', 'mia', 'mia@', '@example.com', 'mia@example', 'a b@example.com', 42, null, undefined, {}, `${'x'.repeat(250)}@example.com`])
      expect(normalizeLookupEmail(bad), String(bad)).toBeNull()
  })
  it('the answer is exactly three booleans, and never says password/Google for an account that does not exist', () => {
    expect(toEmailStatus({ exists: true, password: true, google: true, id: 'x', email: 'y' })).toEqual({ exists: true, password: true, google: true })
    expect(toEmailStatus({ exists: false, password: true, google: true })).toEqual({ exists: false, password: false, google: false })
    expect(toEmailStatus(null)).toEqual({ exists: false, password: false, google: false })
    expect(toEmailStatus({ exists: 'yes' })).toEqual({ exists: false, password: false, google: false })
  })
  it('routes: password → password step; new → create; no password → Google / set one; no answer → manual', () => {
    expect(routeForEmail({ exists: true, password: true, google: false })).toEqual({ step: 'password', known: true, google: false })
    expect(routeForEmail({ exists: true, password: true, google: true })).toEqual({ step: 'password', known: true, google: true })
    expect(routeForEmail({ exists: false, password: false, google: false })).toEqual({ step: 'create', known: true, google: false })
    expect(routeForEmail({ exists: true, password: false, google: true })).toEqual({ step: 'nopassword', known: true, google: true })
    expect(routeForEmail({ exists: true, password: false, google: false })).toEqual({ step: 'nopassword', known: true, google: false })
    expect(routeForEmail(null)).toEqual({ step: 'password', known: false, google: false })
  })
})

describe('the SQL function', () => {
  it('is security definer with an empty search_path and callable by the service role only', () => {
    expect(sql).toContain('create or replace function public.auth_email_status(p_email text)')
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('revoke all on function public.auth_email_status(text) from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.auth_email_status(text) to service_role;')
    const grantees = [...code(sql).matchAll(/grant\s+execute\s+on\s+function\s+[^;]*?\s+to\s+([^;]+);/gi)].map((m) => m[1].trim().toLowerCase())
    expect(grantees).toEqual(['service_role'])
  })
  it('answers three booleans and nothing that identifies the account', () => {
    const builds = [...code(sql).matchAll(/jsonb_build_object\(([\s\S]*?)\)\s*;/g)].map((m) => m[1])
    expect(builds.length).toBeGreaterThanOrEqual(3)
    for (const b of builds) {
      const keys = [...b.matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1])
      expect(keys.sort(), b).toEqual(['exists', 'google', 'password'])
    }
    // soft-deleted and anonymous users are not accounts; case and spaces do not matter
    expect(sql).toContain('u.deleted_at is null')
    expect(sql).toContain('not coalesce(u.is_anonymous, false)')
    expect(sql).toContain('lower(u.email) = lower(btrim(p_email))')
  })
})

describe('the route', () => {
  it('is an edge POST handler with no GET', () => {
    expect(route).toContain("export const runtime = 'edge'")
    expect(route).toContain('export async function POST(')
    expect(route).not.toMatch(/export (async )?function (GET|PUT|PATCH|DELETE)\b/)
  })
  it('limits per IP and globally, both failing closed, and is never cached', () => {
    expect(route).toContain('underHourlyLimit(`email-status:${ip}`, PER_IP, false)')
    expect(route).toContain("underHourlyLimit('email-status:global', GLOBAL, false)")
    expect(route).toMatch(/const PER_IP = (\d+)/)
    expect(Number(route.match(/const PER_IP = (\d+)/)![1])).toBeLessThanOrEqual(60)
    expect(route).toContain("const NO_STORE = { 'Cache-Control': 'no-store' }")
    expect((route.match(/NextResponse\.json\(/g) || []).length).toBe((route.match(/headers: NO_STORE/g) || []).length)
    // the answer only goes out after both limiters allow it
    const limited = route.indexOf("if (!mine || !everyone)")
    expect(limited).toBeGreaterThan(0)
    expect(route.indexOf('toEmailStatus(lookup.data)')).toBeGreaterThan(limited)
  })
  it('validates before spending the limiters, and returns only the three booleans', () => {
    expect(route.indexOf('normalizeLookupEmail(')).toBeLessThan(route.indexOf('underHourlyLimit('))
    expect(route).toContain("svc.rpc('auth_email_status', { p_email: email })")
    expect(route).toContain('NextResponse.json(toEmailStatus(lookup.data), { headers: NO_STORE })')
  })
  it('the post-deploy route audit probes it', () => {
    const audit = read('scripts/route-audit.mjs')
    expect(audit).toContain("'auth/email-status bad email → 400'")
    expect(audit).toContain("'auth/email-status GET → 405'")
  })
})
