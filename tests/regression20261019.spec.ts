// OpenNext runtime regression (2026-10-19, design/opennext-runtime-regression-2026-10-19.md).
// S1 follow-up: every column-level-protected column is read only by a service-role client.
// S2: the thread JSON export carries chain_rows that recompute the hash chain on their own.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalMessage, sha256Hex, verifyChain, GENESIS, type ChainMessage } from '@/lib/threads/hashChain'
import { chainRowsOf } from '@/lib/export/threadRecord'

const read = (p: string) => readFileSync(p, 'utf8')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

// Columns the database refuses to authenticated (CLAUDE.md「数据库与迁移」). Naming one in a
// user-JWT query fails the WHOLE query with 42501 — that is how the landlord countersign
// silently 404'd from 10-18 to 10-19 (S1).
const PROTECTED: Record<string, string[]> = {
  work_orders: ['token', 'external_email'],
  delegations: ['confirm_token'],
  household_invites: ['invited_email', 'token'],
  lease_documents: ['sign_token'],
  consumer_requests: ['*'],
}
const SERVICE_CLIENTS = new Set(['admin', 'adminSb'])

describe('column-protected columns are read with service role only (S1 sweep, 2026-10-19)', () => {
  it('no app / components / lib query names a protected column through a user client', () => {
    const offenders: string[] = []
    for (const p of [...walk('app'), ...walk('components'), ...walk('lib')]) {
      const src = read(p)
      for (const [table, cols] of Object.entries(PROTECTED)) {
        const re = new RegExp(`(\\w+)\\s*\\.from\\('${table}'\\)\\s*\\.select\\(\\s*'([^']*)'`, 'g')
        for (let m = re.exec(src); m; m = re.exec(src)) {
          const sel = m[2].split(',').map((s) => s.trim().split(':').pop()!.split('(')[0].trim())
          const hit = cols.includes('*') || sel.includes('*') || cols.some((c) => sel.includes(c))
          if (hit && !SERVICE_CLIENTS.has(m[1])) offenders.push(`${p}: ${m[1]}.from('${table}')`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

async function chained(rows: Omit<ChainMessage, 'prev_hash' | 'hash'>[]): Promise<ChainMessage[]> {
  let prev = GENESIS
  const out: ChainMessage[] = []
  for (const r of rows) {
    const hash = await sha256Hex(canonicalMessage(r as ChainMessage, prev))
    out.push({ ...r, prev_hash: prev, hash })
    prev = hash
  }
  return out
}

describe('thread JSON export recomputes from the file alone (S2, 2026-10-19)', () => {
  const T = '6eca91f3-0000-4000-8000-000000000001'
  const base = { thread_id: T, sender_kind: 'user', acting_role: 'tenant', channel: 'app', attachments: [] as { path: string; sha256: string }[] }

  it('chain_rows — every row, retractions included — pass verifyChain after a JSON round trip', async () => {
    const raw = await chained([
      { ...base, id: 10, created_at: '2026-10-19T05:40:01.123456+00:00', sender_id: 'a0000000-0000-4000-8000-000000000001', kind: 'text', ref_message_id: null, body: '[TEST] 你好' },
      { ...base, id: 11, created_at: '2026-10-19T05:41:02.5+00:00', sender_id: 'b0000000-0000-4000-8000-000000000002', acting_role: 'landlord', channel: 'email', kind: 'text', ref_message_id: null, body: 'reply', attachments: [{ path: 'threads/x/a.pdf', sha256: 'ab'.repeat(32) }] },
      { ...base, id: 12, created_at: '2026-10-19T05:42:03+00:00', sender_id: 'a0000000-0000-4000-8000-000000000001', kind: 'retraction', ref_message_id: 10, body: '' },
      { ...base, id: 13, created_at: '2026-10-19T05:43:04.000001+00:00', sender_id: null, sender_kind: 'system', acting_role: null, channel: null, kind: 'notice', ref_message_id: null, body: 'system notice' },
    ])
    expect((await verifyChain(raw)).ok).toBe(true)
    const exported = JSON.parse(JSON.stringify(chainRowsOf(raw)))
    expect(exported).toHaveLength(4)
    expect(exported.map((r: { kind: string }) => r.kind)).toContain('retraction')
    const report = await verifyChain(exported)
    expect(report).toMatchObject({ ok: true, count: 4, brokenAt: null })
    expect(report.head).toBe(raw[3].hash)
    // Only the canonical fields: no labels, receipts or email addresses ride along.
    expect(Object.keys(exported[0]).sort()).toEqual(['acting_role', 'attachments', 'body', 'channel', 'created_at', 'hash', 'id', 'kind', 'prev_hash', 'ref_message_id', 'sender_id', 'sender_kind', 'thread_id'])
    expect(JSON.stringify(exported)).not.toMatch(/@/)
  })

  it('a tampered chain_rows body breaks at that row', async () => {
    const raw = await chained([
      { ...base, id: 1, created_at: '2026-10-19T05:40:01.000000+00:00', sender_id: null, kind: 'text', ref_message_id: null, body: 'one' },
      { ...base, id: 2, created_at: '2026-10-19T05:40:02.000000+00:00', sender_id: null, kind: 'text', ref_message_id: null, body: 'two' },
    ])
    const rows = chainRowsOf(raw)
    rows[1] = { ...rows[1], body: 'edited' }
    expect(await verifyChain(rows)).toMatchObject({ ok: false, brokenAt: 2, reason: 'hash_mismatch' })
  })

  it('the export route ships chain_rows and points the recipe at it', () => {
    const r = read('app/api/threads/export/route.ts')
    expect(r).toContain('chain_rows: chainRowsOf(raw)')
    expect(r).toContain("recompute_from: 'chain_rows'")
    expect(r).toContain('channel or "app"')
  })
})
