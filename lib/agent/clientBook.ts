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
export function clientTasks(rows: { id: string; name: string; stage: ClientStage; client_role: ClientRole; representation_agreement_at: string | null; info_guide_given_at: string | null; last_contact_at: string | null; updated_at: string; area?: string | null; budget?: string | null }[], today = new Date()): ClientTask[] {
  const out: ClientTask[] = []
  for (const c of rows) {
    if (c.stage === 'closed') continue
    if (!paperworkComplete(c)) {
      const miss = [!c.representation_agreement_at ? { zh: '书面代表协议', en: 'the written representation agreement' } : null, !c.info_guide_given_at ? { zh: 'RECO Information Guide', en: 'the RECO Information Guide' } : null].filter(Boolean) as { zh: string; en: string }[]
      out.push({ id: `paper:${c.id}`, clientId: c.id, tone: 'warn', zh: `${c.name}：记录${miss.map((m) => m.zh).join('与')}的日期（TRESA，开展租赁服务之前）`, en: `${c.name}: record the date of ${miss.map((m) => m.en).join(' and ')} (TRESA, before leasing work)`, href: '/agent/clients' })
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
