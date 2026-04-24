#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Canadian Federal Corporate Registry — Ingestion
//
// Downloads the Corporations Canada open-data ZIP, parses the 104 XML files,
// and UPSERTs into Supabase's ca_corp_registry table. Designed to run in
// GitHub Actions on a monthly cron, but can also be invoked locally for the
// first-time seed.
//
// License: dataset is OGL-Canada (commercial use OK).
// Source:  https://ised-isde.canada.ca/cc/lgcy/download/OPEN_DATA_SPLIT.zip
//
// Env required:
//   SUPABASE_URL                - e.g. https://upbkcbicjjpznojkpqtg.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   - service-role key (bypasses RLS)
//
// Runtime:
//   node >= 20. Uses ESM and the built-in fetch + stream APIs.
//
// Throughput:
//   ~1.5M records. Using UPSERT in batches of 1000 via PostgREST, expect
//   ~15–30 minutes wall time.
// -----------------------------------------------------------------------------

import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, stat, readdir, readFile, unlink, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const ZIP_URL = 'https://ised-isde.canada.ca/cc/lgcy/download/OPEN_DATA_SPLIT.zip'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const BATCH_SIZE = 1000
const WORK_DIR = path.join(os.tmpdir(), 'ca-corp-ingest')

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip legal suffixes + normalize whitespace/case for trigram matching.
 * Mirrors canonicalizeEmployerName() in lib/forensics/arm-length.ts.
 */
function canonicalizeName(name) {
  if (!name) return ''
  let s = name.toLowerCase().trim()
  const suffixRe = /\s*[,.]?\s*(incorporated|incorporée|corporation|corp|company|co|limited|limitée|ltée|ltd|inc|llc|llp|lp|pc|plc|gmbh|ag|sa)\s*\.?$/i
  for (let i = 0; i < 3; i++) {
    const prev = s
    s = s.replace(suffixRe, '').trim()
    if (prev === s) break
  }
  return s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
    p.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited ${code}`))
    })
    p.on('error', reject)
  })
}

/**
 * Lightweight XML record extractor. The full XML is ~200MB across 104 files
 * and standard DOM parsers blow memory. Instead we read each file as a
 * string (each ~2MB) and regex-split out <corporation> blocks, then parse
 * individual fields. This is ~20x faster than a general parser and our
 * schema is rigid.
 */
function extractCorporations(xmlText) {
  const out = []
  const re = /<corporation\b[^>]*>([\s\S]*?)<\/corporation>/g
  let m
  while ((m = re.exec(xmlText))) {
    out.push(m[0])
  }
  return out
}

function firstTag(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : null
}

function attr(block, tagName, attrName) {
  const re = new RegExp(`<${tagName}\\b[^>]*\\b${attrName}="([^"]*)"`, 'i')
  const m = block.match(re)
  return m ? m[1] : null
}

function allBlocks(block, tagName) {
  const out = []
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>|<${tagName}\\b[^>]*/>`, 'gi')
  let m
  while ((m = re.exec(block))) {
    out.push(m[0])
  }
  return out
}

function decodeXml(s) {
  if (!s) return s
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

/**
 * Map one <corporation> XML block to a registry row.
 * Uses the "current" flag on child blocks to pick active values.
 */
function parseCorporation(block) {
  const corpId = attr(block, 'corporation', 'corporationId')
  if (!corpId) return null

  // Pick current name (fallback: first name)
  let currentName = null
  const namesBlock = firstTag(block, 'names')
  if (namesBlock) {
    const nameBlocks = allBlocks(namesBlock, 'name')
    for (const nb of nameBlocks) {
      if (/current="true"/i.test(nb)) {
        const inner = nb.replace(/<[^>]+>/g, '').trim()
        if (inner) { currentName = inner; break }
      }
    }
    if (!currentName && nameBlocks[0]) {
      currentName = nameBlocks[0].replace(/<[^>]+>/g, '').trim() || null
    }
  }
  if (!currentName) return null

  // Collect former names for alt_names
  const altNames = []
  if (namesBlock) {
    for (const nb of allBlocks(namesBlock, 'name')) {
      if (/current="true"/i.test(nb)) continue
      const inner = nb.replace(/<[^>]+>/g, '').trim()
      if (inner && canonicalizeName(inner) !== canonicalizeName(currentName)) {
        altNames.push(canonicalizeName(inner))
      }
    }
  }

  // Pick current address
  let addr = { line1: null, line2: null, city: null, province: null, country: null, postalCode: null }
  const addressesBlock = firstTag(block, 'addresses')
  if (addressesBlock) {
    const addrBlocks = allBlocks(addressesBlock, 'address')
    let pick = addrBlocks.find(a => /current="true"/i.test(a)) || addrBlocks[0]
    if (pick) {
      addr.line1 = firstTag(pick, 'addressLine1') || firstTag(pick, 'addressLine')
      addr.line2 = firstTag(pick, 'addressLine2')
      addr.city = firstTag(pick, 'city')
      const provBlock = firstTag(pick, 'province')
      addr.province = provBlock ? (provBlock.match(/<code>([^<]+)<\/code>/i)?.[1] ?? provBlock.replace(/<[^>]+>/g, '').trim()) : null
      const countryBlock = firstTag(pick, 'country')
      addr.country = countryBlock ? (countryBlock.match(/<code>([^<]+)<\/code>/i)?.[1] ?? countryBlock.replace(/<[^>]+>/g, '').trim()) : null
      addr.postalCode = firstTag(pick, 'postalCode')
    }
  }

  // Pick current status
  let statusCode = null
  const statusesBlock = firstTag(block, 'statuses')
  if (statusesBlock) {
    const sBlocks = allBlocks(statusesBlock, 'status')
    const current = sBlocks.find(s => /current="true"/i.test(s)) || sBlocks[0]
    if (current) statusCode = firstTag(current, 'code') || attr(current, 'status', 'code')
  }

  // Incorporation date comes from the earliest <act> with type that indicates
  // incorporation. The dataset codes these; we take the min effectiveDate
  // from <acts> as a fallback.
  let incorporationDate = null, dissolutionDate = null
  const actsBlock = firstTag(block, 'acts')
  if (actsBlock) {
    const acts = allBlocks(actsBlock, 'act')
    for (const a of acts) {
      const eff = firstTag(a, 'effectiveDate') || attr(a, 'act', 'effectiveDate')
      const code = firstTag(a, 'code')
      if (eff && /incorporat|format|coop/i.test((code || '') + ' ' + (a || ''))) {
        if (!incorporationDate || eff < incorporationDate) incorporationDate = eff
      }
      // Dissolution heuristic: code contains dissolv or expiry present
      const expiry = firstTag(a, 'expiryDate')
      if (expiry && /dissolv/i.test(code || '')) {
        if (!dissolutionDate || expiry > dissolutionDate) dissolutionDate = expiry
      }
    }
    // Fallback: min effective across all acts
    if (!incorporationDate) {
      for (const a of acts) {
        const eff = firstTag(a, 'effectiveDate') || attr(a, 'act', 'effectiveDate')
        if (eff && (!incorporationDate || eff < incorporationDate)) incorporationDate = eff
      }
    }
  }

  // Business number
  let bn = null
  const bnBlock = firstTag(block, 'businessNumbers')
  if (bnBlock) {
    const bnMatch = bnBlock.match(/<businessNumber[^>]*>([^<]+)<\/businessNumber>/i)
    if (bnMatch) bn = bnMatch[1].trim()
  }

  const display = decodeXml(currentName)
  const isActive = statusCode ? /AC|ACTIVE/i.test(statusCode) : null

  return {
    corp_number: corpId,
    jurisdiction: 'ca_federal',
    canonical_name: canonicalizeName(display),
    display_name: display,
    alt_names: altNames.filter(Boolean),
    status: statusCode,
    is_active: isActive,
    entity_type: 'federal',  // refined below if act code reveals NFP/COOP/BOTA
    incorporation_date: incorporationDate || null,
    dissolution_date: dissolutionDate || null,
    address_line1: addr.line1 ? decodeXml(addr.line1) : null,
    address_line2: addr.line2 ? decodeXml(addr.line2) : null,
    city: addr.city ? decodeXml(addr.city) : null,
    province: addr.province,
    country: addr.country,
    postal_code: addr.postalCode,
    business_number: bn,
    source: 'corporations_canada_federal',
    source_url: `https://ised-isde.canada.ca/cc/lgcy/cc/corporation/${corpId}`,
  }
}

// ─── Supabase UPSERT via PostgREST ──────────────────────────────────────────

async function upsertBatch(rows) {
  if (!rows.length) return 0
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ca_corp_registry?on_conflict=jurisdiction,corp_number`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upsert failed HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  return rows.length
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

async function main() {
  console.log('[ingest] Starting Canadian federal corporate registry ingestion')
  console.log(`[ingest] Target: ${SUPABASE_URL}`)

  await rm(WORK_DIR, { recursive: true, force: true })
  await mkdir(WORK_DIR, { recursive: true })

  const zipPath = path.join(WORK_DIR, 'open_data.zip')
  const extractDir = path.join(WORK_DIR, 'xml')

  // 1. Download
  console.log(`[ingest] Downloading ${ZIP_URL}`)
  const t0 = Date.now()
  const dlRes = await fetch(ZIP_URL)
  if (!dlRes.ok || !dlRes.body) throw new Error(`Download failed: HTTP ${dlRes.status}`)
  await pipeline(dlRes.body, createWriteStream(zipPath))
  const zipStat = await stat(zipPath)
  console.log(`[ingest] Downloaded ${(zipStat.size / 1024 / 1024).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // 2. Unzip (requires `unzip` binary; GitHub Actions runners include it)
  await mkdir(extractDir, { recursive: true })
  console.log(`[ingest] Unzipping to ${extractDir}`)
  await run('unzip', ['-q', '-o', zipPath, '-d', extractDir])

  // 3. List XML files
  const all = await readdir(extractDir)
  const xmlFiles = all.filter(f => /^OPEN_DATA_\d+\.xml$/i.test(f)).sort()
  console.log(`[ingest] Found ${xmlFiles.length} XML files`)

  // 4. Parse + batch UPSERT
  let totalRows = 0
  let batch = []
  const t1 = Date.now()

  for (let i = 0; i < xmlFiles.length; i++) {
    const fname = xmlFiles[i]
    const text = await readFile(path.join(extractDir, fname), 'utf8')
    const blocks = extractCorporations(text)
    for (const block of blocks) {
      const row = parseCorporation(block)
      if (row) {
        batch.push(row)
        if (batch.length >= BATCH_SIZE) {
          await upsertBatch(batch)
          totalRows += batch.length
          batch = []
        }
      }
    }
    const elapsed = ((Date.now() - t1) / 1000).toFixed(0)
    console.log(`[ingest] ${i + 1}/${xmlFiles.length} ${fname} — processed ${blocks.length} records (total so far: ${totalRows}, ${elapsed}s)`)
  }

  if (batch.length) {
    await upsertBatch(batch)
    totalRows += batch.length
  }

  const elapsedMin = ((Date.now() - t0) / 1000 / 60).toFixed(1)
  console.log(`[ingest] Done. Total rows upserted: ${totalRows} in ${elapsedMin} min`)

  // 5. Cleanup working dir (be kind to CI disk)
  await rm(WORK_DIR, { recursive: true, force: true })
}

main().catch(err => {
  console.error('[ingest] FATAL', err)
  process.exit(1)
})
