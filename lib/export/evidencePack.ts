// Evidence pack · pure renderer (节点 6 「可收口」, 2026-09-27). Turns one
// rental matter's record — chain, threads (server time, party, hat,
// retractions kept), attachments with their SHA-256, work-order timelines,
// formal-notice copies, audit rows, delegations — into a standalone printable
// HTML document (browser → PDF, same approach as the screening report). No
// scores anywhere. The route computes a content fingerprint over the JSON it
// rendered and prints it in the footer so two copies can be compared.

export type PackDelivery = { channel: string; status: string; at: string; provider_message_id: string | null }
export type PackMessage = { id: number; created_at: string; sender_kind: string; acting_role: string | null; sender_label: string | null; kind: string; body: string; retracted_at: string | null; attachments: { name: string; size: number; sha256: string; path: string }[]; channel?: string | null; hash?: string | null; prev_hash?: string | null; deliveries?: PackDelivery[]; raw_sha256?: string | null }
/** Hash-chain verification of a thread (消息系统 A 期): recomputed by the server at export time. */
export type PackChain = { ok: boolean; count: number; head: string | null; brokenAt: number | null; reason: string | null }
export type PackThread = { id: string; kind: string; title: string | null; created_at: string; messages: PackMessage[]; chain?: PackChain }
export type PackWorkOrder = { id: string; status: string; trade: string | null; scope: string | null; contractor: string; emergency: boolean; quote_amount: number | null; quote_version: number | null; approved_amount: number | null; invoice_amount: number | null; created_at: string; quoted_at: string | null; approved_at: string | null; arrived_at: string | null; completed_at: string | null; accepted_at: string | null; paid_at: string | null; decline_code: string | null; cancel_reason: string | null; events: { created_at: string; actor_kind: string; event: string; payload: Record<string, unknown> }[] }
export type PackAudit = { created_at: string; action: string; actor: string; acting_role: string | null; delegation_id: string | null }
export type PackDelegation = { id: string; principal: string; delegate: string; scope: string[]; allowed_actions: string[]; status: string; confirmed_at: string | null; revoked_at: string | null; expires_at: string; basis_version: string }
export type EvidencePackData = {
  matter: { id: string; address: string | null; unit: string | null; created_at: string }
  parties: { landlord: string; tenant: string | null }
  application: { id: string; applicant: string; status: string | null; created_at: string; decision_notified_at: string | null; decision_reason: string | null } | null
  screening: { id: string; status: string | null; created_at: string } | null
  lease: { id: string; status: string | null; start_date: string | null; end_date: string | null; monthly_rent: number | null; sent_at: string | null; signed_at: string | null } | null
  household: { id: string; verified: boolean | null; status: string | null; rent: { due_date: string; status: string | null; paid_at: string | null; amount: number | null }[] } | null
  work_orders: PackWorkOrder[]
  threads: PackThread[]
  audit: PackAudit[]
  delegations: PackDelegation[]
}
export type PackMeta = { lang: 'zh' | 'en'; generatedAt: string; generatedBy: string; fingerprint: string; siteUrl: string }

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
/** Deterministic JSON (sorted keys) so the fingerprint does not depend on object insertion order. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}
const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const when = (iso: string | null | undefined, lang: 'zh' | 'en') => (iso ? `${new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' })} <span class="utc">${new Date(iso).toISOString()}</span>` : '—')
const PARTY: Record<string, { zh: string; en: string }> = { tenant: { zh: '租客', en: 'Tenant' }, landlord: { zh: '房东', en: 'Landlord' }, provider: { zh: '服务商', en: 'Provider' }, external: { zh: '服务商（邮件链接）', en: 'Contractor (email link)' }, agent: { zh: '经纪', en: 'Agent' }, system: { zh: '系统', en: 'System' }, admin: { zh: 'Stayloop', en: 'Stayloop' }, member: { zh: '用户', en: 'Member' } }
const CHANNEL: Record<string, { zh: string; en: string }> = { app: { zh: '站内', en: 'in app' }, email: { zh: '邮件回复', en: 'email reply' }, sms: { zh: '短信回复', en: 'SMS reply' }, system: { zh: '系统', en: 'system' } }
const DELIV: Record<string, { zh: string; en: string }> = { sent: { zh: '已发出', en: 'sent' }, delivered: { zh: '已送达', en: 'delivered' }, opened: { zh: '已打开', en: 'opened' }, bounced: { zh: '退回', en: 'bounced' }, failed: { zh: '失败', en: 'failed' }, skipped: { zh: '未推送', en: 'not pushed' } }
const KIND: Record<string, { zh: string; en: string }> = { message: { zh: '消息', en: 'Message' }, system: { zh: '系统行', en: 'System' }, formal_copy: { zh: '正式通知副本', en: 'Formal-notice copy' }, retraction: { zh: '撤回', en: 'Retraction' } }
const T = (lang: 'zh' | 'en', zh: string, en: string) => (lang === 'zh' ? zh : en)

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #E9EEF3; color: #1B1B3C; font: 12.5px/1.55 -apple-system, "Segoe UI", Inter, "PingFang SC", "Noto Sans CJK SC", sans-serif; }
  .toolbar { width: 210mm; max-width: 100%; margin: 12px auto; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12px; color: #475569; }
  .toolbar button { font: inherit; font-weight: 700; color: #fff; background: #1B1B3C; border: 0; border-radius: 999px; padding: 8px 18px; cursor: pointer; }
  .sheet { width: 210mm; max-width: 100%; margin: 0 auto 24px; background: #fff; padding: 18mm 16mm; box-shadow: 0 2px 24px rgba(15,23,42,.18); }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #D3E3EF; } h3 { font-size: 12.5px; margin: 14px 0 6px; }
  .eyebrow { font-family: ui-monospace, Menlo, monospace; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #6E6E8A; }
  .meta { color: #4A4A6A; font-size: 11.5px; } .utc { color: #9FBBD0; font-family: ui-monospace, Menlo, monospace; font-size: 10px; margin-left: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; } th, td { text-align: left; vertical-align: top; padding: 5px 6px; border-bottom: 1px solid #E4EEF6; } th { font-family: ui-monospace, Menlo, monospace; font-size: 10px; text-transform: uppercase; color: #6E6E8A; }
  .msg { border-left: 3px solid #D3E3EF; padding: 6px 10px; margin: 6px 0; } .msg.formal { border-left-color: #F59E0B; background: #FFFBEB; } .msg.system { border-left-color: #CBD5E1; color: #4A4A6A; } .msg.retracted .body { text-decoration: line-through; color: #6E6E8A; }
  .body { white-space: pre-wrap; word-break: break-word; margin-top: 2px; } .att { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: #4A4A6A; }
  .note { background: #F3F8FC; border: 1px solid #D3E3EF; border-radius: 8px; padding: 10px 12px; font-size: 11.5px; color: #4A4A6A; }
  .fp { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; word-break: break-all; }
  .ok { color: #047857; font-weight: 700; } .bad { color: #B42318; font-weight: 700; }
  @page { size: A4; margin: 14mm 14mm; }
  @media print { body { background: #fff; } .toolbar { display: none; } .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; } h2 { break-after: avoid; } .msg, tr { break-inside: avoid; } }
`

export function renderEvidencePack(d: EvidencePackData, m: PackMeta): string {
  const L = m.lang
  const title = [d.matter.address, d.matter.unit ? `#${d.matter.unit}` : null].filter(Boolean).join(' ') || d.matter.id
  const rows = (xs: string[]) => xs.map((x) => `<tr>${x}</tr>`).join('')
  const chain = `
    <table><thead><tr><th>${T(L, '环节', 'Step')}</th><th>${T(L, '状态', 'State')}</th><th>${T(L, '时间（多伦多 · UTC）', 'When (Toronto · UTC)')}</th><th>${T(L, '说明', 'Notes')}</th></tr></thead><tbody>
    ${rows([
      d.application ? `<td>${T(L, '申请', 'Application')}</td><td>${esc(d.application.status ?? '—')}</td><td>${when(d.application.created_at, L)}</td><td>${esc(d.application.applicant)}${d.application.decision_notified_at ? ` · ${T(L, '决定通知', 'decision notice')} ${when(d.application.decision_notified_at, L)}` : ''}${d.application.decision_reason ? ` · ${esc(d.application.decision_reason)}` : ''}</td>` : '',
      d.screening ? `<td>${T(L, '筛查', 'Screening')}</td><td>${esc(d.screening.status ?? '—')}</td><td>${when(d.screening.created_at, L)}</td><td>${T(L, '结果与分数不在证据包内；报告由房东另存', 'Result and score are not part of the pack; the landlord keeps the report separately')}</td>` : '',
      d.lease ? `<td>${T(L, '租约', 'Lease')}</td><td>${esc(d.lease.status ?? '—')}</td><td>${esc(d.lease.start_date ?? '—')} → ${esc(d.lease.end_date ?? '—')}</td><td>${T(L, '月租', 'Rent')} ${money(d.lease.monthly_rent)}${d.lease.sent_at ? ` · ${T(L, '发出', 'sent')} ${when(d.lease.sent_at, L)}` : ''}${d.lease.signed_at ? ` · ${T(L, '双签', 'signed')} ${when(d.lease.signed_at, L)}` : ''}</td>` : '',
      d.household ? `<td>${T(L, '在管租约', 'Managed tenancy')}</td><td>${esc(d.household.status ?? '—')}${d.household.verified ? ` · ${T(L, '双方确认', 'both confirmed')}` : ` · ${T(L, '未确认', 'unconfirmed')}`}</td><td>—</td><td>${T(L, '租金记录', 'Rent records')} ${d.household.rent.length}</td>` : '',
    ].filter(Boolean))}
    </tbody></table>`
  const rent = d.household && d.household.rent.length ? `<h3>${T(L, '租金记录（只记录，不经手资金）', 'Rent records (records only; no money moves through Stayloop)')}</h3><table><thead><tr><th>${T(L, '到期', 'Due')}</th><th>${T(L, '状态', 'Status')}</th><th>${T(L, '记录时间', 'Recorded')}</th><th>${T(L, '金额', 'Amount')}</th></tr></thead><tbody>${rows(d.household.rent.map((r) => `<td>${esc(r.due_date)}</td><td>${esc(r.status ?? '—')}</td><td>${when(r.paid_at, L)}</td><td>${money(r.amount)}</td>`))}</tbody></table>` : ''
  const wos = d.work_orders.length ? d.work_orders.map((w) => `
    <h3>${esc(w.scope || w.id)} · ${esc(w.contractor)} · <span class="meta">${esc(w.status)}${w.emergency ? ` · ${T(L, '紧急', 'emergency')}` : ''}</span></h3>
    <div class="meta">${T(L, '报价', 'Quote')} ${money(w.quote_amount)}${w.quote_version ? ` (v${w.quote_version})` : ''} · ${T(L, '批准', 'approved')} ${money(w.approved_amount)} · ${T(L, '账单', 'invoice')} ${money(w.invoice_amount)}${w.decline_code ? ` · ${T(L, '婉拒原因', 'declined')}: ${esc(w.decline_code)}` : ''}${w.cancel_reason ? ` · ${esc(w.cancel_reason)}` : ''}</div>
    <table><thead><tr><th>${T(L, '时间', 'When')}</th><th>${T(L, '谁', 'Who')}</th><th>${T(L, '事件', 'Event')}</th><th>${T(L, '内容', 'Payload')}</th></tr></thead><tbody>${rows(w.events.map((e) => `<td>${when(e.created_at, L)}</td><td>${esc(PARTY[e.actor_kind]?.[L] ?? e.actor_kind)}</td><td>${esc(e.event)}</td><td class="att">${esc(Object.entries(e.payload || {}).filter(([k]) => !['photos'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ').slice(0, 300))}</td>`))}</tbody></table>`).join('') : `<p class="meta">${T(L, '无维修工单。', 'No work orders.')}</p>`
  const formal = d.threads.flatMap((t) => t.messages.filter((x) => x.kind === 'formal_copy').map((x) => ({ t, x })))
  const formalHtml = formal.length ? formal.map(({ t, x }) => `<div class="msg formal"><div class="meta">${esc(t.title || t.kind)} · ${when(x.created_at, L)} · ${esc(x.sender_label || PARTY[x.sender_kind]?.[L] || x.sender_kind)}</div><div class="body">${esc(x.body)}</div></div>`).join('') : `<p class="meta">${T(L, '无正式通知副本。', 'No formal-notice copies.')}</p>`
  const threads = d.threads.length ? d.threads.map((t) => renderThreadBlock(t, L)).join('') : `<p class="meta">${T(L, '无对话。', 'No threads.')}</p>`
  const audit = d.audit.length ? `<table><thead><tr><th>${T(L, '时间', 'When')}</th><th>${T(L, '身份', 'Hat')}</th><th>${T(L, '谁', 'Who')}</th><th>${T(L, '动作', 'Action')}</th><th>${T(L, '委托', 'Delegation')}</th></tr></thead><tbody>${rows(d.audit.map((a) => `<td>${when(a.created_at, L)}</td><td>${esc(a.acting_role ? (PARTY[a.acting_role]?.[L] ?? a.acting_role) : '—')}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td class="att">${a.delegation_id ? esc(a.delegation_id.slice(0, 8)) : '—'}</td>`))}</tbody></table>` : `<p class="meta">${T(L, '无审计记录。', 'No audit rows.')}</p>`
  const delegs = d.delegations.length ? `<table><thead><tr><th>${T(L, '委托人', 'Principal')}</th><th>${T(L, '受托经纪', 'Agent')}</th><th>${T(L, '范围 · 动作', 'Scope · actions')}</th><th>${T(L, '状态', 'Status')}</th><th>${T(L, '确认 / 撤销 / 到期', 'Confirmed / revoked / until')}</th></tr></thead><tbody>${rows(d.delegations.map((g) => `<td>${esc(g.principal)}</td><td>${esc(g.delegate)}</td><td>${esc(g.scope.join(', '))} · ${esc(g.allowed_actions.join(', '))}<br><span class="att">${esc(g.basis_version)}</span></td><td>${esc(g.status)}</td><td>${when(g.confirmed_at, L)}<br>${when(g.revoked_at, L)}<br>${esc(g.expires_at.slice(0, 10))}</td>`))}</tbody></table>` : `<p class="meta">${T(L, '无委托。', 'No delegations.')}</p>`
  const attachments = d.threads.flatMap((t) => t.messages.flatMap((x) => x.attachments))
  return `<!doctype html><html lang="${L === 'zh' ? 'zh-CN' : 'en-CA'}"><head><meta charset="utf-8"><title>${esc(T(L, '证据包', 'Evidence pack'))} · ${esc(title)}</title><style>${CSS}</style></head><body>
<div class="toolbar"><span>${T(L, '这是按平台记录生成的导出件；打印可存为 PDF。', 'Generated from the platform record; print to save as PDF.')}</span><button onclick="window.print()">${T(L, '打印 / 保存为 PDF', 'Print / Save as PDF')}</button></div>
<div class="sheet">
  <div class="eyebrow">Stayloop · ${T(L, '租赁事务证据包', 'Rental matter evidence pack')}</div>
  <h1>${esc(title)}</h1>
  <div class="meta">${T(L, '事务编号', 'Matter')} <span class="fp">${esc(d.matter.id)}</span> · ${T(L, '房东', 'landlord')} ${esc(d.parties.landlord)}${d.parties.tenant ? ` · ${T(L, '租客', 'tenant')} ${esc(d.parties.tenant)}` : ''}</div>
  <div class="meta">${T(L, '生成于', 'Generated')} ${when(m.generatedAt, L)} · ${T(L, '生成者', 'by')} ${esc(m.generatedBy)} · ${esc(m.siteUrl)}</div>
  <p class="note">${T(L, '记录只追加：每条消息带服务器时间、发送者在该事务中的身份与当时的帽子；撤回的消息仍在此显示并标注撤回时间；附件列出服务器计算的 SHA-256。正式通知（进入通知 / 决定通知 / 续约函）以邮件送达为准，这里是副本，不构成《住宅租赁法》意义上的法定送达。本文件不含任何筛查分数。', 'Append-only record: every message carries server time, the sender’s party in this matter and the hat worn; retracted messages remain here marked with the retraction time; attachments list the server-computed SHA-256. Formal notices (entry, decision, renewal) were served by email — these are copies, not statutory service under the RTA. No screening score appears in this file.')}</p>
  <h2>1 · ${T(L, '事务链', 'The chain')}</h2>${chain}${rent}
  <h2>2 · ${T(L, '正式通知副本', 'Formal-notice copies')}</h2>${formalHtml}
  <h2>3 · ${T(L, '维修工单', 'Work orders')}</h2>${wos}
  <h2>4 · ${T(L, '对话记录', 'Threads')}</h2>${threads}
  <h2>5 · ${T(L, '附件清单', 'Attachments')} <span class="meta">(${attachments.length})</span></h2>${attachments.length ? `<table><thead><tr><th>${T(L, '文件', 'File')}</th><th>${T(L, '大小', 'Size')}</th><th>SHA-256</th></tr></thead><tbody>${rows(attachments.map((a) => `<td>${esc(a.name)}</td><td>${a.size} B</td><td class="fp">${esc(a.sha256)}</td>`))}</tbody></table>` : `<p class="meta">${T(L, '无附件。', 'No attachments.')}</p>`}
  <h2>6 · ${T(L, '委托', 'Delegations')}</h2>${delegs}
  <h2>7 · ${T(L, '审计记录', 'Audit log')} <span class="meta">(${d.audit.length})</span></h2>${audit}
  <h2>8 · ${T(L, '内容指纹', 'Content fingerprint')}</h2>
  <p class="meta">${T(L, '以下为本导出所依据的结构化记录（JSON，键排序后）的 SHA-256。两份导出若指纹相同，内容一致。', 'SHA-256 of the structured record (JSON, keys sorted) this export was rendered from. Two exports with the same fingerprint have identical content.')}</p>
  <p class="fp">${esc(m.fingerprint)}</p>
</div></body></html>`
}

export type ReceiptData = {
  work_order: PackWorkOrder & { household: string | null; landlord: string; provider_business_number: string | null; payment_mode: string | null }
  cpa: { ok: boolean; overBy?: number }
}
/** 线下结算回执 · a record of what both sides did on the platform — not an invoice, no money moved through Stayloop. */
export function renderReceipt(r: ReceiptData, m: PackMeta): string {
  const L = m.lang
  const w = r.work_order
  const settled = !!w.paid_at
  const title = settled ? T(L, '线下结算回执', 'Offline settlement receipt') : T(L, '验收回执', 'Acceptance record')
  const row = (k: string, v: string) => `<tr><th>${k}</th><td>${v}</td></tr>`
  return `<!doctype html><html lang="${L === 'zh' ? 'zh-CN' : 'en-CA'}"><head><meta charset="utf-8"><title>${esc(title)} · ${esc(w.scope || w.id)}</title><style>${CSS}</style></head><body>
<div class="toolbar"><span>${T(L, '按双方在 Stayloop 上的记录生成；打印可存为 PDF。', 'Generated from both sides’ record on Stayloop; print to save as PDF.')}</span><button onclick="window.print()">${T(L, '打印 / 保存为 PDF', 'Print / Save as PDF')}</button></div>
<div class="sheet">
  <div class="eyebrow">Stayloop · ${esc(title)}</div>
  <h1>${esc(w.scope || w.id)}</h1>
  <div class="meta">${T(L, '工单', 'Work order')} <span class="fp">${esc(w.id)}</span> · ${esc(w.status)}${w.emergency ? ` · ${T(L, '紧急', 'emergency')}` : ''}</div>
  <table>
    ${row(T(L, '地址', 'Address'), esc(w.household || '—'))}
    ${row(T(L, '房东', 'Landlord'), esc(w.landlord))}
    ${row(T(L, '服务商', 'Contractor'), `${esc(w.contractor)}${w.provider_business_number ? ` · BN ${esc(w.provider_business_number)}` : ''}`)}
    ${row(T(L, '报价', 'Quote'), `${money(w.quote_amount)}${w.quote_version ? ` (v${w.quote_version})` : ''} · ${T(L, '报价时间', 'quoted')} ${when(w.quoted_at, L)}`)}
    ${row(T(L, '批准金额', 'Approved'), `${money(w.approved_amount)} · ${when(w.approved_at, L)}`)}
    ${row(T(L, '到场 / 完工', 'Arrived / completed'), `${when(w.arrived_at, L)} / ${when(w.completed_at, L)}`)}
    ${row(T(L, '账单', 'Invoice'), `${money(w.invoice_amount)}${r.cpa.ok ? ` · ${T(L, '在批准报价的 10% 之内（《消费者保护法》）', 'within 10% of the approved estimate (Consumer Protection Act)')}` : ` · <b>${T(L, `超出批准报价 ${r.cpa.overBy}%`, `${r.cpa.overBy}% over the approved estimate`)}</b>`}`)}
    ${row(T(L, '验收', 'Accepted'), when(w.accepted_at, L))}
    ${row(T(L, '付款', 'Payment'), settled ? `${T(L, '线下 · 房东标记已付', 'offline · marked paid by the landlord')} · ${when(w.paid_at, L)}` : T(L, '尚未标记付款', 'not yet marked paid'))}
  </table>
  <h2>${T(L, '时间线', 'Timeline')}</h2>
  <table><thead><tr><th>${T(L, '时间', 'When')}</th><th>${T(L, '谁', 'Who')}</th><th>${T(L, '事件', 'Event')}</th></tr></thead><tbody>${w.events.map((e) => `<tr><td>${when(e.created_at, L)}</td><td>${esc(PARTY[e.actor_kind]?.[L] ?? e.actor_kind)}</td><td>${esc(e.event)}${typeof e.payload?.amount === 'number' ? ` · ${money(e.payload.amount as number)}` : ''}${typeof e.payload?.reason === 'string' && e.payload.reason ? ` · ${esc(e.payload.reason)}` : ''}</td></tr>`).join('')}</tbody></table>
  <p class="note">${T(L, 'Stayloop 不经手资金，也不是任何一方的代理。本回执只记录双方在平台上的操作与时间；它不是发票——发票由服务商向房东开具。', 'Stayloop moves no money and is no party’s agent. This record shows both sides’ actions and times on the platform; it is not an invoice — the contractor invoices the landlord.')}</p>
  <div class="meta">${T(L, '生成于', 'Generated')} ${when(m.generatedAt, L)} · ${T(L, '生成者', 'by')} ${esc(m.generatedBy)} · ${T(L, '指纹', 'fingerprint')} <span class="fp">${esc(m.fingerprint)}</span></div>
</div></body></html>`
}

/** One thread: chain status, then every message with server time, party, hat, channel, receipts and fingerprint. */
export function renderThreadBlock(t: PackThread, L: 'zh' | 'en'): string {
  const chain = t.chain ? (t.chain.ok
    ? `<span class="ok">✓ ${T(L, `哈希链完整（${t.chain.count}/${t.chain.count}）`, `hash chain intact (${t.chain.count}/${t.chain.count})`)}</span> · ${T(L, '链头', 'head')} <span class="fp">${esc(t.chain.head ?? '—')}</span>`
    : `<span class="bad">✗ ${T(L, `哈希链在第 ${t.chain.brokenAt} 条断开（${t.chain.reason}）`, `hash chain breaks at #${t.chain.brokenAt} (${t.chain.reason})`)}</span>`) : ''
  return `
    <h3>${esc(t.title || t.kind)} <span class="meta">· ${esc(t.kind)} · ${t.messages.length} ${T(L, '条', 'messages')} · ${T(L, '开于', 'opened')} ${when(t.created_at, L)}</span></h3>
    ${chain ? `<div class="meta">${chain}</div>` : ''}
    ${t.messages.map((x) => `<div class="msg ${x.kind === 'formal_copy' ? 'formal' : x.kind === 'system' ? 'system' : ''} ${x.retracted_at ? 'retracted' : ''}">
      <div class="meta">#${x.id} · ${when(x.created_at, L)} · <b>${esc(x.sender_label || PARTY[x.sender_kind]?.[L] || x.sender_kind)}</b>${x.acting_role && x.acting_role !== x.sender_kind ? ` (${esc(PARTY[x.acting_role]?.[L] ?? x.acting_role)})` : ''} · ${esc(KIND[x.kind]?.[L] ?? x.kind)}${x.channel && x.channel !== 'app' && x.channel !== 'system' ? ` · ${esc(CHANNEL[x.channel]?.[L] ?? x.channel)}` : ''}${x.retracted_at ? ` · <b>${T(L, '已撤回于', 'retracted at')} ${when(x.retracted_at, L)}</b>` : ''}</div>
      <div class="body">${esc(x.body)}</div>
      ${x.attachments.length ? `<ul>${x.attachments.map((a) => `<li class="att">${esc(a.name)} · ${a.size} B · sha256 ${esc(a.sha256)}</li>`).join('')}</ul>` : ''}
      ${x.deliveries && x.deliveries.length ? `<div class="att">${T(L, '回执', 'Receipts')}: ${x.deliveries.map((r) => `${esc(r.channel)} ${esc(DELIV[r.status]?.[L] ?? r.status)} ${esc(r.at.replace('+00:00', 'Z'))}${r.provider_message_id ? ` (${esc(r.provider_message_id)})` : ''}`).join(' · ')}</div>` : ''}
      ${x.raw_sha256 ? `<div class="att">${T(L, '原始邮件 SHA-256', 'Raw email SHA-256')} ${esc(x.raw_sha256)}</div>` : ''}
      ${x.hash ? `<div class="att">${T(L, '指纹', 'fingerprint')} ${esc(x.hash)}</div>` : ''}
    </div>`).join('')}`
}

export type ThreadPackMeta = PackMeta & { parties: string[] }
/** A single conversation's export (message centre). */
export function renderThreadPack(t: PackThread, m: ThreadPackMeta): string {
  const L = m.lang
  return `<!doctype html><html lang="${L === 'zh' ? 'zh-CN' : 'en-CA'}"><head><meta charset="utf-8"><title>${esc(T(L, '对话记录', 'Conversation record'))} · ${esc(t.title || t.kind)}</title><style>${CSS}</style></head><body>
<div class="toolbar"><span>${T(L, '这是按平台记录生成的导出件；打印可存为 PDF。', 'Generated from the platform record; print to save as PDF.')}</span><button onclick="window.print()">${T(L, '打印 / 保存为 PDF', 'Print / Save as PDF')}</button></div>
<div class="sheet">
  <div class="eyebrow">Stayloop · ${T(L, '对话记录', 'Conversation record')}</div>
  <h1>${esc(t.title || t.kind)}</h1>
  <div class="meta">${T(L, '对话编号', 'Thread')} <span class="fp">${esc(t.id)}</span> · ${T(L, '参与方', 'parties')}: ${esc(m.parties.join(' · '))}</div>
  <div class="meta">${T(L, '生成于', 'Generated')} ${when(m.generatedAt, L)} · ${T(L, '生成者', 'by')} ${esc(m.generatedBy)} · ${esc(m.siteUrl)}</div>
  <p class="note">${T(L, '记录只追加、谁都删不掉：每条消息带服务器时间（UTC）、发送者在这件事中的身份与当时的帽子、渠道（站内 / 邮件回复）、逐渠道回执与指纹。指纹 = SHA-256（上一条指纹 + 本条规范化内容，算法见 JSON 导出的 chain 字段）；删掉或改动任何一条，后面的指纹都对不上。邮件回复另存原始邮件并记录其 SHA-256。平台消息是沟通记录；N 表等正式通知仍按《住宅租赁法》s.191 送达。', 'Append-only; nobody can delete it. Each message carries server time (UTC), the sender’s party and hat, the channel (in app / email reply), per-channel receipts and a fingerprint = SHA-256(previous fingerprint + this message’s canonical content; the algorithm is in the JSON export’s chain field). Removing or changing any message breaks every fingerprint after it. Email replies keep the raw email and its SHA-256. Platform messages are a record of communication; formal notices (N forms) are still served under RTA s.191.')}</p>
  ${renderThreadBlock(t, L)}
  <h2>${T(L, '内容指纹', 'Content fingerprint')}</h2>
  <p class="fp">${esc(m.fingerprint)}</p>
</div></body></html>`
}
