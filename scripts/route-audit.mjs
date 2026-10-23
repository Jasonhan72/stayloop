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
// nosniff on worker-rendered pages and APIs, and the microphone allowed for the
// site itself (the voice-input button) — site test 2026-10-02, L4:D1 / L4:D5.
const HDR = { 'strict-transport-security': /max-age=\d+/, 'x-frame-options': /DENY/i, 'referrer-policy': /strict-origin-when-cross-origin/, 'x-content-type-options': /^nosniff$/i, 'permissions-policy': /microphone=\(self\)/ }
const PUBLIC = ['/', '/pricing', '/tenant', '/landlord', '/agent', '/platform', '/stayloop-api', '/stayloop-api/docs', '/services', '/screening', '/about', '/partners', '/contact', '/disputes', '/listings', '/privacy', '/terms', '/login', '/register', '/onboarding/name?role=landlord', '/onboarding/tier1', '/leases/import', '/screening/app', '/dashboard', '/settings', '/landlord/agent', '/landlord/notices', '/tenant/agent', '/agent/agent', '/agent/verify', '/notifications', '/provider/jobs', '/provider/history', '/my-file', '/consumer-rights', '/agents']
for (const p of PUBLIC) await probe(`GET ${p}`, `${BASE}${p}${p.includes('?') ? '&' : '?'}${bust()}`, {}, { status: 200, headers: HDR })
// Cloudflare Email Obfuscation must find no address in a text run here, or the
// rewritten DOM breaks hydration (React #418) — L6-public:D1.
await probe('docs page: no obfuscated address', `${BASE}/stayloop-api/docs?${bust()}`, {}, { status: 200, bodyExcludes: '__cf_email__' })
await probe('404 unknown path', `${BASE}/no-such-page-${Date.now()}`, {}, { status: 404 })
await probe('308 apex → www', `https://stayloop.ai/pricing`, {}, { status: 308, location: 'www.stayloop.ai/pricing' })
await probe('308 /landlord/settings → /settings', `${BASE}/landlord/settings`, {}, { status: 308, location: '/settings' })
await probe('308 screening.stayloop.ai → /screening', `https://screening.stayloop.ai/anything`, {}, { status: 308, location: 'www.stayloop.ai/screening' })
await probe('intake page no-referrer', `${BASE}/intake/not-a-real-token?${bust()}`, {}, { status: 200, headers: { 'referrer-policy': /no-referrer$/ } })
await probe('agent-intake unknown token → 404', `${BASE}/api/agent-intake/not-a-token`, {}, { status: [404, 400] })
// V0.8 consumer file access (CRA s.12 / s.13 / s.12.1): the applicant's one-time link page
// carries no-referrer and says the link is invalid without any fetch; the request
// endpoint never reveals whether an email exists (200), or rejects a malformed one (400).
await probe('my-file token page: no-referrer + invalid-link text', `${BASE}/my-file/not-a-token?${bust()}`, {}, { status: 200, headers: { 'referrer-policy': /no-referrer$/ }, bodyIncludes: '链接无效' })
await probe('consumer/request bad email → 400 or 200', `${BASE}/api/consumer/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"not-an-email"}' }, { status: [200, 400, 429] })
await probe('verify page no-referrer', `${BASE}/verify/not-a-real-token?${bust()}`, {}, { status: 200, headers: { 'referrer-policy': /no-referrer$/ } })
// Every token page sends no-referrer (site test 2026-10-17, G-D3).
for (const p of ['/delegate', '/w', '/lease/sign', '/p', '/join']) await probe(`${p} token page no-referrer`, `${BASE}${p}/not-a-real-token?${bust()}`, {}, { status: 200, headers: { ...HDR, 'referrer-policy': /no-referrer$/ } })
await probe('public share invalid token', `${BASE}/p/invalid-token-xyz?${bust()}`, {}, { status: 200 })
await probe('listing detail 404 on unknown slug renders', `${BASE}/listings/no-such-slug-xyz?${bust()}`, {}, { status: [200, 404] })
// Public agent profiles (2026-10-21): directory JSON, unknown slug 404, contact needs sign-in.
await probe('agents directory JSON', `${BASE}/api/agents?${bust()}`, {}, { status: 200, json: j => Array.isArray(j.items) })
await probe('agent profile unknown slug → 404', `${BASE}/api/agents/no-such-agent-xyz`, {}, { status: 404 })
await probe('agent contact anon → 401', `${BASE}/api/agents/no-such-agent-xyz/contact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, { status: 401 })
await probe('mls-handoff GET anon → 401', `${BASE}/api/listings/mls-handoff`, {}, { status: 401 })
await probe('mls-handoff POST anon → 401', `${BASE}/api/listings/mls-handoff`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"request"}' }, { status: 401 })
// APIs — anonymous
const J = { headers: { 'content-type': 'application/json' } }
await probe('public stats', `${BASE}/api/public/stats?${bust()}`, {}, { status: 200, headers: { 'x-content-type-options': /^nosniff$/i }, json: j => (['screenings', 'ltbOrders', 'listings', 'trrebQuarters'].every(k => typeof j[k] === 'number' && j[k] >= 0)) || `keys: ${Object.keys(j)}` })
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
await probe('retired ai-score → 404', `${BASE}/api/ai-score`, { method: 'POST', ...J, body: '{"application_id":"zzz"}' }, { status: [404, 405], bodyExcludes: 'invalid input syntax' })
await probe('stripe/connect/onboard anon → 401', `${BASE}/api/stripe/connect/onboard`, { method: 'POST', ...J, body: '{}' }, { status: 401 })
await probe('stripe/connect/settle anon → 401', `${BASE}/api/stripe/connect/settle`, { method: 'POST', ...J, body: '{}' }, { status: 401 })
await probe('retired trust/verify → 404', `${BASE}/api/trust/verify`, { method: 'POST', ...J, body: '{}' }, { status: [404, 405] })
await probe('admin/model-discover anon → 401', `${BASE}/api/admin/model-discover`, {}, { status: [401, 403] })
await probe('admin/diag-pdftext anon → 401', `${BASE}/api/admin/diag-pdftext`, {}, { status: [401, 403] })
await probe('models/catalog anon', `${BASE}/api/models/catalog`, {}, { status: [200, 401] })
await probe('verify/[token] unknown → 404', `${BASE}/api/verify/not-a-token`, {}, { status: [404, 400, 401] })
await probe('verify webhook veriff unsigned → 4xx', `${BASE}/api/verify/webhook/veriff`, { method: 'POST', ...J, body: '{}' }, { status: [400, 401, 403] })
await probe('contact empty → 400', `${BASE}/api/contact`, { method: 'POST', ...J, body: '{}' }, { status: 400 })
await probe('auth/email-status bad email → 400', `${BASE}/api/auth/email-status`, { method: 'POST', ...J, body: '{"email":"not-an-email"}' }, { status: 400 })
await probe('auth/email-status GET → 405', `${BASE}/api/auth/email-status`, {}, { status: 405 })
await probe('auth/email-status unknown address → three booleans', `${BASE}/api/auth/email-status`, { method: 'POST', ...J, body: '{"email":"route-audit-nobody@stayloop.ai"}' }, { status: [200, 429], json: j => (j.error === 'rate_limited') || (Object.keys(j).sort().join() === 'exists,google,password' && j.exists === false) || `got ${JSON.stringify(j)}` })
// Remote MCP endpoint (stage 5 · 2026-10-16): JSON-RPC by POST only, stateless, seven read-only tools.
await probe('mcp GET → 405', `${BASE}/api/mcp`, {}, { status: 405, json: j => j.error === 'method_not_allowed' || `got ${JSON.stringify(j)}` })
await probe('mcp initialize → 200 JSON', `${BASE}/api/mcp`, { method: 'POST', ...J, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'route-audit', version: '0' } } }) }, { status: [200, 429], headers: { 'content-type': /application\/json/, 'x-api-version': /^\d{4}-\d{2}-\d{2}$/ }, json: j => (j.error && j.error === 'rate_limited') || (j.result && j.result.serverInfo && j.result.serverInfo.name === 'stayloop' && typeof j.result.protocolVersion === 'string') || `got ${JSON.stringify(j).slice(0, 200)}` })
await probe('mcp tools/list → 7 tools', `${BASE}/api/mcp`, { method: 'POST', ...J, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) }, { status: [200, 429], json: j => (j.error && j.error === 'rate_limited') || (j.result && Array.isArray(j.result.tools) && j.result.tools.length === 7 && j.result.tools.every(t => t.title && t.annotations && t.annotations.readOnlyHint === true)) || `got ${JSON.stringify(j).slice(0, 200)}` })
// Open API tier 1 (stage 5 · 2026-10-16): anonymous, no key, x-api-version on every answer.
const V1H = { 'x-api-version': /^2026-\d\d-\d\d$/, 'access-control-allow-origin': /^\*$/ }
await probe('v1/rules ON', `${BASE}/api/v1/rules?${bust()}`, {}, { status: [200, 429], headers: V1H, json: j => j.error === 'rate_limited' || (j.province === 'ON' && Array.isArray(j.rules) && j.rules.length > 0 && !!j.as_of && !!j.boundary?.zh) || `got ${JSON.stringify(j).slice(0, 120)}` })
await probe('v1/rules QC → province facts', `${BASE}/api/v1/rules?province=QC&${bust()}`, {}, { status: [200, 429], json: j => j.error === 'rate_limited' || (j.province === 'QC' && j.rules.some(r => r.id === 'QC-deposit' && r.source_url)) || `got ${JSON.stringify(j).slice(0, 120)}` })
await probe('v1/rules bad province → 400', `${BASE}/api/v1/rules?province=XX`, {}, { status: 400, bodyIncludes: 'unsupported_province' })
await probe('v1/listings/compliance deposit over cap → block', `${BASE}/api/v1/listings/compliance`, { method: 'POST', ...J, body: '{"monthly_rent":2800,"deposit":3000}' }, { status: [200, 429], headers: V1H, json: j => j.error === 'rate_limited' || (j.passed === false && j.findings[0].rule_id === 'RTA-106-deposit-cap' && j.findings[0].rule === 'RTA-106-deposit-cap') || `got ${JSON.stringify(j).slice(0, 120)}` })
await probe('v1/listings/compliance bad JSON → 400', `${BASE}/api/v1/listings/compliance`, { method: 'POST', ...J, body: '{nope' }, { status: [400, 429], bodyIncludes: ['"error"', '"message"'] })
await probe('v1/listings/compliance GET → 405', `${BASE}/api/v1/listings/compliance`, {}, { status: 405, bodyIncludes: 'method_not_allowed' })
await probe('v1/lease/terms-check QC deposit → block', `${BASE}/api/v1/lease/terms-check`, { method: 'POST', ...J, body: '{"province":"QC","rent_amount":1500,"deposit_amount":750}' }, { status: [200, 429], headers: V1H, json: j => j.error === 'rate_limited' || (j.passed === false && j.findings[0].rule_id === 'QC-CCQ-1904-no-deposit') || `got ${JSON.stringify(j).slice(0, 120)}` })
await probe('v1/guideline 2027', `${BASE}/api/v1/guideline?effective=2027-01-01`, {}, { status: [200, 429], headers: V1H, json: j => j.error === 'rate_limited' || (j.year === 2027 && j.n1_deadline === '2026-10-03' && j.cap === 2.5) || `got ${JSON.stringify(j).slice(0, 120)}` })
await probe('v1/guideline bad date → 400', `${BASE}/api/v1/guideline?effective=2027-13-01`, {}, { status: 400, bodyIncludes: 'invalid_input' })
await probe('v1/n4/earliest-termination mail', `${BASE}/api/v1/n4/earliest-termination?served=2026-11-02&method=mail`, {}, { status: [200, 429], headers: V1H, json: j => j.error === 'rate_limited' || (j.deemed_served === '2026-11-07' && j.earliest_termination === '2026-11-14') || `got ${JSON.stringify(j).slice(0, 120)}` })
await probe('v1/late-payment/persistent three late', `${BASE}/api/v1/late-payment/persistent`, { method: 'POST', ...J, body: '{"periods":[{"due_date":"2026-04-01","paid_at":"2026-04-12"},{"due_date":"2026-06-01","paid_at":"2026-06-15"},{"due_date":"2026-08-01","paid_at":null}],"as_of":"2026-10-16"}' }, { status: [200, 429], headers: V1H, json: j => j.error === 'rate_limited' || (j.persistent === true && Array.isArray(j.window)) || `got ${JSON.stringify(j).slice(0, 120)}` })
await probe('v1/late-payment/persistent 121 periods → 400', `${BASE}/api/v1/late-payment/persistent`, { method: 'POST', ...J, body: JSON.stringify({ periods: Array.from({ length: 121 }, () => ({ due_date: '2026-01-01', paid_at: null })) }) }, { status: [400, 429], bodyIncludes: '"error"' })
await probe('v1/rent-benchmark condo 1 bed', `${BASE}/api/v1/rent-benchmark?province=ON&area=Liberty%20Village&bedrooms=1&type=condo`, {}, { status: [200, 404, 429], headers: V1H, json: j => j.error === 'rate_limited' || j.error === 'not_available' || (typeof j.benchmark?.avg === 'number' && !!j.attribution?.en && !!j.attribution?.zh) || `got ${JSON.stringify(j).slice(0, 120)}` })
await probe('v1/rent-benchmark QC → 404 not_available', `${BASE}/api/v1/rent-benchmark?province=QC`, {}, { status: [404, 429], bodyIncludes: '"error"' })
await probe('v1/openapi.json', `${BASE}/api/v1/openapi.json`, {}, { status: 200, headers: { 'x-api-version': /^2026-\d\d-\d\d$/, 'cache-control': /max-age=3600/ }, json: j => (j.openapi === '3.1.0' && Object.keys(j.paths).length === 7) || `got openapi=${j.openapi} paths=${Object.keys(j.paths || {}).length}` })
await probe('v1 OPTIONS → 204', `${BASE}/api/v1/rules`, { method: 'OPTIONS' }, { status: 204, headers: { 'access-control-allow-origin': /^\*$/ } })
await probe('cron/realtor-freshness without secret → 401', `${BASE}/api/cron/realtor-freshness`, { method: 'POST', ...J, body: '{}' }, { status: 401 })
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
