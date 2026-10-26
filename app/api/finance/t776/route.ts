// POST /api/finance/t776 { year, lang?, format?: 'html' | 'csv' } — the landlord's
// T776 figures for a year from Stayloop's records (lib/landlord/t776). Signed-in
// landlord only; reads with the service role after resolving the dual id. The
// printable HTML lists every T776 line per property, with the lines Stayloop
// cannot know left empty and said so; the CSV is the same table. Audited.
import { NextResponse } from 'next/server'
import { underHourlyLimit } from '@/lib/rateLimit'
import { adminClient, callerOf, NO_STORE, ownerIdsOf } from '@/lib/listings/serverAuth'
import { summarizeT776, t776Csv, T776_GUIDE_URL, T776_LINES, type T776Lease, type T776Rent, type T776Summary, type T776WorkOrder } from '@/lib/landlord/t776'
import { esc } from '@/lib/export/evidencePack'
import { fromToronto } from '@/lib/agent/routines'

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function renderHtml(s: T776Summary, lang: 'zh' | 'en', by: string, generatedAt: string): string {
  const zh = lang === 'zh'
  const T = (a: string, b: string) => (zh ? a : b)
  const table = (p: { label: string; gross_rents: number; rent_count: number; repairs: number; repair_count: number }) => `
    <h2>${esc(p.label)}</h2>
    <table><thead><tr><th>${T('T776 行', 'T776 line')}</th><th>${T('项目', 'Item')}</th><th class="r">${T('金额', 'Amount')}</th><th>${T('来源', 'Source')}</th></tr></thead><tbody>
    ${T776_LINES.map((l) => {
      const amt = l.source === 'rent' ? p.gross_rents : l.source === 'work_orders' ? p.repairs : null
      const cnt = l.source === 'rent' ? p.rent_count : l.source === 'work_orders' ? p.repair_count : null
      const src = l.source === 'rent' ? T(`Stayloop 记录的租金 · ${cnt} 笔`, `Rent recorded in Stayloop · ${cnt}`) : l.source === 'work_orders' ? T(`Stayloop 完工工单 · ${cnt} 张`, `Work orders completed in Stayloop · ${cnt}`) : T('这里没有记录，按你自己的凭证填', 'No record here — fill from your own papers')
      return `<tr class="${l.source ? '' : 'empty'}"><td class="fp">${l.line}</td><td>${esc(zh ? l.zh : l.en)}</td><td class="r">${amt == null ? '—' : money(amt)}</td><td class="meta">${src}</td></tr>`
    }).join('')}
    </tbody></table>`
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en-CA'}"><head><meta charset="utf-8"><title>T776 · ${s.year}</title><style>
  body { font-family: 'Inter Tight', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif; color: #1B1B3C; background: #F3F8FB; margin: 0; }
  .sheet { max-width: 880px; margin: 24px auto; background: #fff; padding: 32px 40px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #00ACE4; font-weight: 700; }
  h1 { font-size: 22px; margin: 6px 0 4px; } h2 { font-size: 15px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #D3E3EF; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #EEF3F7; vertical-align: top; } th { font-size: 11px; color: #6B7280; text-transform: uppercase; }
  td.r, th.r { text-align: right; white-space: nowrap; } tr.empty td { color: #9CA3AF; } .fp { font-family: ui-monospace, monospace; } .meta { color: #6B7280; font-size: 11.5px; }
  .note { background: #F3F8FB; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; line-height: 1.55; margin-top: 18px; }
  .toolbar { display: flex; justify-content: space-between; max-width: 880px; margin: 16px auto 0; font-size: 12.5px; color: #4B5563; } .toolbar button { font: inherit; padding: 6px 12px; }
  @media print { body { background: #fff; } .toolbar { display: none; } .sheet { box-shadow: none; margin: 0; padding: 0; } }
  </style></head><body>
  <div class="toolbar"><span>${T('按 Stayloop 记录生成；打印可存为 PDF。', 'Generated from Stayloop records; print to save as PDF.')}</span><button onclick="window.print()">${T('打印 / 存 PDF', 'Print / save PDF')}</button></div>
  <div class="sheet">
    <div class="eyebrow">Stayloop · CRA T776 · ${s.year}</div>
    <h1>${T(`${s.year} 年出租物业收支汇总（T776 对照）`, `${s.year} rental statement (T776 layout)`)}</h1>
    <div class="meta">${T('生成于', 'Generated')} ${esc(generatedAt)} · ${esc(by)} · ${T('物业', 'properties')} ${s.properties.length}</div>
    ${s.properties.length ? s.properties.map(table).join('') : `<p class="note">${T('这一年 Stayloop 里没有记录到任何已收租金或完工工单。', 'Stayloop has no rent recorded as received and no completed work order for this year.')}</p>`}
    <h2>${T('合计', 'Totals')}</h2>
    <table><tbody>
      <tr><td class="fp">8141</td><td>${T('租金总收入', 'Gross rents')}</td><td class="r">${money(s.totals.gross_rents)}</td><td class="meta">${s.totals.rent_count} ${T('笔', 'periods')}</td></tr>
      <tr><td class="fp">8960</td><td>${T('维修与保养', 'Repairs and maintenance')}</td><td class="r">${money(s.totals.repairs)}</td><td class="meta">${s.totals.repair_count} ${T('张工单', 'work orders')}${s.unplaced_repairs ? ` · ${T('另有未能归到物业的', 'plus unplaced')} ${money(s.unplaced_repairs)}` : ''}</td></tr>
    </tbody></table>
    <p class="note">${T(
      '只列 Stayloop 里记录过的款项：租金按「记收」日期入账（押金不是收入，不在这里）；维修按完工工单上有记录的金额（账单，其次批准额，再次报价）。其余各行 Stayloop 没有记录，报税时按你自己的凭证填写。这不是税务建议，以 CRA 的 T776 表格与指南（T4036）为准。',
      'Only what Stayloop recorded: rent by the date it was recorded as received (deposits are not income and are not here); repairs by the amount on completed work orders (invoice, else approved, else quote). The other lines have no record in Stayloop; fill them from your own papers. Not tax advice; CRA’s T776 form and guide (T4036) govern.',
    )} <a href="${T776_GUIDE_URL}" target="_blank" rel="noreferrer">${T('CRA T776 表格 ↗', 'CRA Form T776 ↗')}</a></p>
  </div></body></html>`
}

export async function POST(req: Request) {
  const user = await callerOf(req)
  if (!user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  if (!(await underHourlyLimit(`t776:${user.id}`, 30, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': '3600' } })
  const body = (await req.json().catch(() => null)) as { year?: unknown; lang?: unknown; format?: unknown } | null
  const year = Number(body?.year)
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return NextResponse.json({ error: 'invalid_year' }, { status: 400, headers: NO_STORE })
  const lang: 'zh' | 'en' = body?.lang === 'en' ? 'en' : 'zh'
  const format = body?.format === 'csv' ? 'csv' : 'html'
  const svc = adminClient()
  const ids = await ownerIdsOf(svc, user.id)
  // The year's bounds in Toronto time; summarizeT776 re-checks each row by its Toronto date.
  const from = fromToronto(year, 1, 1, 0).toISOString()
  const to = fromToronto(year + 1, 1, 1, 0).toISOString()
  const { data: leaseRows } = await svc.from('lease_documents').select('id, unit_label').in('landlord_id', ids).limit(500)
  const leases = (leaseRows ?? []) as { id: string; unit_label: string | null }[]
  const leaseIds = leases.map((l) => l.id)
  const [{ data: hhRows }, { data: rentRows }, { data: woRows }] = await Promise.all([
    leaseIds.length ? svc.from('households').select('id, address, unit, current_lease_id, previous_lease_id').or(`current_lease_id.in.(${leaseIds.join(',')}),previous_lease_id.in.(${leaseIds.join(',')})`).limit(500) : Promise.resolve({ data: [] as unknown[] }),
    leaseIds.length ? svc.from('rent_payments').select('lease_id, amount, status, paid_at').in('lease_id', leaseIds).in('status', ['paid', 'late']).gte('paid_at', from).lt('paid_at', to).limit(5000) : Promise.resolve({ data: [] as unknown[] }),
    svc.from('work_orders').select('household_id, status, invoice_amount, approved_amount, quote_amount, completed_at').eq('landlord_auth_id', user.id).gte('completed_at', from).lt('completed_at', to).limit(2000),
  ])
  const hhs = (hhRows ?? []) as { id: string; address: string; unit: string | null; current_lease_id: string | null; previous_lease_id: string | null }[]
  const hhOfLease: Record<string, string> = {}
  const t776Leases: T776Lease[] = leases.map((l) => {
    const h = hhs.find((x) => x.current_lease_id === l.id) ?? hhs.find((x) => x.previous_lease_id === l.id) ?? null
    if (h) hhOfLease[l.id] = h.id
    return { id: l.id, unit_label: l.unit_label, household: h ? { address: h.address, unit: h.unit } : null }
  })
  const summary = summarizeT776({ year, leases: t776Leases, rents: (rentRows ?? []) as T776Rent[], workOrders: (woRows ?? []) as T776WorkOrder[], householdOfLease: hhOfLease })
  const generatedAt = new Date().toISOString()
  await svc.from('agent_audit_events').insert({
    actor_id: user.id, actor_type: 'user', action: 't776_export_generated', target_type: 'landlord', target_id: user.id, acting_role: 'landlord',
    metadata: { year, format, properties: summary.properties.length, gross_rents: summary.totals.gross_rents, repairs: summary.totals.repairs },
  }).then(() => undefined, () => undefined)
  if (format === 'csv') {
    return new NextResponse(t776Csv(summary, lang), { headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="stayloop-t776-${year}.csv"` } })
  }
  return new NextResponse(renderHtml(summary, lang, user.email, generatedAt), { headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } })
}
