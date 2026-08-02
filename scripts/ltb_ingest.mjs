#!/usr/bin/env node
// Ingest the Ontario LTB Order Catalogue into public.ltb_orders.
//
//   node scripts/ltb_ingest.mjs                 # incremental (default)
//   node scripts/ltb_ingest.mjs --full          # re-read every resource
//   node scripts/ltb_ingest.mjs --dry-run       # parse + report, write nothing
//
// Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// Run this monthly-ish: the LTB publishes new orders 2–3 months after issuance
// and is backfilling to 2021 in phases, so the dataset gains RESOURCES over
// time, not just rows. That is why the resource list is discovered from CKAN
// rather than hardcoded — a hardcoded 2026 resource id would quietly stop
// covering new years the moment the backfill lands.
//
// Data: Contains information licensed under the Open Government Licence – Ontario.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  addressParts, isSearchableName, nameKey, normalizeName, partySide,
  splitApplicationCodes, splitPartyNames, unwrapHyperlink,
} from '../lib/ltb/normalize.ts'

const CKAN = 'https://data.ontario.ca/api/3/action'
const DATASET = 'ltb-order-catalogue'
const BATCH = 1000

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')

function env(file = '.env.local') {
  return Object.fromEntries(
    readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
  )
}

// Column names carry both languages and, in one case, a stray double slash.
// Match on a distinctive fragment so a punctuation fix upstream does not
// silently blank a column.
const COL = {
  file: /^File Number/i,
  apps: /^Applications/i,
  appType: /^Application Type/i,
  address: /^Rental Unit Address\/(?!\/)/i,
  docType: /^Document Type/i,
  orderDate: /^Order Date/i,
  docId: /^Document ID/i,
  pdf: /^ContentDownload URL/i,
}

const ROLE_COL = [
  ['tenant', /^Tenant Name/i],
  ['former_tenant', /^Former Tenant Name/i],
  ['sub_tenant', /^Sub-Tenant Name/i],
  ['occupant', /^Occupant Names/i],
  ['coop_member', /^Co-op Member Name/i],
  ['landlord', /^Landlord Name/i],
  ['landlord_agent', /^Landlord Agent Name/i],
]

/** Minimal RFC4180 CSV parser — the data has quoted commas and embedded newlines. */
function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function pick(header, re) {
  const i = header.findIndex((h) => re.test(h.replace(/^﻿/, '')))
  return i
}

function explode(header, row) {
  const at = (re) => { const i = pick(header, re); return i >= 0 ? (row[i] || '').trim() : '' }
  const fileNumber = at(COL.file)
  const documentId = at(COL.docId)
  const orderDate = at(COL.orderDate)
  if (!fileNumber || !documentId || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) return []

  const applicationType = (at(COL.appType) || '').toUpperCase().slice(0, 4)
  const codes = splitApplicationCodes(at(COL.apps))
  const address = at(COL.address)
  const ap = addressParts(address)
  const pdf = unwrapHyperlink(at(COL.pdf))
  const documentType = at(COL.docType) || null

  const out = []
  const seen = new Set()
  for (const [role, re] of ROLE_COL) {
    const idx = pick(header, re)
    if (idx < 0) continue
    for (const raw of splitPartyNames(row[idx])) {
      const norm = normalizeName(raw)
      // Placeholders ("CURRENT TENANT") and single tokens are dropped at
      // ingest: they can only ever produce false positives downstream.
      if (!isSearchableName(norm)) continue
      const dedupe = `${role}|${norm}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      out.push({
        file_number: fileNumber,
        document_id: documentId,
        order_date: orderDate,
        application_codes: codes,
        application_type: applicationType || 'L',
        document_type: documentType,
        party_side: partySide(applicationType, role),
        role,
        person_name: raw.slice(0, 200),
        person_norm: norm,
        person_key: nameKey(raw),
        unit_address: address || null,
        address_postal: ap.postal,
        address_street_no: ap.streetNo,
        address_norm: ap.key,
        order_pdf_url: pdf,
      })
    }
  }
  return out
}

async function main() {
  const e = env()
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const meta = await (await fetch(`${CKAN}/package_show?id=${DATASET}`)).json()
  const resources = (meta.result?.resources || []).filter((r) => (r.format || '').toUpperCase() === 'CSV')
  if (!resources.length) throw new Error('no CSV resources on the dataset — did CKAN change?')
  console.log(`dataset has ${resources.length} CSV resource(s)`)

  let runId = null
  if (!DRY) {
    const { data } = await db.from('ltb_ingest_runs')
      .insert({ resource_id: resources.map((r) => r.id).join(','), status: 'running' })
      .select('id').single()
    runId = data?.id ?? null
  }

  let ingested = 0
  let orders = 0
  let minDate = null
  let maxDate = null

  try {
    for (const res of resources) {
      console.log(`\n→ ${res.name} (${(res.size / 1e6).toFixed(1)} MB)`)
      const csv = await (await fetch(res.url)).text()
      const rows = parseCsv(csv)
      const header = rows[0].map((h) => h.replace(/^﻿/, ''))
      const body = rows.slice(1).filter((r) => r.length >= header.length - 2)
      orders += body.length

      let buf = []
      for (const r of body) {
        const recs = explode(header, r)
        for (const rec of recs) {
          if (!minDate || rec.order_date < minDate) minDate = rec.order_date
          if (!maxDate || rec.order_date > maxDate) maxDate = rec.order_date
        }
        buf.push(...recs)
        if (buf.length >= BATCH) { ingested += await flush(db, buf, DRY); buf = [] }
      }
      if (buf.length) ingested += await flush(db, buf, DRY)
      console.log(`  ${body.length} orders → ${ingested} person-rows so far`)
    }

    if (!DRY && runId) {
      await db.from('ltb_ingest_runs').update({
        finished_at: new Date().toISOString(), rows_ingested: ingested, orders_seen: orders,
        coverage_from: minDate, coverage_to: maxDate, status: 'ok',
      }).eq('id', runId)
    }
    console.log(`\n${DRY ? '[dry-run] would ingest' : 'ingested'} ${ingested} person-rows from ${orders} orders (${minDate} → ${maxDate})`)
  } catch (err) {
    if (!DRY && runId) {
      await db.from('ltb_ingest_runs').update({
        finished_at: new Date().toISOString(), status: 'error', error: String(err).slice(0, 500),
      }).eq('id', runId)
    }
    throw err
  }
}

async function flush(db, rows, dry) {
  if (dry) return rows.length
  const { error } = await db.from('ltb_orders')
    .upsert(rows, { onConflict: 'document_id,role,person_norm', ignoreDuplicates: true })
  if (error) throw new Error(`upsert failed: ${error.message}`)
  return rows.length
}

await main()
