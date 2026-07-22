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

export function applyGuardrail(role: AgentRole, out: TurnOutput, lang: 'zh' | 'en' = 'zh'): GuardrailResult {
  const zh = lang === 'zh'
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
      reply += zh
        ? '\n\n⚠️ 这个理由涉及受保护特征（种族 / 国籍 / 家庭状况 / 性取向等），按安省人权法（OHRC）不能作为拒绝依据。我不会替你生成这张卡片。如果要拒绝，请给一个具体、与租住能力相关的合法理由（如收入不足、材料不全）。'
        : "\n\n⚠️ That reason involves a protected ground (race / national origin / family status / sexual orientation, etc.), which under the Ontario Human Rights Code (OHRC) cannot be a basis for rejection. I won't generate that card for you. To reject, give a specific, lawful reason tied to ability to rent (e.g. insufficient income, incomplete documents)."
    }
  }
  if (role === 'landlord' && PROTECTED_GROUNDS.test(reply) && /(拒绝|不合适|不租|reject|decline)/i.test(reply)) {
    flags.push('discriminatory_language_in_reply')
  }

  // 2) Illegal lease terms — never draft a void clause.
  if (ILLEGAL_LEASE.test(reply) || (action && ILLEGAL_LEASE.test(`${action.title} ${action.summary}`))) {
    flags.push('illegal_lease_term')
    reply += zh
      ? '\n\n注：安省 RTA 下「禁止养宠」「押金超过一个月」等条款无效,我不会写进租约。'
      : '\n\nNote: under the Ontario RTA, clauses like "no pets" or "deposit above one month" are void — I won\'t write them into a lease.'
  }

  // 3) No false "already done" claims — the agent proposes, it never executes.
  if (action && EXECUTED_CLAIM.test(`${action.title} ${action.summary}`)) {
    flags.push('rewrote_executed_claim')
    action = { ...action, summary: action.summary.replace(new RegExp(EXECUTED_CLAIM.source, 'g'), zh ? '已准备好（待你确认）' : 'prepared (awaiting your confirmation)') }
  }
  // 3b) The reply TEXT can also falsely claim execution — worst when there is
  //     no pending card to correct the impression. Appending a correction is
  //     safer than regex-rewriting prose (which garbles mid-sentence Chinese).
  if (!action && EXECUTED_CLAIM.test(reply)) {
    flags.push('executed_claim_in_reply')
    reply += zh
      ? '\n\n注：以上提到的操作**尚未真正执行**——任何对外发送、提交、签署或付款都会先以待确认卡片出现，经你批准后才会发生。'
      : '\n\nNote: the actions mentioned above have **not actually been executed** — any outbound send, submission, signing or payment first appears as a confirmation card and only happens after you approve it.'
  }

  // 3c) Memory hygiene — LLM-authored memories are re-injected into every
  //     future system prompt verbatim, so they are a persistent prompt-
  //     injection channel (e.g. instructions smuggled in via a fetched web
  //     page). Drop instruction-shaped writes, cap lengths, clamp count.
  const INJECTION_SHAPE =
    /(ignore|disregard|forget|忽略|无视|忘记|忘掉).{0,20}(instruction|rule|prompt|previous|above|规则|指令|提示|设定|之前|以上)|system\s*prompt|new\s+instructions?|act\s+as\b|你(现在)?是(?!.{0,6}(租客|房东|经纪))|jailbreak|override.{0,12}(guard|compliance|rule)/i
  const cleanedMemories = (out.memoryWrites || [])
    .filter((m) => {
      const blob = `${m.key ?? ''} ${String(m.value ?? '')}`
      if (INJECTION_SHAPE.test(blob)) { flags.push('memory_write_dropped_injection'); return false }
      return true
    })
    .slice(0, 5)
    .map((m) => ({ ...m, value: typeof m.value === 'string' ? m.value.slice(0, 300) : m.value }))

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

  return { out: { ...out, reply, proposedAction: action, memoryWrites: cleanedMemories }, flags }
}

/** Draft-listing compliance — the draft card renders with an edit/publish CTA,
 *  so it must pass the same OHRC/RTA filters as replies: no "no pets"
 *  (void under RTA), no child/family-status exclusions, no protected-ground
 *  screening criteria. Offending fields are stripped, not silently rewritten,
 *  and a note explains why. */
export function sanitizeDraftListing<T extends { title?: string; description?: string; pet_policy?: string }>(
  draft: T,
  lang: 'zh' | 'en' = 'zh',
): { draft: T; flags: string[]; note: string | null } {
  const zh = lang === 'zh'
  const flags: string[] = []
  const out = { ...draft }
  const NO_PETS = /(禁止养宠|不(允许|得|可)养宠|no[\s-]?pets?\b|pets?\s+not\s+allowed)/i
  const NO_KIDS = /(不(允许|接受|租)(有)?(小孩|孩子|儿童|家庭)|no\s+(children|kids|families))/i
  for (const field of ['title', 'description', 'pet_policy'] as const) {
    const v = out[field]
    if (typeof v !== 'string' || !v) continue
    if (NO_KIDS.test(v) || PROTECTED_GROUNDS.test(v)) {
      flags.push(`draft_listing_protected_ground_${field}`)
      delete out[field]
    } else if (NO_PETS.test(v)) {
      flags.push(`draft_listing_illegal_term_${field}`)
      if (field === 'pet_policy') out.pet_policy = zh
        ? '宠物友好政策待定（安省 RTA 下"禁止养宠"条款无效）'
        : 'Pet policy to be confirmed ("no pets" clauses are void under the Ontario RTA)'
      else delete out[field]
    }
  }
  const note = flags.length
    ? (zh
        ? '注：草稿中涉及 OHRC 受保护特征或 RTA 无效条款（如"禁止养宠"/排除家庭）的内容已被移除——这些不能出现在房源信息里。'
        : 'Note: content in the draft touching OHRC protected grounds or RTA-void clauses (e.g. "no pets" / excluding families) has been removed — these cannot appear in listing information.')
    : null
  return { draft: out, flags, note }
}
