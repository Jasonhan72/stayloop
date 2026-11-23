// Who prepared a screening, when that was an agent (V0.9, 2026-11-22).
//
// An agent who screens for a landlord client hands the report on; until now nothing on it said who
// had prepared it. The line shows what the public directory already shows for any RECO-verified
// agent — registered name, the one permitted descriptor, the employing brokerage, the registration
// number (TRESA advertising: the name is never shown without the brokerage) — and nothing else:
// no phone, no e-mail, no rating.
//
// Decided server-side (app/api/agents/attribution): a screening carries the line when
//   · it was recorded under a client delegation → the delegate, or
//   · its owner is an account that is an agent and NOT a landlord (an account wearing both hats
//     may have run it as either, and the row does not say which — then there is no line).
// Only while the registration is current.
import { categoryLabel, type AgentCategory } from '@/lib/agentProfile'

export type AgentAttribution = {
  name: string
  category: AgentCategory
  brokerage_name: string
  reco_number: string
  /** the agent's public page, when they have opened one */
  slug: string | null
  /** 'delegation' = recorded under a landlord client's delegation; 'own' = the agent's own screening */
  via: 'delegation' | 'own'
}

export function isAgentAttribution(v: unknown): v is AgentAttribution {
  if (!v || typeof v !== 'object') return false
  const a = v as Record<string, unknown>
  return typeof a.name === 'string' && !!a.name.trim() && typeof a.brokerage_name === 'string' && typeof a.reco_number === 'string'
    && (a.via === 'delegation' || a.via === 'own') && (a.slug === null || typeof a.slug === 'string')
}

/** "Mia Chen，销售代表 · Avion Realty Inc., Brokerage · RECO 注册号 1234567" */
export function attributionLine(a: AgentAttribution, zh: boolean): string {
  const who = `${a.name}${zh ? '，' : ', '}${categoryLabel(a.category, zh ? 'zh' : 'en')}`
  const reg = zh ? `RECO 注册号 ${a.reco_number}` : `RECO registration ${a.reco_number}`
  return [who, a.brokerage_name.trim(), reg].filter(Boolean).join(' · ')
}

export function attributionLead(a: AgentAttribution, zh: boolean): string {
  return a.via === 'delegation'
    ? (zh ? '本报告由经纪受房东客户委托准备' : 'Prepared by an agent under a landlord client’s delegation')
    : (zh ? '本报告由经纪准备' : 'Prepared by an agent')
}
