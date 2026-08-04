// Mobile-overflow audit against production (or any base URL).
//
// The failure mode this hunts is the one that bit the v8 hero: a container
// with an implicit min-width gets CLIPPED by an ancestor's overflow:hidden —
// content is invisible with no horizontal scrollbar and therefore no symptom.
// So the probe measures BOTH document scrollWidth overflow and the widest
// offending elements, per width × language × route.
//
// Committed to the repo (the 2026-07-29 audit lived in a session scratchpad
// and evaporated); run it after any layout-touching change:
//   node scripts/mobile-audit.mjs                    # public routes
//   node scripts/mobile-audit.mjs --authed           # + signed-in routes (needs .env.local)
//   BASE=http://localhost:3000 node scripts/mobile-audit.mjs
//
// Requires the globally-installed playwright (`/opt/homebrew/lib/node_modules`)
// and its cached chrome-headless-shell — neither is a project dependency.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire('/opt/homebrew/lib/node_modules/')
const { chromium } = require('playwright')

const BASE = process.env.BASE || 'https://www.stayloop.ai'
const AUTHED = process.argv.includes('--authed')
const WIDTHS = [320, 390]
const LANGS = ['zh', 'en']

const PUBLIC_ROUTES = [
  '/', '/pricing', '/tenant', '/landlord', '/agent', '/trust-api', '/about',
  '/partners', '/contact', '/disputes', '/listings', '/privacy', '/terms',
  '/login', '/register', '/screening',
]

const AUTHED_ROUTES = [
  '/dashboard', '/settings', '/notifications',
  '/tenant/agent', '/tenant/applications', '/tenant/lease', '/tenant/maintenance',
  '/tenant/passport', '/tenant/payments', '/tenant/audit', '/tenant/move-in',
  '/landlord/agent', '/landlord/applicants', '/landlord/finance', '/landlord/leases',
  '/landlord/maintenance', '/landlord/audit',
  '/agent/agent', '/agent/calendar', '/agent/clients', '/agent/earnings', '/agent/tasks',
  '/screening/app', '/leases/import',
]

function env() {
  const out = {}
  for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const i = l.indexOf('=')
    if (i > 0 && !l.startsWith('#')) out[l.slice(0, i)] = l.slice(i + 1).replace(/^"|"$/g, '')
  }
  return out
}

async function main() {
  let session = null
  let cleanup = async () => {}
  let extraRoutes = []

  if (AUTHED) {
    const e = env()
    // supabase-js from the project's own node_modules via a dynamic import.
    const { createClient } = await import(new URL('../node_modules/@supabase/supabase-js/dist/module/index.js', import.meta.url).href)
      .catch(async () => await import('@supabase/supabase-js'))
    const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const email = `mobile-audit-${Date.now()}@stayloop-test.local`
    const password = `Pw-${Date.now()}!aud`
    const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    const client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data: signin, error: e2 } = await client.auth.signInWithPassword({ email, password })
    if (e2) throw e2
    const ref = new URL(e.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
    session = { key: `sb-${ref}-auth-token`, value: JSON.stringify(signin.session) }

    // A household so /h/[id] renders real chrome (tabs, cards) not the 404 shell.
    const { data: hid } = await client.rpc('create_household_import', {
      p_address: '55 Audit Blvd', p_unit: '9', p_city: 'Toronto',
      p_monthly_rent: 2200, p_rent_due_day: 1, p_start_date: '2026-04-01', p_end_date: null,
      p_creator_role: 'landlord', p_tenant_name: 'Mobile Audit', p_tenant_email: null,
    })
    if (hid) {
      await client.from('household_messages').insert({ household_id: hid, sender_id: u.user.id, body: '这是一条用于移动端适配检查的较长消息,包含一些内容让气泡有实际宽度。' })
      await client.from('maintenance_tickets').insert({ household_id: hid, opened_by: u.user.id, title: '水龙头漏水——移动端适配检查工单', priority: 'high', status: 'new' })
      extraRoutes.push(`/h/${hid}`)
      const { data: inv } = await client.from('household_invites')
        .insert({ household_id: hid, invited_email: 'audit-peek@example.com', invited_role: 'tenant', invited_by: u.user.id })
        .select('token').single()
      if (inv) extraRoutes.push({ path: `/join/${inv.token}`, anon: true })
    }
    cleanup = async () => {
      if (hid) {
        const { data: h } = await admin.from('households').select('current_lease_id').eq('id', hid).single()
        await admin.from('households').delete().eq('id', hid)
        if (h?.current_lease_id) await admin.from('lease_documents').delete().eq('id', h.current_lease_id)
      }
      await admin.auth.admin.deleteUser(u.user.id)
      await admin.from('landlords').delete().eq('auth_id', u.user.id)
    }
  }

  const browser = await chromium.launch({
    executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  })

  const routes = [
    ...PUBLIC_ROUTES.map((p) => ({ path: p, anon: true })),
    ...(AUTHED ? AUTHED_ROUTES.map((p) => ({ path: p, anon: false })) : []),
    ...extraRoutes.map((r) => (typeof r === 'string' ? { path: r, anon: false } : r)),
  ]

  const failures = []
  let checked = 0

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true })
    for (const lang of LANGS) {
      for (const r of routes) {
        const page = await ctx.newPage()
        try {
          await page.addInitScript(([l, s, anon]) => {
            localStorage.setItem('stayloop_lang', l)
            if (s && !anon) localStorage.setItem(s.key, s.value)
          }, [lang, session, r.anon])
          await page.goto(`${BASE}${r.path}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
          await page.waitForTimeout(2500)
          const res = await page.evaluate(() => {
            const doc = document.scrollingElement
            const overflow = doc.scrollWidth - window.innerWidth
            const offenders = []
            if (overflow > 1) {
              for (const el of document.querySelectorAll('body *')) {
                const rect = el.getBoundingClientRect()
                if (rect.right > window.innerWidth + 1 && rect.width > 40) {
                  const id = el.id ? `#${el.id}` : ''
                  const cls = typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : ''
                  offenders.push(`${el.tagName.toLowerCase()}${id}${cls} right=${Math.round(rect.right)}`)
                  if (offenders.length >= 4) break
                }
              }
            }
            return { overflow, offenders }
          })
          checked++
          if (res.overflow > 1) {
            failures.push({ width, lang, path: r.path, overflow: res.overflow, offenders: res.offenders })
            console.log(`FAIL ${width}px ${lang} ${r.path} — overflow ${res.overflow}px`)
            for (const o of res.offenders) console.log(`      ${o}`)
          }
        } catch (err) {
          console.log(`ERR  ${width}px ${lang} ${r.path} — ${err.message?.slice(0, 80)}`)
        } finally {
          await page.close()
        }
      }
    }
    await ctx.close()
  }

  await browser.close()
  await cleanup()
  console.log(`\nchecked ${checked} combinations · ${failures.length} overflow(s)`)
  process.exit(failures.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
