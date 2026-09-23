// L4 route & API contract audit (design/test-plan-2026-09-22.md §L4).
//   node scripts/route-audit.mjs                 # against production
//   BASE=http://localhost:3000 node scripts/route-audit.mjs
// Anonymous only. Prints one line per probe and a summary; exit 1 on any
// failure so it can gate a deploy later.
const BASE = process.env.BASE || 'https://www.stayloop.ai'
const bust = () => `v=${Date.now()}`
const results = []
async function probe(name, url, opts = {}, expect = {}) {
  const t0 = Date.now()
  let res, body = ''
  try {
    res = await fetch(url, { redirect: 'manual', ...opts, headers: { 'user-agent': 'stayloop-route-audit', ...(opts.headers || {}) } })
    body = await res.text()
  } catch (e) { results.push({ name, ok: false, note: `fetch failed: ${e.message}` }); return }
  const ms = Date.now() - t0
  const checks = []
  if (expect.status) checks.push([`status ${expect.status}`, Array.isArray(expect.status) ? expect.status.includes(res.status) : res.status === expect.status, `got ${res.status}`])
  if (expect.location) checks.push([`location ${expect.location}`, (res.headers.get('location') || '').includes(expect.location), `got ${res.headers.get('location')}`])
  for (const [h, re] of Object.entries(expect.headers || {})) checks.push([`header ${h}`, re.test(res.headers.get(h) || ''), `got ${res.headers.get(h)}`])
  if (expect.bodyIncludes) for (const s of [].concat(expect.bodyIncludes)) checks.push([`body has ${JSON.stringify(s)}`, body.includes(s), ''])
  if (expect.bodyExcludes) for (const s of [].concat(expect.bodyExcludes)) checks.push([`body lacks ${JSON.stringify(s)}`, !body.includes(s), ''])
  if (expect.json) { try { const j = JSON.parse(body); const r = expect.json(j); checks.push(['json', r === true, r === true ? '' : String(r)]) } catch (e) { checks.push(['json', false, 'not JSON']) } }
  if (res.status >= 500) checks.push(['no 5xx', false, `got ${res.status}`])
  const ok = checks.every(c => c[1])
  results.push({ name, ok, ms, status: res.status, note: checks.filter(c => !c[1]).map(c => `${c[0]} (${c[2]})`).join('; ') })
}
const HDR = { 'strict-transport-security': /max-age=\d+/, 'x-frame-options': /DENY/i, 'referrer-policy': /strict-origin-when-cross-origin/ }
const PUBLIC = ['/', '/pricing', '/tenant', '/landlord', '/agent', '/platform', '/stayloop-api', '/stayloop-api/docs', '/screening', '/about', '/partners', '/contact', '/disputes', '/listings', '/privacy', '/terms', '/login', '/register', '/onboarding/name?role=landlord', '/onboarding/tier1', '/leases/import', '/screening/app', '/dashboard', '/settings', '/landlord/agent', '/tenant/agent', '/agent/agent', '/agent/verify', '/notifications']
for (const p of PUBLIC) await probe(`GET ${p}`, `${BASE}${p}${p.includes('?') ? '&' : '?'}${bust()}`, {}, { status: 200, headers: HDR })
await probe('404 unknown path', `${BASE}/no-such-page-${Date.now()}`, {}, { status: 404 })
await probe('308 apex → www', `https://stayloop.ai/pricing`, {}, { status: 308, location: 'www.stayloop.ai/pricing' })
await probe('308 /landlord/settings → /settings', `${BASE}/landlord/settings`, {}, { status: 308, location: '/settings' })
await probe('308 screening.stayloop.ai → /screening', `https://screening.stayloop.ai/anything`, {}, { status: 308, location: 'www.stayloop.ai/screening' })
await probe('verify page no-referrer', `${BASE}/verify/not-a-real-token?${bust()}`, {}, { status: 200, headers: { 'referrer-policy': /no-referrer$/ } })
await probe('public share invalid token', `${BASE}/p/invalid-token-xyz?${bust()}`, {}, { status: 200 })
await probe('listing detail 404 on unknown slug renders', `${BASE}/listings/no-such-slug-xyz?${bust()}`, {}, { status: [200, 404] })
// APIs — anonymous
const J = { headers: { 'content-type': 'application/json' } }
await probe('public stats', `${BASE}/api/public/stats?${bust()}`, {}, { status: 200, json: j => (['screenings', 'ltbOrders', 'listings', 'trrebQuarters'].every(k => typeof j[k] === 'number' && j[k] >= 0)) || `keys: ${Object.keys(j)}` })
await probe('screen-score anon → 401', `${BASE}/api/screen-score`, { method: 'POST', ...J, body: '{}' }, { status: [401, 400] })
await probe('deep-check anon → 401', `${BASE}/api/deep-check`, { method: 'POST', ...J, body: '{"employer_names":["x"],"applicant_name":"y"}' }, { status: [401, 403] })
await probe('screening DELETE anon → 401', `${BASE}/api/screening/00000000-0000-0000-0000-000000000000`, { method: 'DELETE' }, { status: [401, 403] })
await probe('verify/create anon → 401', `${BASE}/api/verify/create`, { method: 'POST', ...J, body: '{}' }, { status: [401, 400] })
await probe('agent/execute anon → 401', `${BASE}/api/agent/execute`, { method: 'POST', ...J, body: '{}' }, { status: [401, 400] })
await probe('agent/reflect anon → 401', `${BASE}/api/agent/reflect`, { method: 'POST', ...J, body: '{}' }, { status: [401, 403] })
await probe('agent/proactive anon → 401', `${BASE}/api/agent/proactive`, { method: 'POST', ...J, body: '{}' }, { status: [401, 403] })
await probe('stripe/checkout anon → 4xx', `${BASE}/api/stripe/checkout`, { method: 'POST', ...J, body: '{}' }, { status: [400, 401] })
await probe('stripe/portal anon → 4xx', `${BASE}/api/stripe/portal`, { method: 'POST', ...J, body: '{}' }, { status: [400, 401] })
await probe('stripe/unlock anon → 4xx', `${BASE}/api/stripe/unlock`, { method: 'POST', ...J, body: '{}' }, { status: [400, 401] })
await probe('stripe/webhook unsigned → 400', `${BASE}/api/stripe/webhook`, { method: 'POST', ...J, body: '{}' }, { status: 400 })
await probe('lease/send anon → 401', `${BASE}/api/lease/send`, { method: 'POST', ...J, body: '{}' }, { status: [401, 400] })
await probe('lease/sign bad token → 4xx', `${BASE}/api/lease/sign`, { method: 'POST', ...J, body: '{"token":"nope"}' }, { status: [400, 401, 404] })
await probe('file-url anon → 401', `${BASE}/api/file-url`, { method: 'POST', ...J, body: '{"path":"x"}' }, { status: [400, 401] })
await probe('ltb-search anon → 401', `${BASE}/api/ltb-search`, { method: 'POST', ...J, body: '{"name":"x"}' }, { status: [400, 401] })
await probe('trust/verify no key → 401', `${BASE}/api/trust/verify`, { method: 'POST', ...J, body: '{}' }, { status: [400, 401] })
await probe('admin/model-discover anon → 401', `${BASE}/api/admin/model-discover`, {}, { status: [401, 403] })
await probe('admin/diag-pdftext anon → 401', `${BASE}/api/admin/diag-pdftext`, {}, { status: [401, 403] })
await probe('models/catalog anon', `${BASE}/api/models/catalog`, {}, { status: [200, 401] })
await probe('verify/[token] unknown → 404', `${BASE}/api/verify/not-a-token`, {}, { status: [404, 400, 401] })
await probe('verify webhook veriff unsigned → 4xx', `${BASE}/api/verify/webhook/veriff`, { method: 'POST', ...J, body: '{}' }, { status: [400, 401, 403] })
await probe('contact empty → 400', `${BASE}/api/contact`, { method: 'POST', ...J, body: '{}' }, { status: 400 })
await probe('household/extract anon → 401', `${BASE}/api/household/extract`, { method: 'POST', ...J, body: '{}' }, { status: [401, 400] })
await probe('household/invite anon → 401', `${BASE}/api/household/invite`, { method: 'POST', ...J, body: '{}' }, { status: [401, 400] })
await probe('classify-files anon', `${BASE}/api/classify-files`, { method: 'POST', ...J, body: '{}' }, { status: [400, 401] })
await probe('notify-landlord anon → 4xx', `${BASE}/api/notify-landlord`, { method: 'POST', ...J, body: '{}' }, { status: [400, 401] })
await probe('turn: bad JSON → 400', `${BASE}/api/agent/turn`, { method: 'POST', ...J, body: '{not json' }, { status: [400, 429] })
await probe('turn: oversized message → no 5xx', `${BASE}/api/agent/turn`, { method: 'POST', ...J, body: JSON.stringify({ role: 'tenant', message: 'x'.repeat(200_000), memories: [], workflow: null }) }, { status: [200, 400, 413, 429] })
await probe('turn: bad role → 400', `${BASE}/api/agent/turn`, { method: 'POST', ...J, body: JSON.stringify({ role: 'admin', message: 'hi', memories: [], workflow: null }) }, { status: [400, 429] })

const pass = results.filter(r => r.ok).length
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.status ? ` [${r.status}${r.ms != null ? ` ${r.ms}ms` : ''}]` : ''}${r.note ? ` — ${r.note}` : ''}`)
console.log(`\nSUMMARY: ${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
