// Pure helpers behind the agent's client table (P2 2026-09-23); the
// component is components/agent/ClientBook.tsx.
import type { PillTone } from '@/components/workspace'

export type ClientStage = 'searching' | 'showing' | 'applied' | 'leased' | 'closed'
export type ClientRole = 'tenant' | 'landlord'

export const STAGES: { key: ClientStage; zh: string; en: string; tone: PillTone }[] = [
  { key: 'searching', zh: '寻房中', en: 'Searching', tone: 'info' },
  { key: 'showing', zh: '看房中', en: 'Showing', tone: 'info' },
  { key: 'applied', zh: '已申请', en: 'Applied', tone: 'warn' },
  { key: 'leased', zh: '已签约', en: 'Leased', tone: 'ok' },
  { key: 'closed', zh: '已归档', en: 'Closed', tone: 'neutral' },
]

/** TRESA s.32 / O. Reg. 567/05: both the written agreement and the Information Guide before leasing work. */
export function paperworkComplete(c: { representation_agreement_at: string | null; info_guide_given_at: string | null }): boolean {
  return !!c.representation_agreement_at && !!c.info_guide_given_at
}

export function daysQuiet(c: { last_contact_at: string | null; updated_at: string }, today = new Date()): number {
  const t = new Date(c.last_contact_at || c.updated_at).getTime()
  return Math.max(0, Math.floor((today.getTime() - t) / 86_400_000))
}

/** Tasks the agent's own client table implies (three-role test report
 *  2026-09-24, SL-A-04: the tasks page said "opens once representation
 *  records ship" although the client table had shipped). Pure; no model. */
export type ClientTask = { id: string; clientId: string; tone: 'warn' | 'info'; zh: string; en: string; prompt?: { zh: string; en: string }; href?: string }

/** V1.0 阶段 2 · 丙 #15 / #16 (2026-10-16): the TRESA dates RECO's rules turn on, plus the
 *  client's lease end. All optional — rows loaded before the migration (or fixtures that never
 *  carried them) leave them `undefined`, and the tasks below only fire on an explicit `null`
 *  (loaded and empty) or a value. */
export type ClientPaperwork = {
  representation_agreement_expires_at?: string | null
  info_guide_delivered_at?: string | null
  info_guide_delivery_note?: string | null
  multi_rep_consent_at?: string | null
  lease_end_date?: string | null
}
export type ClientTaskRow = { id: string; name: string; stage: ClientStage; client_role: ClientRole; representation_agreement_at: string | null; info_guide_given_at: string | null; last_contact_at: string | null; updated_at: string; area?: string | null; budget?: string | null } & ClientPaperwork

/** Whole days from today (UTC date) to a YYYY-MM-DD date; negative when past; null when unset / unparsable. */
export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null
  const t = Date.parse(date.slice(0, 10) + 'T00:00:00Z')
  if (!Number.isFinite(t)) return null
  const d0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((t - d0) / 86_400_000)
}

/** Representation agreement expiry (O. Reg. 567/05 s.13.4(1)): 30 days out it is a task, past it is a warning. */
export const AGREEMENT_EXPIRY_WARN_DAYS = 30
/** Lease end follow-ups (#16): 90 and 30 days out. The agent contacts the client themselves (CASL) — Stayloop only reminds. */
export const LEASE_END_TOUCHPOINTS = [90, 30] as const

export function clientTasks(rows: ClientTaskRow[], today = new Date()): ClientTask[] {
  const out: ClientTask[] = []
  for (const c of rows) {
    if (c.stage === 'closed') continue
    // ── #15 · representation agreement expiry ───────────────────────────────
    if (c.representation_agreement_at && c.representation_agreement_expires_at === null) {
      out.push({ id: `expiry-missing:${c.id}`, clientId: c.id, tone: 'info', zh: `${c.name}：补记代表协议的到期日（O. Reg. 567/05 s.13.4 要求协议写明生效与到期日）`, en: `${c.name}: record the representation agreement’s expiry date (O. Reg. 567/05 s.13.4 requires effective and expiry dates)`, href: '/agent/clients' })
    }
    const exp = daysUntil(c.representation_agreement_expires_at, today)
    if (exp !== null && exp < 0) {
      out.push({ id: `expired:${c.id}`, clientId: c.id, tone: 'warn', zh: `${c.name}：代表协议已于 ${c.representation_agreement_expires_at!.slice(0, 10)} 到期——续签或归档；到期后不再为 TA 做租赁工作`, en: `${c.name}: the representation agreement expired on ${c.representation_agreement_expires_at!.slice(0, 10)} — renew or archive; no leasing work after expiry`, href: '/agent/clients' })
    } else if (exp !== null && exp <= AGREEMENT_EXPIRY_WARN_DAYS) {
      out.push({ id: `expiry-soon:${c.id}`, clientId: c.id, tone: 'warn', zh: `${c.name}：代表协议 ${exp} 天后到期（${c.representation_agreement_expires_at!.slice(0, 10)}）——续签或归档`, en: `${c.name}: the representation agreement expires in ${exp} days (${c.representation_agreement_expires_at!.slice(0, 10)}) — renew or archive`, href: '/agent/clients' })
    }
    // ── #15 · Information Guide delivery record (date known, how / to whom not) ──
    if (c.info_guide_given_at && c.info_guide_delivered_at === null && !c.info_guide_delivery_note) {
      out.push({ id: `guide-delivery:${c.id}`, clientId: c.id, tone: 'info', zh: `${c.name}：补记 RECO Information Guide 的送达方式与对象（邮件 / 当面 / 链接）——只记录，送达与讲解仍由你完成`, en: `${c.name}: record how and to whom the RECO Information Guide was delivered (email / in person / link) — a record only; providing and explaining it stays with you`, href: '/agent/clients' })
    }
    // ── #16 · lease end 90 / 30 days ────────────────────────────────────────
    const le = daysUntil(c.lease_end_date, today)
    if (le !== null && le >= 0) {
      // the nearest touchpoint at or beyond today: 16 days out is the 30-day touch, not the 90-day one
      const tp = [...LEASE_END_TOUCHPOINTS].sort((x, y) => x - y).find((d) => le <= d)
      if (tp) {
        const warn = le <= 30
        out.push({ id: `lease-end-${tp}:${c.id}`, clientId: c.id, tone: warn ? 'warn' : 'info', zh: `${c.name}：租约 ${le} 天后到期（${c.lease_end_date!.slice(0, 10)}）——由你联系客户，问续约还是找房`, en: `${c.name}: lease ends in ${le} days (${c.lease_end_date!.slice(0, 10)}) — reach out yourself: renew or search again`, prompt: { zh: `帮我给客户 ${c.name} 写一条消息：租约将于 ${c.lease_end_date!.slice(0, 10)} 到期，问 TA 想续约还是找新房，我自己发。`, en: `Draft a message to my client ${c.name}: the lease ends on ${c.lease_end_date!.slice(0, 10)}; ask whether they want to renew or search again. I will send it myself.` } })
      }
    }
    if (!paperworkComplete(c)) {
      const miss = [!c.representation_agreement_at ? { zh: '书面代表协议', en: 'the written representation agreement' } : null, !c.info_guide_given_at ? { zh: 'RECO Information Guide', en: 'the RECO Information Guide' } : null].filter(Boolean) as { zh: string; en: string }[]
      const what = miss.map((m) => m.zh).join('与')
      // CJK ↔ Latin spacing, as in the rest of the UI ("记录 RECO Information Guide 的日期").
      const padded = `${/^[A-Za-z]/.test(what) ? ' ' : ''}${what}${/[A-Za-z]$/.test(what) ? ' ' : ''}`
      out.push({ id: `paper:${c.id}`, clientId: c.id, tone: 'warn', zh: `${c.name}：记录${padded}的日期（TRESA，开展租赁服务之前）`, en: `${c.name}: record the date of ${miss.map((m) => m.en).join(' and ')} (TRESA, before leasing work)`, href: '/agent/clients' })
    }
    const quiet = daysQuiet(c, today)
    if (c.stage !== 'leased' && quiet >= 7) {
      out.push({ id: `quiet:${c.id}`, clientId: c.id, tone: quiet >= 14 ? 'warn' : 'info', zh: `跟进 ${c.name}（${quiet} 天没联系）`, en: `Follow up with ${c.name} (${quiet} days quiet)`, prompt: { zh: `帮我给客户 ${c.name} 写一条跟进消息，我们 ${quiet} 天没联系了，目前阶段：${STAGES.find((s) => s.key === c.stage)?.zh ?? c.stage}。`, en: `Draft a follow-up to my client ${c.name}; we have not spoken in ${quiet} days; stage: ${c.stage}.` } })
    }
    if (c.stage === 'showing' && paperworkComplete(c)) {
      out.push({ id: `pack:${c.id}`, clientId: c.id, tone: 'info', zh: `为 ${c.name} 准备带看包`, en: `Prepare a showing pack for ${c.name}`, prompt: { zh: `帮我为客户 ${c.name} 准备带看包${c.area ? `，区域 ${c.area}` : ''}${c.budget ? `，预算 ${c.budget}` : ''}。`, en: `Prepare a showing pack for my client ${c.name}${c.area ? `, area ${c.area}` : ''}${c.budget ? `, budget ${c.budget}` : ''}.` } })
    }
    if (c.stage === 'applied') {
      out.push({ id: `applied:${c.id}`, clientId: c.id, tone: 'info', zh: `跟进 ${c.name} 的申请结果（录取由房东本人决定）`, en: `Follow up on ${c.name}'s application (the landlord decides)`, prompt: { zh: `帮我起草一条消息，向房东询问客户 ${c.name} 的申请进度。`, en: `Draft a note asking the landlord about ${c.name}'s application status.` } })
    }
  }
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'warn' ? -1 : 1))
}
