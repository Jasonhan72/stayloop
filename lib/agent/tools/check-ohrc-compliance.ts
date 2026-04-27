// -----------------------------------------------------------------------------
// Tool: check_ohrc_compliance
// -----------------------------------------------------------------------------
// Scan a listing description for Ontario Human Rights Code violations.
// Pure regex / keyword check — fast, free, deterministic. Used by Nova
// before publishing a listing.
// -----------------------------------------------------------------------------

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

interface ComplianceInput {
  description_en?: string
  description_zh?: string
  title_en?: string
  title_zh?: string
}

interface ComplianceWarning {
  code: string
  severity: 'critical' | 'high' | 'medium'
  matched_text: string
  field: string
  rationale_en: string
  rationale_zh: string
}

interface ComplianceOutput {
  passes: boolean
  warnings: ComplianceWarning[]
}

// Regex catalogue. Each entry: pattern + violation code + rationale.
const RULES = [
  {
    pattern: /\b(young\s+professional|youthful|no\s+children|no\s+kids|adults\s+only|mature\s+only|family\s+with\s+(no\s+)?children)/i,
    code: 'family_status',
    severity: 'critical' as const,
    rationale_en: 'Restricting based on age or family status (children, age) violates OHRC §21(1).',
    rationale_zh: '基于年龄或家庭状况（有无小孩）的限制违反安省人权法第21(1)条。',
  },
  {
    pattern: /\b(christian|muslim|jewish|hindu|buddhist|catholic|non[-\s]?religious)\s+(only|preferred|tenant|household)/i,
    code: 'religion',
    severity: 'critical' as const,
    rationale_en: 'Religion-based preference violates OHRC.',
    rationale_zh: '基于宗教信仰的偏好违反安省人权法。',
  },
  {
    pattern: /\b(white|black|asian|chinese|indian|hispanic|latino)\s+(only|preferred|household|tenant)/i,
    code: 'race_ethnicity',
    severity: 'critical' as const,
    rationale_en: 'Race or ethnic origin preference violates OHRC.',
    rationale_zh: '基于种族或族裔的偏好违反安省人权法。',
  },
  {
    pattern: /\b(no\s+welfare|no\s+social\s+assistance|employment\s+income\s+only|no\s+OW|no\s+ODSP)/i,
    code: 'source_of_income',
    severity: 'high' as const,
    rationale_en: 'Excluding lawful source of income (welfare, ODSP) is a protected ground under OHRC.',
    rationale_zh: '排除合法收入来源（社会援助、ODSP）违反安省人权法（受保护类别）。',
  },
  {
    pattern: /\b(single\s+female|female\s+only|male\s+only|gay\s+(friendly|only)?|straight\s+only)/i,
    code: 'sex_or_orientation',
    severity: 'critical' as const,
    rationale_en: 'Sex or sexual orientation preference violates OHRC.',
    rationale_zh: '基于性别或性取向的偏好违反安省人权法。',
  },
  {
    pattern: /\b(no\s+disability|able[-\s]?bodied|no\s+wheelchair|no\s+service\s+animal)/i,
    code: 'disability',
    severity: 'critical' as const,
    rationale_en: 'Disability-based exclusion violates OHRC and AODA.',
    rationale_zh: '基于残疾的排除违反安省人权法及AODA。',
  },
  {
    pattern: /\b(只\s*限|仅\s*限|只\s*要)\s*(年轻|单身|无\s*小孩|无\s*孩子|男|女|基督徒|穆斯林|华人|白人)/,
    code: 'cn_protected_group',
    severity: 'critical' as const,
    rationale_en: 'Chinese-language exclusionary phrasing detected (age/family/sex/religion/race).',
    rationale_zh: '检测到中文限定性措辞（年龄/家庭/性别/宗教/种族），违反安省人权法。',
  },
  {
    pattern: /\b(no\s+(?:large\s+)?dogs|no\s+pets\s+allowed|pet[-\s]?free)/i,
    code: 'pet_policy_note',
    severity: 'medium' as const,
    rationale_en:
      'Pet restrictions in advertising are NOT illegal but Ontario s.14 lease pet clauses are unenforceable. Consider phrasing as "small pets discussed".',
    rationale_zh: '广告中限制宠物本身不违法，但安省租约中的禁宠条款不可强制执行。建议改为"小型宠物可商议"。',
  },
]

const tool: CapabilityTool<ComplianceInput, ComplianceOutput> = {
  name: 'check_ohrc_compliance',
  version: '1.0.0',
  description:
    'Scan a Canadian rental listing description for Ontario Human Rights Code (OHRC) violations: family status, religion, race, source of income, sex / orientation, disability — plus Chinese-language exclusionary phrasing. Pure regex, no AI. Use BEFORE publishing a listing. Returns warnings with rationale; landlord must remove flagged language. ' +
    '扫描房源描述是否违反安省人权法（家庭状况、宗教、种族、收入来源、性别/性取向、残疾），含中文限定语规则。纯正则，无 AI。发布前必查。',
  inputSchema: {
    type: 'object',
    properties: {
      description_en: { type: 'string' },
      description_zh: { type: 'string' },
      title_en: { type: 'string' },
      title_zh: { type: 'string' },
    },
  },
  needsApproval: false,
  handler: async (input) => {
    const fields: Array<[string, string | undefined]> = [
      ['title_en', input.title_en],
      ['title_zh', input.title_zh],
      ['description_en', input.description_en],
      ['description_zh', input.description_zh],
    ]
    const warnings: ComplianceWarning[] = []
    for (const [field, text] of fields) {
      if (!text) continue
      for (const rule of RULES) {
        const m = text.match(rule.pattern)
        if (m) {
          warnings.push({
            code: rule.code,
            severity: rule.severity,
            field,
            matched_text: m[0].slice(0, 100),
            rationale_en: rule.rationale_en,
            rationale_zh: rule.rationale_zh,
          })
        }
      }
    }
    const passes = !warnings.some((w) => w.severity === 'critical' || w.severity === 'high')
    return { passes, warnings }
  },
}

registerTool(tool)
export default tool
