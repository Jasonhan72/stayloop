// Demo content for the "[TEST]" entries of 「找经纪和服务商」 (2026-11-23, user: 专业服务每一项都要有
// test 的入驻服务商；所有 test 的经纪 / 服务商都要有卡通头像和 demo 内容).
//
//   node scripts/demo/seed-directory.mjs            apply
//   node scripts/demo/seed-directory.mjs --dry      say what would change, write nothing
//
// What it does, and only to rows whose name starts with "[TEST]":
//   • the two test agents: photo, introduction, languages, areas, focus (and a public profile for
//     the one that had none);
//   • the three test repair providers: photo, introduction, languages;
//   • eight test professional providers, two per category (listing photography, insurance broker,
//     paralegal, lawyer): the provider record, its verified credentials, photo, introduction,
//     languages. A provider record belongs to an account (service_providers.auth_id is NOT NULL),
//     so each gets a test account of its own — `pro-…-test@stayloop.ai`, user_metadata
//     test_account = true, NO password (nobody signs in as them; a test run can mint a link).
// It is idempotent: a second run updates in place. Photos are drawn by scripts/demo/avatars.mjs,
// rasterised here with headless Chrome (CHROME=/path/to/chrome to override) and stored under a
// content-hashed key, so a changed drawing gets a new URL.
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local; prints no secret.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { AVATARS, avatarSvg } from './avatars.mjs'

const DRY = process.argv.includes('--dry')
const env = Object.fromEntries(readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const isTest = (name) => /^\s*\[\s*test\s*\]/i.test(String(name || ''))
const log = (...a) => console.log(DRY ? '[dry]' : '     ', ...a)

// ───────────────────────────────────────────────────────────── the content

const AGENTS = [
  {
    legal_name: '[TEST] Agent Person', avatar: 'agent-person', show_activity: true,
    languages: ['zh', 'yue', 'en'], service_areas: ['North York', 'Markham', 'Richmond Hill', 'Scarborough'], focus: ['tenant_rep', 'landlord_rep', 'condo', 'newcomers'],
    bio: '[TEST] 测试经纪主页。专做多伦多北部的租赁：帮租客找房、帮房东出租。\n\n找房的客户，我会先问清预算、通勤和入住时间，再约看房，不让你白跑；出租的房东，我负责挂牌、筛选申请人和签约前的核对。\n\n刚来加拿大、还没有本地信用记录的租客也可以找我，我会告诉你可以准备哪些材料。平时用普通话、粤语和英语沟通，一般当天回复。',
  },
  {
    legal_name: '[TEST] Muse Agent', avatar: 'agent-muse', show_activity: false, publish: true,
    languages: ['en', 'zh'], service_areas: ['Downtown Toronto', 'Etobicoke', 'Mississauga'], focus: ['tenant_rep', 'condo', 'students'],
    bio: '[TEST] 测试经纪主页。主要在多伦多市中心和西区做公寓租赁，学生和刚工作的年轻人找我比较多。\n\n我会按你的预算和学校、公司的位置先筛一轮再带看；合同里看不懂的条款，签之前都可以问我。\n\n英语和普通话都可以，晚上和周末也回消息。',
  },
]

const REPAIR = [
  {
    legal_name: '[TEST] Northline Home Services Inc.', avatar: 'repair-northline', languages: ['en', 'zh'],
    bio: '[TEST] 测试服务商资料。Northline 是一支四个人的上门维修队，水管、电气、门锁和日常杂活都接，主要跑多伦多、密西沙加和旺市。\n\n接到报修后先看照片、问清情况，再给上门时间；到场先报价，房东同意了才动工，做完拍照留底。紧急的漏水和断电尽量当天到。\n\n普通话、英语都可以沟通。',
  },
  {
    legal_name: '[TEST] Muse Home Services Inc.', avatar: 'repair-muse', languages: ['en', 'yue', 'zh'],
    bio: '[TEST] 测试服务商资料。Muse Home Services 做住宅的小修小补：换龙头、修插座、装门锁、补墙，还有退租前的清洁，零碎的活一次做完。\n\n适合手上有几套出租房、不想每样活都另找人的房东。按工时计费，上门前会说清大概要多久。\n\n英语、粤语、普通话都有人接。',
  },
  {
    legal_name: '[TEST] Maple Plumbing Inc.', avatar: 'repair-maple', languages: ['en'],
    bio: '[TEST] 测试服务商资料。Maple Plumbing 只做水管：漏水、堵塞、换热水器、厨卫改管，持 Skilled Trades Ontario 的水管工资格证。\n\n公寓和独立屋都做。上门先查原因、当场报价；需要关总阀或者动到公共管道的，会先和物业确认。\n\n英语沟通，周末可以预约。',
  },
]

const exp = (d) => d
const PROFESSIONAL = [
  {
    email: 'pro-lumen-test@stayloop.ai', legal_name: '[TEST] Lumen Listing Photography Inc.', trade_name: '[TEST] Lumen Listing Photography', contact_name: '[TEST] Noor', phone: '416-555-0131',
    trades: ['photographer_floorplan'], cities: ['Toronto', 'North York', 'Markham', 'Richmond Hill'], languages: ['en', 'zh'], avatar: 'photo-a',
    creds: [['business_registration', 'TEST-BN-0131', null], ['liability_insurance', 'TEST-CGL-0131', exp('2027-08-31')]],
    bio: '[TEST] 测试服务商资料。Lumen 专拍出租房源：广角室内、外立面和小区配套，修好的图第二天交付，也可以加拍一段走房短视频。\n\n拍之前会发一张准备清单（开灯、收台面、拉开窗帘），空房和有人住的房子都能拍。按套报价，拍之前说清楚包含几张图。\n\n英语、普通话都可以。',
  },
  {
    email: 'pro-brightframe-test@stayloop.ai', legal_name: '[TEST] Brightframe Floor Plans Ltd.', trade_name: '[TEST] Brightframe Floor Plans', contact_name: '[TEST] Camille', phone: '416-555-0132',
    trades: ['photographer_floorplan'], cities: ['Toronto', 'Mississauga', 'Oakville', 'Etobicoke'], languages: ['en', 'fr'], avatar: 'photo-b',
    creds: [['business_registration', 'TEST-BN-0132', null], ['liability_insurance', 'TEST-CGL-0132', exp('2027-05-31')]],
    bio: '[TEST] 测试服务商资料。Brightframe 做户型图采集：上门用激光测距量房，出带尺寸的平面图，房源页面上一眼能看清每个房间多大。\n\n一套两居室大约一小时量完，可以和照片一起约。图上的面积是测量值，仅供参考，不替代官方文件。\n\n英语、法语都可以。',
  },
  {
    email: 'pro-harbourline-test@stayloop.ai', legal_name: '[TEST] Harbourline Insurance Brokers Inc.', trade_name: '[TEST] Harbourline Insurance Brokers', contact_name: '[TEST] Mei', phone: '416-555-0133',
    trades: ['insurance_broker'], cities: ['Toronto', 'Scarborough', 'Markham', 'North York'], languages: ['en', 'zh', 'yue'], avatar: 'insure-a',
    creds: [['ribo_licence', 'TEST-RIBO-0133', exp('2027-09-30')]],
    bio: '[TEST] 测试服务商资料。Harbourline 是持牌保险经纪，做租客险、房东险和空置期间的房屋险。\n\n先了解房子和你的情况，再把几家保险公司的方案放在一起给你比，讲清楚各自保什么、不保什么。保费以保险公司的正式报价为准。\n\n普通话、粤语、英语都可以，第一次联系请先别发证件号码。',
  },
  {
    email: 'pro-cedarpine-test@stayloop.ai', legal_name: '[TEST] Cedar & Pine Insurance Ltd.', trade_name: '[TEST] Cedar & Pine Insurance', contact_name: '[TEST] Gordon', phone: '416-555-0134',
    trades: ['insurance_broker'], cities: ['Mississauga', 'Brampton', 'Oakville', 'Burlington'], languages: ['en', 'hi', 'pa'], avatar: 'insure-b',
    creds: [['ribo_licence', 'TEST-RIBO-0134', exp('2027-06-30')]],
    bio: '[TEST] 测试服务商资料。Cedar & Pine 主要服务密西沙加和皮尔区的房东：出租屋的房屋险、责任险，以及多套房一起投保的方案。\n\n租约里要求租客买租客险的，我们也可以帮租客办。电话里先问清楚情况，再出书面的方案对比。\n\n英语、印地语、旁遮普语都可以。',
  },
  {
    email: 'pro-bluejay-test@stayloop.ai', legal_name: '[TEST] Bluejay Paralegal Services', trade_name: null, contact_name: '[TEST] Priya', phone: '416-555-0135',
    trades: ['paralegal'], cities: ['Toronto', 'North York', 'Scarborough', 'Markham'], languages: ['en', 'zh', 'hi'], avatar: 'para-a',
    creds: [['lso_paralegal', 'TEST-P-0135', exp('2027-12-31')]],
    bio: '[TEST] 测试服务商资料。持牌 Paralegal，专做住宅租务：代表房东或租客处理房东与租客委员会的申请、调解和听证。\n\n第一次联系请先说是哪一类事、有没有收到通知或者听证日期。我们会先约一次咨询，了解情况后再书面说明服务范围和收费方式。\n\n英语、普通话、印地语都可以。',
  },
  {
    email: 'pro-tamarack-test@stayloop.ai', legal_name: '[TEST] Tamarack Tenancy Paralegals', trade_name: null, contact_name: '[TEST] Kwame', phone: '416-555-0136',
    trades: ['paralegal'], cities: ['Toronto', 'Etobicoke', 'Mississauga', 'Brampton'], languages: ['en', 'fr'], avatar: 'para-b',
    creds: [['lso_paralegal', 'TEST-P-0136', exp('2027-12-31')]],
    bio: '[TEST] 测试服务商资料。Tamarack 是两位持牌 Paralegal 合办的事务所，只做房东与租客之间的事：欠租、维修争议、终止租约和押金。\n\n房东和租客的案子都接，同一件事只代表一方。来之前把租约、往来消息和收到的通知整理好，咨询会快很多。\n\n英语、法语都可以。',
  },
  {
    email: 'pro-linden-test@stayloop.ai', legal_name: '[TEST] Linden Law Professional Corporation', trade_name: '[TEST] Linden Law', contact_name: '[TEST] Eleanor', phone: '416-555-0137',
    trades: ['lawyer'], cities: ['Toronto', 'North York', 'Vaughan', 'Richmond Hill'], languages: ['en', 'fr'], avatar: 'law-a',
    creds: [['lso_lawyer', 'TEST-L-0137', exp('2027-12-31')]],
    bio: '[TEST] 测试服务商资料。Linden Law 做住宅房产相关的法律服务：租约的审阅与起草、租务纠纷、房屋买卖过户。\n\n我们不在消息里给法律意见。先安排一次咨询，确认没有利益冲突之后，再出书面的委托范围和收费方式。\n\n英语、法语都可以。',
  },
  {
    email: 'pro-oseipark-test@stayloop.ai', legal_name: '[TEST] Osei Park LLP', trade_name: null, contact_name: '[TEST] Jisoo', phone: '416-555-0138',
    trades: ['lawyer'], cities: ['Toronto', 'Mississauga', 'Markham', 'Scarborough'], languages: ['en', 'ko', 'zh'], avatar: 'law-b',
    creds: [['lso_lawyer', 'TEST-L-0138', exp('2027-12-31')]],
    bio: '[TEST] 测试服务商资料。Osei Park 是一家小型律师事务所，服务房东、租客和小型物业管理公司：合同、纠纷，以及出租房买卖时带租约过户的安排。\n\n第一次联系请只说事情的大概和有没有期限，证件和合同等确认委托之后再发。\n\n英语、韩语、普通话都可以。',
  },
]

// ───────────────────────────────────────────────────────────── drawing → WebP

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
async function rasterise(ids) {
  const dir = mkdtempSync(join(tmpdir(), 'stayloop-avatars-'))
  const port = 9441
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  const out = {}
  try {
    let info
    for (let i = 0; i < 40; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break } catch { await sleep(250) } }
    if (!info) throw new Error('chrome did not start')
    const ws = new WebSocket(info.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let n = 0; const pending = new Map()
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result) } })
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++n; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })) })
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width: 512, height: 512, deviceScaleFactor: 1, mobile: false }, sessionId)
    for (const id of ids) {
      const html = `<!doctype html><style>html,body{margin:0;background:#fff}svg{display:block}</style>${avatarSvg(AVATARS[id])}`
      await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) }, sessionId)
      await sleep(350)
      const r = await send('Page.captureScreenshot', { format: 'webp', quality: 92, clip: { x: 0, y: 0, width: 512, height: 512, scale: 1 } }, sessionId)
      out[id] = Buffer.from(r.data, 'base64')
    }
    ws.close()
  } finally {
    proc.kill('SIGTERM'); await sleep(500); rmSync(dir, { recursive: true, force: true })
  }
  return out
}

/** Store the picture under <folder>/demo<hash>.webp (a new drawing → a new key) and drop the previous demo file. */
async function putPhoto(bucket, folder, bytes, currentKey) {
  const key = `${folder}/demo${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.webp`
  if (currentKey === key) return key
  if (DRY) return key
  const { error } = await admin.storage.from(bucket).upload(key, bytes, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
  if (error) throw new Error(`upload ${bucket}/${key}: ${error.message}`)
  if (currentKey && currentKey.startsWith(`${folder}/demo`)) await admin.storage.from(bucket).remove([currentKey]).catch(() => undefined)
  return key
}

// ───────────────────────────────────────────────────────────── accounts

async function allUsers() {
  const users = []
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error('list users: ' + error.message)
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
}

async function ensureTestAccount(users, email, name) {
  if (!/^pro-[a-z]+-test@stayloop\.ai$/.test(email)) throw new Error('not a demo provider address: ' + email)
  const found = users.find((u) => (u.email || '').toLowerCase() === email)
  if (found) return found.id
  log('create test account', email)
  if (DRY) return null
  // No password: nobody signs in as these; a test run mints a one-time link with the service role.
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { test_account: true, demo_provider: true, full_name: name } })
  if (error || !data?.user) throw new Error(`create ${email}: ${error?.message}`)
  return data.user.id
}

// ───────────────────────────────────────────────────────────── run

const photos = await rasterise(Object.keys(AVATARS))
console.log(`drawn ${Object.keys(photos).length} avatars, ${Math.round(Object.values(photos).reduce((s, b) => s + b.length, 0) / 1024)} KB in all`)

console.log('agents')
for (const a of AGENTS) {
  const { data: row, error } = await admin.from('agent_profiles').select('auth_id, legal_name, status, public_profile, profile_slug, photo_key').eq('legal_name', a.legal_name).maybeSingle()
  if (error || !row) { console.log('  missing:', a.legal_name, error?.message || ''); continue }
  if (!isTest(row.legal_name)) throw new Error('refusing a non-test agent row')
  const photo_key = await putPhoto('agent-photos', row.auth_id, photos[a.avatar], row.photo_key)
  const patch = { bio: a.bio, languages: a.languages, service_areas: a.service_areas, focus: a.focus, show_activity: a.show_activity, photo_key }
  if (a.publish && !row.public_profile) Object.assign(patch, { public_profile: true, profile_slug: row.profile_slug || `test-muse-agent-${row.auth_id.slice(0, 4)}` })
  log(a.legal_name, '→', Object.keys(patch).join(', '))
  if (!DRY) { const { error: e } = await admin.from('agent_profiles').update(patch).eq('auth_id', row.auth_id); if (e) throw new Error(`${a.legal_name}: ${e.message}`) }
}

console.log('repair providers')
for (const p of REPAIR) {
  const { data: row, error } = await admin.from('service_providers').select('id, legal_name, photo_key').eq('legal_name', p.legal_name).maybeSingle()
  if (error || !row) { console.log('  missing:', p.legal_name, error?.message || ''); continue }
  if (!isTest(row.legal_name)) throw new Error('refusing a non-test provider row')
  const photo_key = await putPhoto('provider-photos', row.id, photos[p.avatar], row.photo_key)
  log(p.legal_name, '→ bio, languages, photo')
  if (!DRY) { const { error: e } = await admin.from('service_providers').update({ bio: p.bio, languages: p.languages, photo_key }).eq('id', row.id); if (e) throw new Error(`${p.legal_name}: ${e.message}`) }
}

console.log('professional providers')
const users = await allUsers()
const now = new Date().toISOString()
for (const p of PROFESSIONAL) {
  if (!isTest(p.legal_name)) throw new Error('seed rows must be named [TEST] …')
  const uid = await ensureTestAccount(users, p.email, p.trade_name || p.legal_name)
  const facts = { legal_name: p.legal_name, trade_name: p.trade_name, business_number: `TEST-${p.phone.slice(-4)}`, service_cities: p.cities, trades: p.trades, pricing_mode: 'fixed', call_out_fee: null, hourly_rate: null, contact_name: p.contact_name, contact_email: p.email, contact_phone: p.phone, website: null, bio: p.bio, languages: p.languages }
  if (DRY && !uid) { log(p.legal_name, '→ new record,', p.creds.length, 'credential(s), photo'); continue }
  const { data: existing } = await admin.from('service_providers').select('id, legal_name, status, verified_at, photo_key').eq('auth_id', uid).maybeSingle()
  if (existing && !isTest(existing.legal_name)) throw new Error('refusing a non-test provider row')
  let id = existing?.id
  if (!id) {
    log(p.legal_name, '→ new record')
    if (DRY) continue
    const { data: ins, error } = await admin.from('service_providers').insert({ auth_id: uid, ...facts, status: 'verified', verified_at: now, attested_at: now }).select('id').single()
    if (error || !ins) throw new Error(`${p.legal_name}: ${error?.message}`)
    id = ins.id
  } else {
    log(p.legal_name, '→ update')
    if (!DRY) { const { error } = await admin.from('service_providers').update({ ...facts, status: 'verified', verified_at: existing.verified_at || now }).eq('id', id); if (error) throw new Error(`${p.legal_name}: ${error.message}`) }
  }
  const { data: have } = await admin.from('provider_credentials').select('kind').eq('provider_id', id)
  const kinds = new Set((have ?? []).map((c) => c.kind))
  for (const [kind, number, expires_at] of p.creds) {
    if (kinds.has(kind)) continue
    log('   credential', kind)
    if (!DRY) { const { error } = await admin.from('provider_credentials').insert({ provider_id: id, kind, number, expires_at, verified_at: now, note: 'seeded test credential' }); if (error) throw new Error(`${p.legal_name} ${kind}: ${error.message}`) }
  }
  const photo_key = await putPhoto('provider-photos', id, photos[p.avatar], existing?.photo_key ?? null)
  if (!DRY && photo_key !== (existing?.photo_key ?? null)) { const { error } = await admin.from('service_providers').update({ photo_key }).eq('id', id); if (error) throw new Error(`${p.legal_name} photo: ${error.message}`) }
}
console.log(DRY ? 'dry run: nothing written' : 'done')
