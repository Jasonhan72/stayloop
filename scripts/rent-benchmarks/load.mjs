#!/usr/bin/env node
// Loads rent benchmarks into public.rent_benchmarks (service role).
//   node load.mjs cmhc cmhc-toronto-2025.json     ← rows produced by cmhc_to_json.py
//   node load.mjs statcan                          ← fetches StatCan table 46-10-0092-01 (Toronto CMA asking rents)
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (read from .env.local when present).
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('missing Supabase env'); process.exit(1) }

async function upsert(rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const r = await fetch(`${URL_}/rest/v1/rent_benchmarks?on_conflict=source,kind,period,area_key,bedrooms`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 200)),
    })
    if (!r.ok) { console.error('upsert failed', r.status, await r.text()); process.exit(1) }
  }
  console.log(`upserted ${rows.length} rows`)
}

const [mode, file] = process.argv.slice(2)
if (mode === 'cmhc') {
  await upsert(JSON.parse(readFileSync(file, 'utf8')))
} else if (mode === 'statcan') {
  // Statistics Canada Web Data Service: full-table CSV (open licence: https://www.statcan.gc.ca/en/reference/licence)
  const meta = await (await fetch('https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/46100092/en')).json()
  const zip = Buffer.from(await (await fetch(meta.object)).arrayBuffer())
  const dir = mkdtempSync(join(tmpdir(), 'statcan-'))
  writeFileSync(join(dir, 't.zip'), zip)
  execFileSync('unzip', ['-o', '-q', join(dir, 't.zip'), '-d', dir])
  const csv = readFileSync(join(dir, '46100092.csv'), 'utf8').replace(/^﻿/, '')
  const lines = csv.split('\n').filter(Boolean)
  const head = lines[0].split(',').map((h) => h.replace(/^"|"$/g, ''))
  const col = (name) => head.indexOf(name)
  const parse = (line) => { const out = []; let cur = ''; let q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch } out.push(cur); return out }
  const BED = { 'Apartment - No bedroom': 0, 'Apartment - 1 bedroom': 1, 'Apartment - 2 bedrooms': 2, 'Apartment - 3 or more bedrooms': 3 }
  const rows = []
  for (const line of lines.slice(1)) {
    const c = parse(line)
    if (!c[col('GEO')].startsWith('Toronto')) continue
    const est = c[col('Estimates')]
    if (!/average asking rent/i.test(est)) continue
    const bed = BED[c[col('Rental unit type')]]
    if (bed == null) continue
    const v = Number(c[col('VALUE')]); if (!Number.isFinite(v) || v <= 0) continue
    rows.push({ source: 'statcan', kind: 'asking', period: c[col('REF_DATE')], area: 'Toronto CMA', area_key: 'toronto cma', bedrooms: bed, avg_rent: v, prev_avg: null, quality: c[col('STATUS')] || null,
      note: 'Source: Statistics Canada, Table 46-10-0092-01 Average asking rent price in select Census Metropolitan Areas by rental unit type' })
  }
  // prev_avg = same quarter one year earlier
  const byKey = new Map(rows.map((r) => [`${r.bedrooms}|${r.period}`, r.avg_rent]))
  for (const r of rows) { const [y, m] = r.period.split('-'); r.prev_avg = byKey.get(`${r.bedrooms}|${Number(y) - 1}-${m}`) ?? null }
  console.log('statcan periods', [...new Set(rows.map((r) => r.period))].sort().join(' '))
  await upsert(rows)
} else { console.error('usage: load.mjs cmhc <json> | statcan'); process.exit(1) }
