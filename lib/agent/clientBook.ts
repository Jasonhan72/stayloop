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
