// Phone / tablet sweep (2026-11-18). Every page of one identity is loaded on a phone and on a tablet and measured
// at several widths; results go to JSON, full-page screenshots beside them. Read-only against production: it signs
// a test account in with a one-time link (service role read from .env.local inside this process, never printed).
//
//   MODE=layout  (default)  sideways overflow and what causes it · content cut by an overflow:hidden box · text
//                           controls under 16px · touch targets under 24px · the fixed tab bar sitting on the last
//                           lines · where the aside lands on tablets
//   MODE=covered            text or controls painted over by something else (how the pricing banner was found)
//
// Playwright is NOT a project dependency. Install it in a scratch folder (npm i playwright && npx playwright install
// webkit) and point PLAYWRIGHT at it:
//   PLAYWRIGHT=/abs/scratch/node_modules/playwright/index.mjs \
//   node scripts/e2e/responsive/sweep.mjs <webkit|chrome> <anon|tenant|landlord|agent|provider> <outDir> <repo> [zh|en]
// then:  python3 scripts/e2e/responsive/summary.py <outDir>
// Env: BASE=http://localhost:3000 (a local build) · ONLY=/a,/b (just these paths) · KIND=phone|tablet · TOKFILE=labels.json ({label: "/lease/sign/<token>"}; the
// label, not the token, is what gets written to the results).
// WebKit matters: iPhones and iPads are all WebKit, and two of the 2026-11-18 findings showed in WebKit only.
// Full-page screenshots show `.sl-reveal` sections blank (scroll-driven animation) — that is the capture, not the page.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const { webkit, chromium } = await import(process.env.PLAYWRIGHT || 'playwright')
const MODE = process.env.MODE === 'covered' ? 'covered' : 'layout'
const [, , engine, role, outDir, repo, lang = 'zh'] = process.argv
const env = Object.fromEntries(readFileSync(`${repo}/.env.local`, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
// BASE=http://localhost:3000 checks a local build before it ships: the sign-in still happens on production (the
// one-time link redirects there) and the session is copied to the local origin.
const LIVE = 'https://www.stayloop.ai'
const BASE = process.env.BASE || LIVE
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EMAIL = { tenant: 'tenant-test@stayloop.ai', landlord: 'landlord-test@stayloop.ai', agent: 'agent-test@stayloop.ai', provider: 'provider-test@stayloop.ai' }
const ROUTES = {
  anon: ['/', '/pricing', '/platform', '/services', '/rules', '/tools', '/screening', '/listings', '/agents', '/providers', '/tenant', '/landlord', '/agent', '/tenant/agent', '/stayloop-api', '/stayloop-api/docs', '/about', '/partners', '/contact', '/disputes', '/privacy', '/terms', '/consumer-rights', '/my-file', '/login', '/register'],
  tenant: ['/tenant/agent', '/tenant/todo', '/tenant/ideas', '/tenant/progress', '/tenant/passport', '/tenant/applications', '/tenant/lease', '/tenant/maintenance', '/tenant/move-in', '/tenant/payments', '/tenant/audit', '/messages', '/listings', '/tools', '/my-file', '/agents', '/providers', '/providers/professional', '/settings', '/settings/models', '/landlord/become'],
  landlord: ['/landlord/agent', '/landlord/todo', '/landlord/ideas', '/landlord/progress', '/dashboard', '/dashboard/listings/quick', '/dashboard/listings/new', '/landlord/applicants', '/screening/app', '/landlord/leases', '/landlord/leases/new', '/landlord/notices', '/landlord/maintenance', '/landlord/providers', '/landlord/finance', '/landlord/audit', '/messages', '/leases/import', '/pricing', '/settings'],
  agent: ['/agent/agent', '/agent/todo', '/agent/ideas', '/agent/progress', '/agent/clients', '/agent/tasks', '/agent/checklist', '/agent/calendar', '/agent/earnings', '/agent/verify', '/agent/audit', '/screening/app', '/messages', '/agents', '/settings'],
  provider: ['/provider/jobs', '/provider/history', '/provider/onboard', '/providers', '/services', '/messages', '/settings'],
}
if (process.env.ONLY) ROUTES[role] = process.env.ONLY.split(',')
const LABEL = {}
if (process.env.TOKFILE) { const m = JSON.parse(readFileSync(process.env.TOKFILE, 'utf8')); ROUTES[role] = Object.values(m); for (const k in m) LABEL[m[k]] = '/token:' + k }
const FOLLOW = { '/listings': /^\/listings\/[^/]+$/, '/agents': /^\/agents\/[^/]+$/, '/tenant/applications': /^\/tenant\/applications\/[^/]+$/, '/tenant/lease': /^\/h\/[^/]+$/, '/landlord/leases': /^\/(landlord\/leases\/[0-9a-f-]{20,}|h\/[^/]+)$/, '/landlord/applicants': /^\/landlord\/applicants\/[^/]+$/, '/dashboard': /^\/dashboard\/listings\/[^/]+\/edit$/ }
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  androidTab: 'Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
}
const PLAN = MODE === 'covered'
  ? [{ kind: 'phone', ua: UA.iphone, load: [390, 844], more: [] }, { kind: 'tablet', ua: UA.ipad, load: [820, 1180], more: [[1024, 768]] }]
  : engine === 'webkit'
  ? [{ kind: 'phone', ua: UA.iphone, load: [390, 844], more: [[360, 740], [430, 932], [844, 390]], shot: 'full' }, { kind: 'tablet', ua: UA.ipad, load: [820, 1180], more: [[768, 1024], [1024, 768], [1180, 820]], shot: 'full', shotAt: 1024 }]
  : [{ kind: 'phone', ua: UA.android, load: [360, 780], more: [[412, 915]] }, { kind: 'tablet', ua: UA.androidTab, load: [800, 1280], more: [[600, 960]] }]
const only = process.env.KIND
const plan = only ? PLAN.filter((p) => p.kind === only) : PLAN

const MEASURE_LAYOUT = `(() => {
  const d = document.documentElement, vw = d.clientWidth, vh = window.innerHeight
  const cs = (e) => getComputedStyle(e)
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; const s = cs(e); return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.02 }
  const name = (e) => { const t = e.getAttribute('data-testid'); const txt = (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim().slice(0, 34); const cls = String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || '').split(/\\s+/).filter(Boolean).slice(0, 3).join('.'); return e.tagName.toLowerCase() + (t ? '[' + t + ']' : cls ? '.' + cls : '') + (txt ? ' "' + txt + '"' : '') }
  const fixedUp = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const pos = cs(p).position; if (pos === 'fixed') return true } return false }
  const clipAnc = (e) => { for (let p = e.parentElement; p && p !== document.body && p !== d; p = p.parentElement) { const ox = cs(p).overflowX; if (ox !== 'visible') return { el: p, ox } } return null }
  const all = [...document.body.querySelectorAll('*')]
  const overflow = Math.round(d.scrollWidth - d.clientWidth)
  // 1. what pushes the page sideways
  const wide = []
  if (overflow > 1) {
    const out = new Set()
    for (const e of all) { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue; if (r.right > vw + 1.5 && !fixedUp(e) && !clipAnc(e) && vis(e)) out.add(e) }
    for (const e of out) { if (![...e.children].some((c) => out.has(c))) { const r = e.getBoundingClientRect(); wide.push(name(e) + ' → right ' + Math.round(r.right) + ' (w ' + Math.round(r.width) + ')') } }
  }
  // 2. content cut off by an overflow:hidden box (no way to scroll to it)
  const cut = []
  for (const e of all) {
    if (cut.length >= 6) break
    if (e.children.length && !/^(BUTTON|A|IMG|INPUT|SELECT|TEXTAREA|LABEL)$/.test(e.tagName)) continue
    if (!(e.innerText || '').trim() && !/^(IMG|INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) continue
    const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue
    const a = clipAnc(e); if (!a || (a.ox !== 'hidden' && a.ox !== 'clip')) continue
    const ar = a.el.getBoundingClientRect(); if (ar.width <= 2) continue
    if ((r.right > ar.right + 3 || r.left < ar.left - 3) && vis(e) && !fixedUp(e) && r.top < d.scrollHeight) {
      const st = cs(a.el); if (st.textOverflow === 'ellipsis' && r.left >= ar.left - 3) continue
      if (ar.right < 0 || ar.left > vw) continue
      cut.push(name(e) + ' cut by ' + name(a.el).slice(0, 50) + ' (' + Math.round(r.right - ar.right) + 'px)')
    }
  }
  // 2b. own text wider than its box, hidden without an ellipsis
  const clipText = []
  for (const e of all) {
    if (clipText.length >= 5) break
    if (!/^(H1|H2|H3|H4|BUTTON|A|LABEL|TH|TD|P|SPAN|DIV)$/.test(e.tagName) || e.children.length > 2) continue
    if (e.scrollWidth <= e.clientWidth + 2 || !e.clientWidth) continue
    const s = cs(e); if ((s.overflowX !== 'hidden' && s.overflowX !== 'clip') || s.textOverflow === 'ellipsis') continue
    if (!(e.innerText || '').trim() || !vis(e) || e.clientWidth < 8) continue
    clipText.push(name(e) + ' (' + e.scrollWidth + ' in ' + e.clientWidth + ')')
  }
  // 3. text controls under 16px (iOS zooms the page on focus)
  const ctl = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea, select')].filter(vis)
  const small = vw < 1024 ? ctl.filter((e) => parseFloat(cs(e).fontSize) < 16).map((e) => name(e) + ' ' + cs(e).fontSize).slice(0, 5) : []
  // 4. touch targets
  const targets = [...document.querySelectorAll('a[href], button, [role=button], [role=tab], select, input[type=checkbox], input[type=radio], summary')].filter(vis)
  const inlineText = (e) => { const s = cs(e); if (s.display !== 'inline') return false; const p = e.parentElement; return !!p && (p.innerText || '').trim().length > (e.innerText || '').trim().length + 4 }
  const tiny = []; let under44 = 0, nTargets = 0
  for (const e of targets) {
    if (inlineText(e)) continue
    let r = e.getBoundingClientRect()
    if (/^INPUT$/.test(e.tagName)) { const l = e.closest('label'); if (l) r = l.getBoundingClientRect() }
    nTargets++
    const m = Math.min(r.width, r.height)
    if (m < 44) under44++
    if (m < 24 && tiny.length < 6) tiny.push(name(e) + ' ' + Math.round(r.width) + '×' + Math.round(r.height))
  }
  // 5. navigation present
  const navs = [...document.querySelectorAll('nav, [role=navigation]')].filter(vis).map((n) => { const r = n.getBoundingClientRect(); return (n.getAttribute('aria-label') || n.getAttribute('data-testid') || '?') + ' ' + cs(n).position + ' ' + Math.round(r.width) + '×' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top) })
  // 6. fixed bar at the bottom: does the page leave room for it?
  let covered = null
  const bars = all.filter((e) => { const s = cs(e); if (s.position !== 'fixed') return false; const r = e.getBoundingClientRect(); return r.width >= vw * 0.85 && r.height > 20 && r.height < 160 && r.bottom >= vh - 2 && vis(e) })
  if (bars.length) {
    const top = Math.min(...bars.map((b) => b.getBoundingClientRect().top)); const barH = vh - top
    let last = 0, lastEl = null
    for (const e of (document.querySelector('main') || document.body).querySelectorAll('*')) { if (e.children.length) continue; const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue; if (!(e.innerText || '').trim() && !/^(IMG|INPUT|BUTTON|SVG|svg)$/.test(e.tagName)) continue; const b = r.bottom + window.scrollY; if (b > last && !fixedUp(e) && vis(e)) { last = b; lastEl = e } }
    const room = Math.round(d.scrollHeight - last)
    covered = { barH: Math.round(barH), room, hidden: room < barH - 2 ? name(lastEl) : null }
  }
  // 7. columns
  const aside = [...document.querySelectorAll('main aside')].filter(vis).map((a) => { const r = a.getBoundingClientRect(); return Math.round(r.width) + '×' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top + window.scrollY) })
  const scrollers = all.filter((e) => { const ox = cs(e).overflowX; return (ox === 'auto' || ox === 'scroll') && e.scrollWidth > e.clientWidth + 2 && vis(e) }).map((e) => name(e).slice(0, 60) + ' (' + e.scrollWidth + ' in ' + e.clientWidth + ')').slice(0, 5)
  const fixedShare = Math.round(100 * all.filter((e) => cs(e).position === 'fixed' || cs(e).position === 'sticky').filter(vis).map((e) => e.getBoundingClientRect()).filter((r) => r.width >= vw * 0.85 && r.height < vh * 0.6 && r.top < vh && r.bottom > 0).reduce((s, r) => s + Math.min(r.bottom, vh) - Math.max(r.top, 0), 0) / vh)
  return { vw, vh, overflow, wide: wide.slice(0, 5), cut, clipText, small, tiny, under44, nTargets, navs, covered, aside, scrollers, fixedShare, docH: d.scrollHeight }
})()`


const MEASURE_COVERED = `(() => {
  const vh = innerHeight, vw = document.documentElement.clientWidth, cs = (e) => getComputedStyle(e)
  const name = (e) => { const t = e.getAttribute && e.getAttribute('data-testid'); const txt = (e.innerText || (e.getAttribute && (e.getAttribute('aria-label') || e.getAttribute('placeholder'))) || '').replace(/\\s+/g, ' ').trim().slice(0, 30); const cls = String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || '').split(/\\s+/).filter(Boolean).slice(0, 2).join('.'); return e.tagName.toLowerCase() + (t ? '[' + t + ']' : cls ? '.' + cls : '') + (txt ? ' "' + txt + '"' : '') }
  const pinned = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const pos = cs(p).position; if (pos === 'fixed' || pos === 'sticky') return true } return false }
  const out = []; let n = 0
  for (const e of document.querySelectorAll('main *, footer *')) {
    if (n > 700 || out.length > 14) break
    const ctl = /^(IMG|INPUT|BUTTON|SELECT|TEXTAREA)$/.test(e.tagName)
    const texts = [...e.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim().length > 1)
    if (!ctl && !texts.length) continue
    const s = cs(e); if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none' || parseFloat(s.opacity) < 0.05) continue
    const r0 = e.getBoundingClientRect(); if (r0.width < 4 || r0.height < 4 || pinned(e)) continue
    if (e.checkVisibility && !e.checkVisibility()) continue
    n++
    let rects = []
    if (texts.length) { const rg = document.createRange(); for (const t of texts) { rg.selectNodeContents(t); rects.push(...rg.getClientRects()) } rects = rects.filter((r) => r.width > 3 && r.height > 3); if (rects.length > 2) rects = [rects[0], rects[rects.length - 1]] } else rects = [r0]
    const pts = rects.map((r) => ({ docY: r.top + scrollY + r.height / 2, cx: r.left + r.width / 2 }))
    for (const { docY, cx } of pts) {
      window.scrollTo(0, Math.max(0, docY - vh / 2))
      const cy = docY - scrollY
      if (cx < 1 || cx > vw - 1 || cy < 1 || cy > vh - 1) continue
      const hit = document.elementFromPoint(cx, cy)
      if (!hit || hit === e || e.contains(hit) || hit.contains(e)) continue
      if (pinned(hit)) { if (docY > 140 && document.documentElement.scrollHeight - docY > 140) continue; out.push(name(e) + ' ⟵ always under pinned ' + name(hit)); break }
      let clipped = false
      for (let p = e; p && p !== document.body; p = p.parentElement) { const ps = cs(p); if (ps.overflowX !== 'visible' || ps.overflowY !== 'visible') { const pr = p.getBoundingClientRect(); if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) { clipped = true; break } } }
      if (clipped) continue
      out.push(name(e) + ' ⟵ under ' + name(hit)); break
    }
  }
  window.scrollTo(0, 0)
  return { vw, covered: [...new Set(out)], checked: n }
})()`


const MEASURE = MODE === 'covered' ? MEASURE_COVERED : MEASURE_LAYOUT

const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' })
const out = { engine, role, lang, runs: [] }
const file = `${outDir}/${MODE === 'covered' ? 'covered-' : ''}${engine}-${role}${process.env.TOKFILE ? 'tok' : ''}-${lang}.json`
mkdirSync(`${outDir}/shots`, { recursive: true })
try {
  for (const p of plan) {
    const ctx = await browser.newContext({ viewport: { width: p.load[0], height: p.load[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: p.ua, locale: lang === 'en' ? 'en-CA' : 'zh-CN' })
    await ctx.addInitScript((l) => { try { localStorage.setItem('stayloop_lang', l) } catch {} }, lang)
    const page = await ctx.newPage()
    let errors = []
    page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 180)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)) })
    let signedIn = null
    if (role !== 'anon') {
      const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(LIVE + '/settings')}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: EMAIL[role] }) })
      const j = await res.json(); const link = j.action_link || j.properties?.action_link
      if (!link) throw new Error('no link: ' + Object.keys(j).join(','))
      await page.goto(link, { waitUntil: 'domcontentloaded' }).catch(() => {})
      for (let i = 0; i < 30; i++) { await sleep(500); signedIn = await page.evaluate(() => Object.keys(localStorage).some((k) => /auth-token/.test(k))).catch(() => false); if (signedIn) break }
      if (BASE !== LIVE && signedIn) {
        const kv = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /auth-token/.test(k)).map((k) => [k, localStorage.getItem(k)])))
        await page.goto(BASE + '/robots.txt', { waitUntil: 'domcontentloaded' }).catch(() => {})
        await page.evaluate((kv) => { for (const k in kv) localStorage.setItem(k, kv[k]) }, kv)
      }
      await sleep(1500)
    }
    const run = { kind: p.kind, signedIn, pages: [] }
    out.runs.push(run)
    const visit = async (path, from) => {
      errors = []
      await page.setViewportSize({ width: p.load[0], height: p.load[1] })
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => errors.push('goto: ' + String(e.message).slice(0, 80)))
      let last = -1, stable = 0
      for (let i = 0; i < 22; i++) { await sleep(500); const len = await page.evaluate(() => ((document.querySelector('main') || document.body).innerText || '').length).catch(() => -1); if (len === last && len > 40) { if (++stable >= 3) break } else { stable = 0; last = len } }
      const rec = { asked: LABEL[path] || path, from, at: LABEL[path] ? '' : await page.evaluate(() => location.pathname).catch(() => '?'), sizes: {} }
      const slug = (role + (LABEL[path] || path)).replace(/[^a-z0-9]+/gi, '_').slice(0, 60)
      rec.sizes[p.load.join('x')] = await page.evaluate(MEASURE).catch((e) => ({ err: String(e.message).slice(0, 120) }))
      if (p.shot && MODE === 'layout') await page.screenshot({ path: `${outDir}/shots/${engine}-${lang}-${slug}-${p.load[0]}.png`, fullPage: true, scale: 'css' }).catch(() => {})
      const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href').split('?')[0].split('#')[0]))]).catch(() => [])
      for (const s of p.more) {
        await page.setViewportSize({ width: s[0], height: s[1] }); await sleep(450)
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
        rec.sizes[s.join('x')] = await page.evaluate(MEASURE).catch((e) => ({ err: String(e.message).slice(0, 120) }))
        if (p.shotAt === s[0] && MODE === 'layout') await page.screenshot({ path: `${outDir}/shots/${engine}-${lang}-${slug}-${s[0]}.png`, scale: 'css' }).catch(() => {})
      }
      rec.errors = [...new Set(errors)].slice(0, 4)
      run.pages.push(rec)
      writeFileSync(file, JSON.stringify(out, null, 1))
      return links
    }
    for (const path of ROUTES[role]) {
      const links = await visit(path)
      const f = FOLLOW[path] && links.find((h) => FOLLOW[path].test(h) && !/\/(new|quick)$/.test(h))
      if (f) { await visit(f, path); if (role === 'anon' && path === '/listings') await visit('/apply/' + f.split('/').pop(), f) }
    }
    await ctx.close()
  }
  console.log(`${engine} ${role} ${lang}: ` + out.runs.map((r) => `${r.kind} ${r.pages.length} pages signedIn=${r.signedIn}`).join(' · '))
} catch (e) { console.log(`${engine} ${role} FAILED: ${String(e?.stack || e).slice(0, 300)}`) }
await browser.close()
