#!/usr/bin/env node
// OpenNext copies every .env* file it finds — .env.local with the production
// service-role and Stripe LIVE keys included — into the worker bundle
// (.open-next/cloudflare/next-env.mjs). Server secrets belong in Worker
// secrets only (`wrangler secret put`); the bundle may carry NEXT_PUBLIC_*
// and nothing else (migration 2026-10-19).
//
// 1. Rewrite next-env.mjs keeping only NEXT_PUBLIC_* keys.
// 2. Scan everything under .open-next for any non-public value from the local
//    env files. A hit fails the ship (exit 1). Only key names are printed.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, '.open-next')
const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local']

function parseEnv(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

if (!existsSync(OUT)) { console.error('env-guard: .open-next missing — build first'); process.exit(1) }

// 1. Strip next-env.mjs down to NEXT_PUBLIC_*.
const envMod = join(OUT, 'cloudflare', 'next-env.mjs')
if (existsSync(envMod)) {
  const src = readFileSync(envMod, 'utf8')
  const rewritten = src.replace(/^export const (\w+) = (\{.*\});$/gm, (_, mode, json) => {
    const obj = JSON.parse(json)
    const kept = Object.fromEntries(Object.entries(obj).filter(([k]) => k.startsWith('NEXT_PUBLIC_')))
    return `export const ${mode} = ${JSON.stringify(kept)};`
  })
  writeFileSync(envMod, rewritten)
}

// 2. No private value may appear anywhere in the output.
const secrets = []
for (const f of ENV_FILES) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const [k, v] of Object.entries(parseEnv(readFileSync(p, 'utf8')))) {
    if (k.startsWith('NEXT_PUBLIC_')) continue
    if (v.length < 12) continue // short values (modes, flags) are not credentials and would false-positive
    secrets.push({ key: k, buf: Buffer.from(v) })
  }
}

const hits = new Map()
function scan(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { scan(p); continue }
    if (!e.isFile() || statSync(p).size === 0) continue
    const data = readFileSync(p)
    for (const s of secrets) {
      if (data.indexOf(s.buf) !== -1) {
        const list = hits.get(s.key) ?? []
        list.push(p.slice(ROOT.length + 1))
        hits.set(s.key, list)
      }
    }
  }
}
scan(OUT)

if (hits.size) {
  console.error('env-guard: PRIVATE ENV VALUES FOUND IN THE BUNDLE (key names only):')
  for (const [k, files] of hits) console.error(`  ${k}: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` (+${files.length - 3})` : ''}`)
  process.exit(1)
}
console.log(`env-guard OK — next-env.mjs holds NEXT_PUBLIC_* only; ${secrets.length} private values checked, none in .open-next`)
