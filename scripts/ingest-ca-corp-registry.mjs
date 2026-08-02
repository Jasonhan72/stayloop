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
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const ZIP_URL = 'https://ised-isde.canada.ca/cc/lgcy/download/OPEN_DATA_SPLIT.zip'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 500)
const WORK_DIR = process.env.WORK_DIR || path.join(os.tmpdir(), 'ca-corp-ingest')
const RETRY_ATTEMPTS = 4

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
 * List entries inside a ZIP using `unzip -l`. Returns array of file names.
 */
function listZipEntries(zipPath) {
  const { stdout } = spawnSync('unzip', ['-Z', '-1', zipPath], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  return stdout.split('\n').map(s => s.trim()).filter(Boolean)
}

/**
 * Extract ONE file from a ZIP to stdout (memory buffer). Avoids materializing
 * all files on disk — keeps peak disk footprint to just the ZIP itself.
 */
function extractOneToString(zipPath, entryName) {
  const { stdout, status, stderr } = spawnSync('unzip', ['-p', zipPath, entryName], {
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,  // Each XML file is ~2MB, this is plenty
  })
  if (status !== 0) throw new Error(`unzip -p ${entryName} exited ${status}: ${stderr?.toString().slice(0, 200)}`)
  return stdout
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
  // Corporations Canada uses numeric status enums, not text. Observed codes
  // in the April 2026 dataset:
  //   "1"  → Active
  //   "9"  → Liquidating
  //   "10" → Revoked / Suspended
  //   "11" → Dissolved
  //   null → No status data (many historical records pre-date electronic status tracking)
  // Text fallback ("AC"/"ACTIVE") kept in case the schema shifts back.
  const isActive = statusCode
    ? (statusCode === '1' || /^(AC|ACTIVE)$/i.test(statusCode) ? true : false)
    : null

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

async function upsertBatchOnce(rows) {
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
    const err = new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`)
    err.status = res.status
    err.body = text
    throw err
  }
}

async function upsertBatch(rows) {
  if (!rows.length) return 0
  let lastErr
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await upsertBatchOnce(rows)
      return rows.length
    } catch (e) {
      lastErr = e
      // Non-retryable: schema violation (400) or bad auth (401/403) — fail fast
      if (e.status === 400 || e.status === 401 || e.status === 403) {
        console.error(`[ingest] Non-retryable upsert error (${e.status}). First bad row:`, JSON.stringify(rows[0]).slice(0, 400))
        throw e
      }
      // Retryable: 5xx, network timeout, etc.
      const backoffMs = 2000 * attempt * attempt
      console.warn(`[ingest] upsert attempt ${attempt}/${RETRY_ATTEMPTS} failed: ${e.message.slice(0, 200)} — retry in ${backoffMs}ms`)
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }
  // All retries exhausted — split batch in half as a last resort (maybe one
  // bad row is blocking a big batch). If batch is already size 1, give up.
  if (rows.length > 1) {
    const mid = Math.floor(rows.length / 2)
    console.warn(`[ingest] splitting batch of ${rows.length} → ${mid} + ${rows.length - mid} after retries exhausted`)
    const a = await upsertBatch(rows.slice(0, mid))
    const b = await upsertBatch(rows.slice(mid))
    return a + b
  }
  console.error(`[ingest] Dropping 1 unrecoverable row after ${RETRY_ATTEMPTS} retries: ${JSON.stringify(rows[0]).slice(0, 400)}`)
  console.error(`[ingest] Last error: ${lastErr?.message}`)
  return 0
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

async function main() {
  console.log('[ingest] Starting Canadian federal corporate registry ingestion')
  console.log(`[ingest] Target: ${SUPABASE_URL}`)

  await rm(WORK_DIR, { recursive: true, force: true })
  await mkdir(WORK_DIR, { recursive: true })

  const zipPath = path.join(WORK_DIR, 'open_data.zip')

  // 1. Download
  console.log(`[ingest] Downloading ${ZIP_URL}`)
  const t0 = Date.now()
  const dlRes = await fetch(ZIP_URL)
  if (!dlRes.ok || !dlRes.body) throw new Error(`Download failed: HTTP ${dlRes.status}`)
  await pipeline(dlRes.body, createWriteStream(zipPath))
  const zipStat = await stat(zipPath)
  console.log(`[ingest] Downloaded ${(zipStat.size / 1024 / 1024).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // 2. List entries inside the ZIP (no bulk extraction — stream per-file next)
  const entries = listZipEntries(zipPath)
  const xmlFiles = entries.filter(f => /^OPEN_DATA_\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)/)?.[1] || 0)
      const nb = Number(b.match(/(\d+)/)?.[1] || 0)
      return na - nb
    })
  console.log(`[ingest] Found ${xmlFiles.length} XML entries inside ZIP`)

  // Optional resume: skip the first N files if RESUME_FROM=N is set. Useful
  // if a previous run crashed mid-flight and we want to continue.
  const resumeFrom = Number(process.env.RESUME_FROM || 0)
  if (resumeFrom > 0) {
    console.log(`[ingest] Resuming from file index ${resumeFrom}`)
  }

  // 3. Stream-parse: extract one XML entry → parse → batch upsert → discard.
  //    Peak disk footprint stays at ~200MB (ZIP only). Memory peaks at one
  //    uncompressed XML file (~20-30MB) + one batch (~500 rows).
  let totalRows = 0
  let batch = []
  const t1 = Date.now()

  for (let i = resumeFrom; i < xmlFiles.length; i++) {
    const fname = xmlFiles[i]
    let text
    try {
      text = extractOneToString(zipPath, fname)
    } catch (e) {
      console.warn(`[ingest] Failed to extract ${fname}: ${e.message} — skipping`)
      continue
    }
    const blocks = extractCorporations(text)
    text = null  // release ASAP
    for (const block of blocks) {
      const row = parseCorporation(block)
      if (row) {
        batch.push(row)
        if (batch.length >= BATCH_SIZE) {
          const n = await upsertBatch(batch)
          totalRows += n
          batch = []
        }
      }
    }
    const elapsed = ((Date.now() - t1) / 1000).toFixed(0)
    console.log(`[ingest] ${i + 1}/${xmlFiles.length} ${fname} — processed ${blocks.length} records (total so far: ${totalRows}, ${elapsed}s)`)
  }

  if (batch.length) {
    const n = await upsertBatch(batch)
    totalRows += n
  }

  const elapsedMin = ((Date.now() - t0) / 1000 / 60).toFixed(1)
  console.log(`[ingest] Done. Total rows upserted: ${totalRows} in ${elapsedMin} min`)

  // 5. Cleanup working dir (be kind to CI disk)
  if (process.env.KEEP_WORK_DIR !== '1') {
    await rm(WORK_DIR, { recursive: true, force: true })
  } else {
    console.log(`[ingest] KEEP_WORK_DIR=1 — leaving ${WORK_DIR} in place`)
  }
}

main().catch(err => {
  console.error('[ingest] FATAL', err)
  process.exit(1)
})
