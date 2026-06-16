// Agent spine — Compliance Guardrail (architecture §09 #08).
// The DETERMINISTIC backstop that every Agent/AI output passes through before
// it reaches the user. The LLM is also instructed to obey these rules, but the
// guardrail is the non-negotiable filter that does not depend on the model
// behaving. It rejects discrimination, over-reach, illegal lease terms, and
// any output that claims a key action was executed (actions must be PROPOSED).
import type { AgentRole, MemoryItem } from './types'

export type ProposedAction = {
  action_type: string
  title: string
  summary: string
  recipient_label?: string | null
  data_scope: string[]
  excluded_data: string[]
  risk_level: 'low' | 'medium' | 'high'
}

export type TurnOutput = {
  reply: string
  memoryWrites: MemoryItem[]
  proposedAction: ProposedAction | null
  nextStage: string | null
}

// OHRC / RTA protected grounds — a decision must NEVER rest on these.
const PROTECTED_GROUNDS =
  /(种族|肤色|国籍|来源国|原籍|民族|血统|宗教|信仰|家庭状况|有(没有)?(孩子|小孩|子女)|怀孕|性取向|同性|残疾|残障|年龄|婚姻状况|未婚|已婚|低保|社会援助|race|ethnic|national origin|religio|creed|family status|children|pregnan|sexual orientation|disabilit|marital status|social assistance)/i

// Phrases that falsely claim a key action already happened — actions must be
// proposed as approval cards, never reported as done by the agent itself.
const EXECUTED_CLAIM =
  /(已(经)?(发送|提交|分享|签署|签好|扣款|付款|批准|拒绝|预约|下单|升级))|(已为你(发送|提交|分享|签|扣))/

// Lease clauses that are void/illegal in Ontario.
const ILLEGAL_LEASE =
  /(禁止养宠|不(允许|得)养宠|no[\s-]?pets?|不(允许|接受)(小孩|孩子|儿童)|no children|押金(超过|高于)一个月|damage deposit)/i

const KEY_ACTION =
  /(share|submit|sign|payment|pay|tier_upgrade|reject|decline|approve|send_message|schedule)/i

export type GuardrailResult = { out: TurnOutput; flags: string[] }

export function applyGuardrail(role: AgentRole, out: TurnOutput): GuardrailResult {
  const flags: string[] = []
  let reply = out.reply
  let action = out.proposedAction

  // 1) Discrimination — block any rejection/decision that rests on a protected
  //    ground. Applies most sharply to the landlord, but holds for every role.
  if (action) {
    const blob = `${action.title} ${action.summary}`
    const isRejection = /(reject|decline)/i.test(action.action_type) || /(拒绝|不合适|婉拒|淘汰)/.test(blob)
    if (isRejection && PROTECTED_GROUNDS.test(blob)) {
      flags.push('blocked_discriminatory_rejection')
      action = null
      reply +=
        '\n\n⚠️ 这个理由涉及受保护特征（种族 / 国籍 / 家庭状况 / 性取向等），按安省人权法（OHRC）不能作为拒绝依据。我不会替你生成这张卡片。如果要拒绝，请给一个具体、与租住能力相关的合法理由（如收入不足、材料不全）。'
    }
  }
  if (role === 'landlord' && PROTECTED_GROUNDS.test(reply) && /(拒绝|不合适|不租|reject|decline)/i.test(reply)) {
    flags.push('discriminatory_language_in_reply')
  }

  // 2) Illegal lease terms — never draft a void clause.
  if (ILLEGAL_LEASE.test(reply) || (action && ILLEGAL_LEASE.test(`${action.title} ${action.summary}`))) {
    flags.push('illegal_lease_term')
    reply +=
      '\n\n注：安省 RTA 下「禁止养宠」「押金超过一个月」等条款无效,我不会写进租约。'
  }

  // 3) No false "already done" claims — the agent proposes, it never executes.
  if (action && EXECUTED_CLAIM.test(`${action.title} ${action.summary}`)) {
    flags.push('rewrote_executed_claim')
    action = { ...action, summary: action.summary.replace(EXECUTED_CLAIM, '准备好（待你确认）') }
  }

  // 4) Over-reach — sensitive raw fields can never be in an outbound data_scope.
  if (action) {
    const SENSITIVE = /(原始证件|完整(银行|流水)|full bank|raw (id|document)|SIN|社会保险号|social insurance)/i
    const leaked = action.data_scope.filter((s) => SENSITIVE.test(s))
    if (leaked.length) {
      flags.push('overreach_scope_demoted')
      action = {
        ...action,
        data_scope: action.data_scope.filter((s) => !SENSITIVE.test(s)),
        excluded_data: [...action.excluded_data, ...leaked],
      }
    }
  }

  // 5) Sanity — a proposed key action must carry a recipient and a scope.
  if (action && KEY_ACTION.test(action.action_type) && action.data_scope.length === 0 && !action.recipient_label) {
    // Not necessarily wrong (e.g. a self-scoped schedule), but worth flagging.
    flags.push('action_missing_scope')
  }

  return { out: { ...out, reply, proposedAction: action }, flags }
}
