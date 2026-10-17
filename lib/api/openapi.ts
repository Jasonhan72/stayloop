// Open API tier 1 · OpenAPI 3.1 document (stage 5 · 2026-10-16,
// design/open-api-contract-2026-10.md「端点」).
//
// Hand-written so the document is the one place the public contract is spelled
// out: /api/v1/openapi.json serves OPENAPI, the docs page renders
// OPENAPI_ENDPOINTS, the MCP tool schemas (G17) mirror the same request
// shapes. Summaries and descriptions are bilingual (中文 / English in one
// string). No Next import — plain data.
import { API_VERSION, RULES_AS_OF, BOUNDARY } from '@/lib/api/v1Http'
import { V1_LIMITS } from '@/lib/api/v1Limits'

export const API_BASE_URL = 'https://www.stayloop.ai/api/v1'

type Schema = Record<string, unknown>

export type OpenAPIOperation = {
  operationId: string
  summary: string
  description: string
  tags?: string[]
  parameters?: Record<string, unknown>[]
  requestBody?: Record<string, unknown>
  responses: Record<string, unknown>
  'x-boundary': { zh: string; en: string }
}

export type OpenAPIObject = {
  openapi: '3.1.0'
  info: { title: string; version: string; summary?: string; description: string; termsOfService: string; contact: { email: string; url: string }; 'x-rules-as-of': string }
  servers: { url: string; description: string }[]
  tags: { name: string; description: string }[]
  paths: Record<string, Partial<Record<'get' | 'post', OpenAPIOperation>>>
  components: { schemas: Record<string, Schema> }
  'x-boundary': { zh: string; en: string }
  'x-rate-limit': { per_key_per_hour: number; per_endpoint_per_hour: number; key: string }
}

// ── Shared schemas ──────────────────────────────────────────────────────────

const Bi: Schema = { type: 'object', required: ['zh', 'en'], properties: { zh: { type: 'string' }, en: { type: 'string' } }, additionalProperties: false }
const PROVINCE_CODES = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'PE', 'NL', 'YT', 'NT', 'NU']
const ProvinceCode: Schema = { type: 'string', enum: PROVINCE_CODES, default: 'ON', description: '省 / 地区代码，缺省 ON · Province or territory code, defaults to ON' }
const Money: Schema = { type: 'number', minimum: 0, maximum: 1_000_000 }
const Text: Schema = { type: 'string', maxLength: 2000 }
const DateStr: Schema = { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2027-01-01' }
const Severity: Schema = { type: 'string', enum: ['block', 'warn', 'info'] }

const Envelope: Schema = {
  type: 'object',
  required: ['as_of', 'boundary'],
  properties: {
    as_of: { type: 'string', format: 'date', description: '规则快照日 · Rule snapshot date', example: RULES_AS_OF },
    boundary: { ...Bi, description: '固定边界句 · Fixed boundary statement', example: BOUNDARY },
  },
}

const ErrorBody: Schema = {
  type: 'object',
  required: ['error', 'message'],
  properties: {
    error: { type: 'string', enum: ['invalid_json', 'invalid_input', 'unsupported_province', 'not_available', 'rate_limited', 'method_not_allowed'] },
    message: { type: 'string', description: '写明哪个字段 · Names the field at fault' },
    retry_after: { type: 'integer', description: '只在 429 出现（秒）· Only on 429, seconds' },
  },
  additionalProperties: false,
  example: { error: 'invalid_input', message: 'effective: must be a date formatted YYYY-MM-DD' },
}

const Finding: Schema = {
  type: 'object',
  required: ['rule_id', 'rule', 'severity', 'statute', 'message'],
  properties: {
    rule_id: { type: 'string', example: 'RTA-106-deposit-cap' },
    rule: { type: 'string', description: '与 rule_id 相同（旧字段名，保留）· Same as rule_id (legacy name, kept)' },
    severity: Severity,
    statute: { type: 'string', example: 'RTA s.106(2)' },
    message: Bi,
    source_url: { type: 'string', format: 'uri', description: '安省 → stayloop.ai/rules#id；外省 → 该省官方条文页 · Ontario → stayloop.ai/rules#id; other provinces → the official source page' },
    url: { type: 'string', format: 'uri', description: '与 source_url 相同（旧字段名）· Same as source_url (legacy name)' },
  },
}

const ComplianceResult: Schema = {
  allOf: [Envelope, {
    type: 'object',
    required: ['province', 'passed', 'findings', 'checked'],
    properties: {
      province: ProvinceCode,
      passed: { type: 'boolean', description: '没有 block 级命中 · No block-severity finding' },
      findings: { type: 'array', items: Finding },
      checked: { type: 'array', items: { type: 'string' }, description: '本检查在该省能命中的规则 id · Rule ids this check can raise for the province' },
      notes: { ...Bi, description: '外省时说明检查范围 · Scope note for provinces outside Ontario' },
    },
  }],
}

const RuleOntario: Schema = {
  type: 'object',
  required: ['id', 'area', 'statute', 'title', 'summary', 'severity', 'since'],
  properties: {
    id: { type: 'string', example: 'RTA-106-deposit-cap' },
    area: { type: 'string', enum: ['listing', 'lease', 'screening', 'notice', 'agent', 'renewal', 'tenancy', 'maintenance'] },
    statute: { type: 'string', example: 'RTA s.106(2)' },
    title: Bi, summary: Bi, severity: Severity,
    since: { type: 'string', format: 'date' },
  },
}
const RuleProvince: Schema = {
  type: 'object',
  required: ['id', 'topic', 'statute', 'source_url', 'title', 'summary'],
  properties: {
    id: { type: 'string', example: 'QC-deposit', description: '`<省代码>-<topic>` · `<CODE>-<topic>`' },
    topic: { type: 'string', enum: ['statute', 'tribunal', 'lease-form', 'deposit', 'pet-deposit', 'key-or-other-deposits', 'advance-rent', 'application-fee', 'pet-ban-allowed', 'rent-increase', 'human-rights', 'privacy-law', 'lease-end', 'adverse-decision'] },
    statute: { type: 'string', description: '官方引注 · Official citation', example: 'Civil Code of Québec, art. 1904 (2nd para.) and art. 1893' },
    source_url: { type: 'string', format: 'uri' },
    title: Bi, summary: Bi,
  },
}

const RulesResult: Schema = {
  allOf: [Envelope, {
    type: 'object',
    required: ['province', 'province_name', 'rules'],
    properties: { province: ProvinceCode, province_name: Bi, rules: { type: 'array', items: { oneOf: [RuleOntario, RuleProvince] } } },
  }],
}

const GuidelineResult: Schema = {
  allOf: [Envelope, {
    type: 'object',
    required: ['province', 'effective', 'year', 'pct', 'published', 'cap', 'n1_deadline', 'notice_days'],
    properties: {
      province: { type: 'string', const: 'ON' },
      effective: DateStr,
      year: { type: 'integer', description: '涨租生效年份 · Year the increase takes effect' },
      pct: { type: 'number', description: '该年指导比例（%）· Guideline percentage for that year' },
      published: { type: 'boolean', description: 'false = 该年尚未公布，pct 是最近一年的值 · false = not yet published, pct is the latest known figure' },
      cap: { type: 'number', description: '法定封顶（%）· Statutory cap' },
      n1_deadline: { type: 'string', format: 'date', description: 'N1 最晚送达日（生效日前 90 天）· Latest N1 service date (90 days before)' },
      notice_days: { type: 'integer' },
    },
  }],
}

const N4Result: Schema = {
  allOf: [Envelope, {
    type: 'object',
    required: ['province', 'served', 'method', 'deemed_served', 'earliest_termination', 'termination_days', 'mail_days'],
    properties: {
      province: { type: 'string', const: 'ON' },
      served: DateStr,
      method: { type: 'string', enum: ['hand', 'mail', 'email'] },
      deemed_served: { type: 'string', format: 'date', description: '邮寄 +5 天 · Mail adds five deemed-service days' },
      earliest_termination: { type: 'string', format: 'date' },
      termination_days: { type: 'integer' },
      mail_days: { type: 'integer' },
    },
  }],
}

const LatePaymentResult: Schema = {
  allOf: [Envelope, {
    type: 'object',
    required: ['province', 'as_of_date', 'late', 'persistent', 'window', 'definition'],
    properties: {
      province: { type: 'string', const: 'ON' },
      as_of_date: DateStr,
      late: { type: 'array', items: { type: 'string', format: 'date' }, description: '迟付超过 7 天的账期 · Due dates paid (or unpaid) more than 7 days late' },
      persistent: { type: 'boolean' },
      window: { oneOf: [{ type: 'array', items: { type: 'string', format: 'date' }, minItems: 2, maxItems: 2 }, { type: 'null' }], description: '构成持续迟付的首末账期 · First and last due dates of the qualifying window' },
      definition: { type: 'object', properties: { grace_days: { type: 'integer' }, count: { type: 'integer' }, window_months: { type: 'integer' } } },
    },
  }],
}

const BenchmarkFigure: Schema = {
  type: 'object',
  required: ['source', 'kind', 'area', 'period', 'avg', 'label'],
  properties: {
    source: { type: 'string', enum: ['cmhc', 'statcan'] },
    kind: { type: 'string', enum: ['purpose_built', 'condo', 'asking'] },
    area: { type: 'string', example: 'Zone 1 - Toronto (Central)' },
    period: { type: 'string', example: '2025-10' },
    avg: { type: 'number' },
    prev_avg: { type: ['number', 'null'] },
    quality: { type: ['string', 'null'], description: 'CMHC 可靠性等级 a–d · CMHC reliability code a–d' },
    label: Bi,
  },
}

const RentBenchmarkResult: Schema = {
  allOf: [Envelope, {
    type: 'object',
    required: ['province', 'bedrooms', 'type', 'benchmark', 'attribution'],
    properties: {
      province: { type: 'string', const: 'ON' },
      area: { type: ['string', 'null'] },
      bedrooms: { type: 'integer', description: 'CMHC 户型档：0 开间 · 1 · 2 · 3 = 三房及以上 · CMHC bucket: 0 studio · 1 · 2 · 3 = three or more' },
      type: { type: 'string', enum: ['apartment', 'condo', 'townhouse', 'house'] },
      benchmark: BenchmarkFigure,
      alt: { type: 'object', description: '同区域另一种 CMHC 口径 · The other CMHC kind for the same area' },
      asking: { type: 'object', description: '统计局季度挂牌均租 · StatCan quarterly asking rent' },
      history: { type: 'array', items: { type: 'object', properties: { period: { type: 'string' }, avg: { type: 'number' } } } },
      attribution: { ...Bi, description: '必填署名句，展示数字处必须显示 · Required attribution, must be shown wherever the figure is printed' },
    },
  }],
}

const ListingComplianceInput: Schema = {
  type: 'object',
  properties: {
    province: ProvinceCode,
    monthly_rent: { ...Money, example: 2800 },
    deposit: { ...Money, example: 2800 },
    key_deposit: Money,
    application_fee: Money,
    pets_allowed: { type: 'string', enum: ['yes', 'no', 'restricted'] },
    title: Text,
    description: Text,
    schedule_b: Text,
  },
  additionalProperties: false,
}

const LeaseTermsInput: Schema = {
  type: 'object',
  properties: {
    province: ProvinceCode,
    rent_amount: { ...Money, example: 2800 },
    deposit_amount: { ...Money, example: 2800 },
    form_type: { type: 'string', maxLength: 40, description: 'ontario_standard | trreb | imported | other', example: 'ontario_standard' },
    schedule_b: Text,
    start_date: DateStr,
    end_date: DateStr,
  },
  additionalProperties: false,
}

const LatePaymentInput: Schema = {
  type: 'object',
  required: ['periods'],
  properties: {
    periods: {
      type: 'array', minItems: 1, maxItems: 120,
      items: { type: 'object', required: ['due_date'], properties: { due_date: DateStr, paid_at: { type: ['string', 'null'], description: 'YYYY-MM-DD 或 ISO 日期时间；null = 未付 · Date or ISO date-time; null = unpaid' } }, additionalProperties: false },
    },
    as_of: { ...DateStr, description: '判定日，缺省今天 · Evaluation date, defaults to today' },
  },
  additionalProperties: false,
}

// ── Examples ────────────────────────────────────────────────────────────────

const EX = {
  rules: { province: 'QC', province_name: { zh: '魁北克省', en: 'Quebec' }, as_of: RULES_AS_OF, rules: [{ id: 'QC-deposit', topic: 'deposit', statute: 'Civil Code of Québec, art. 1904 (2nd para.) and art. 1893', source_url: 'https://www.legisquebec.gouv.qc.ca/en/document/cs/CCQ-1991', title: { zh: '押金', en: 'Security deposit' }, summary: { zh: '房东不能收取任何押金……', en: 'A landlord may not require any deposit…' } }], boundary: BOUNDARY },
  compliance: { province: 'ON', passed: false, findings: [{ rule_id: 'RTA-106-deposit-cap', rule: 'RTA-106-deposit-cap', severity: 'block', statute: 'RTA s.106(2)', message: { zh: '押金 $3,000 超过一个月租金 $2,800。', en: "Deposit $3,000 exceeds one month's rent $2,800." }, source_url: 'https://www.stayloop.ai/rules#RTA-106-deposit-cap', url: 'https://www.stayloop.ai/rules#RTA-106-deposit-cap' }], checked: ['RTA-106-deposit-cap', 'OREG516-17-key-deposit', 'RTA-14-no-pet-clause', 'RTA-134-no-fees'], as_of: RULES_AS_OF, boundary: BOUNDARY },
  lease: { province: 'ON', passed: true, findings: [{ rule_id: 'OREG9-18-standard-lease', rule: 'OREG9-18-standard-lease', severity: 'warn', statute: 'O. Reg. 9/18', message: { zh: 'TRREB Form 400 是要约；正式租约仍须使用安省标准租约。', en: 'TRREB Form 400 is an offer; the tenancy itself must use the Ontario standard lease.' }, source_url: 'https://www.stayloop.ai/rules#OREG9-18-standard-lease', url: 'https://www.stayloop.ai/rules#OREG9-18-standard-lease' }], checked: ['RTA-106-deposit-cap', 'OREG9-18-standard-lease', 'RTA-14-no-pet-clause', 'RTA-36-1-tenant-ac', 'RTA-134-no-fees'], as_of: RULES_AS_OF, boundary: BOUNDARY },
  guideline: { province: 'ON', effective: '2027-01-01', year: 2027, pct: 1.9, published: true, cap: 2.5, n1_deadline: '2026-10-03', notice_days: 90, as_of: RULES_AS_OF, boundary: BOUNDARY },
  n4: { province: 'ON', served: '2026-11-02', method: 'mail', deemed_served: '2026-11-07', earliest_termination: '2026-11-14', termination_days: 7, mail_days: 5, as_of: RULES_AS_OF, boundary: BOUNDARY },
  late: { province: 'ON', as_of_date: '2026-10-16', late: ['2026-04-01', '2026-06-01', '2026-08-01'], persistent: true, window: ['2026-04-01', '2026-08-01'], definition: { grace_days: 7, count: 3, window_months: 6 }, as_of: RULES_AS_OF, boundary: BOUNDARY },
  benchmark: { province: 'ON', area: 'Liberty Village', bedrooms: 1, type: 'condo', benchmark: { source: 'cmhc', kind: 'condo', area: 'Toronto', period: '2025-10', avg: 2531, prev_avg: 2498, quality: 'a', label: { zh: 'CMHC · Toronto · 2025 年 10 月', en: 'CMHC · Toronto · October 2025' } }, alt: { kind: 'purpose_built', area: 'Zone 1 - Toronto (Central)', period: '2025-10', avg: 2042, quality: 'a' }, asking: { period: '2026-04', avg: 2310, prev_avg: 2345 }, attribution: { zh: '来源：加拿大按揭与住房公司（CMHC）租赁市场调查，2025 年 10 月（出租公寓单元）', en: 'Source: Canada Mortgage and Housing Corporation (CMHC), Rental Market Survey, October 2025 (rental condominium apartments)' }, as_of: RULES_AS_OF, boundary: BOUNDARY },
}

// ── Operations ──────────────────────────────────────────────────────────────

const ERRORS = {
  '400': { description: 'invalid_json · invalid_input · unsupported_province', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  '429': { description: 'rate_limited（带 Retry-After）· rate_limited (with Retry-After)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
}
const ok = (schemaRef: string, example: unknown, description: string) => ({
  description,
  headers: {
    'x-api-version': { schema: { type: 'string' }, description: `API 版本（日期）· API version (date) — ${API_VERSION}` },
    'X-RateLimit-Limit': { schema: { type: 'integer' }, description: '每键每小时上限 · Per-key hourly limit' },
  },
  content: { 'application/json': { schema: { $ref: schemaRef }, example } },
})
const provinceQuery = { name: 'province', in: 'query', required: false, schema: ProvinceCode }
const op = (o: Omit<OpenAPIOperation, 'x-boundary' | 'tags'> & { tags?: string[] }): OpenAPIOperation => ({ tags: ['tier-1'], ...o, 'x-boundary': BOUNDARY })

export const OPENAPI: OpenAPIObject = {
  openapi: '3.1.0',
  info: {
    title: 'Stayloop API · 第一档 / Tier 1',
    version: API_VERSION,
    summary: '加拿大租房规则、安省日期算术与开放授权的租金基准 · Canadian tenancy rules, Ontario date arithmetic and openly licensed rent benchmarks',
    description: [
      '第一档 = Stayloop 自己的确定性规则、日期算术与开放授权的租金基准（CMHC / 加拿大统计局）。无需密钥，不接受也不存储任何个人信息；每个响应带 `as_of`（规则快照日）与 `boundary`（边界句）。',
      'Tier 1 = Stayloop’s own deterministic rules, date arithmetic and openly licensed rent benchmarks (CMHC / Statistics Canada). No key required; no personal information is accepted or stored; every response carries `as_of` (rule snapshot date) and `boundary`.',
      `限流：按 \`X-Client-Id\`（可选、自报、≤${V1_LIMITS.clientIdMaxLen} 字符）或 IP 每小时 ${V1_LIMITS.perKeyPerHour} 次，每端点全站每小时 ${V1_LIMITS.perEndpointPerHour} 次。· Rate limit: ${V1_LIMITS.perKeyPerHour}/hour per \`X-Client-Id\` (optional, self-declared, ≤${V1_LIMITS.clientIdMaxLen} chars) or IP, ${V1_LIMITS.perEndpointPerHour}/hour per endpoint site-wide.`,
      '同一套函数也通过 MCP 端点 `POST https://www.stayloop.ai/api/mcp` 提供。· The same functions are exposed as MCP tools at `POST https://www.stayloop.ai/api/mcp`.',
    ].join('\n\n'),
    termsOfService: 'https://www.stayloop.ai/terms',
    contact: { email: 'hello@stayloop.ai', url: 'https://www.stayloop.ai/stayloop-api' },
    'x-rules-as-of': RULES_AS_OF,
  },
  servers: [{ url: API_BASE_URL, description: 'Production' }],
  tags: [{ name: 'tier-1', description: '第一档 · 免费 · 无需密钥 · Tier 1 · free · no key' }],
  'x-boundary': BOUNDARY,
  'x-rate-limit': { per_key_per_hour: V1_LIMITS.perKeyPerHour, per_endpoint_per_hour: V1_LIMITS.perEndpointPerHour, key: 'X-Client-Id header (optional) or client IP' },
  paths: {
    '/rules': {
      get: op({
        operationId: 'listRules',
        summary: '列出一个省的租房规则 · List a province’s tenancy rules',
        description: '安省：Stayloop 执行或说明的全部规则（编号、法条、严重度、生效日）。其他 12 个省 / 地区：已核实的官方事实逐项展开（适用法律、审裁机构、租约格式、押金、宠物押金、钥匙押金、预收租金、申请费、禁宠、涨租、人权法、隐私法、租期结束、拒绝告知），每条带引注与官方链接。· Ontario: every rule Stayloop enforces or explains (id, statute, severity, since). The other 12 provinces and territories: their verified official facts, one rule per topic, each with its citation and source URL.',
        parameters: [provinceQuery],
        responses: { '200': ok('#/components/schemas/RulesResult', EX.rules, '规则列表 · Rule list'), ...ERRORS },
      }),
    },
    '/listings/compliance': {
      post: op({
        operationId: 'checkListingCompliance',
        summary: '核对房源条款 · Check listing terms',
        description: '按省份核对押金 / 钥匙押金 / 禁宠 / 申请费 / 宠物与清洁押金 / 预收租金等条款。安省走 RTA / O. Reg. 516/06；其他省只核押金类与费用类（响应里的 `notes` 写明范围）。`passed` = 没有 block 级命中。文本字段只用于检查，不落库。· Checks deposit / key deposit / pet ban / application fee / pet & cleaning deposit / rent-in-advance terms for the province. Ontario uses the RTA / O. Reg. 516/06; other provinces cover deposits and fees only (`notes` says so). `passed` = no block-severity finding. Text fields are checked and discarded.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ListingComplianceInput' }, example: { province: 'ON', monthly_rent: 2800, deposit: 3000, pets_allowed: 'restricted', description: 'Bright 1+den, no application fee.' } } } },
        responses: { '200': ok('#/components/schemas/ComplianceResult', EX.compliance, '检查结果 · Check result'), ...ERRORS },
      }),
    },
    '/lease/terms-check': {
      post: op({
        operationId: 'checkLeaseTerms',
        summary: '核对租约条款 · Check lease terms',
        description: '安省：押金上限、租约格式（TRREB Form 400 只是要约）、附表 B 的禁宠 / 禁装空调 / 额外费用条款、日期顺序。其他省：押金上限 / 钥匙押金 / 预收租金三类，另核该省租约格式与日期。· Ontario: deposit cap, lease form (TRREB Form 400 is an offer), Schedule B pet-ban / AC-ban / extra-fee terms, date order. Other provinces: deposit cap, key deposit and rent in advance, plus the province’s lease form and dates.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LeaseTermsInput' }, example: { province: 'ON', rent_amount: 2800, deposit_amount: 2800, form_type: 'trreb', start_date: '2026-12-01', end_date: '2027-11-30' } } } },
        responses: { '200': ok('#/components/schemas/ComplianceResult', EX.lease, '检查结果 · Check result'), ...ERRORS },
      }),
    },
    '/guideline': {
      get: op({
        operationId: 'rentIncreaseGuideline',
        summary: '安省涨租指导比例与 N1 截止日 · Ontario rent-increase guideline and N1 deadline',
        description: '按涨租生效日所在年份取指导比例（RTA s.120；法定封顶 2.5%），并算出 N1 最晚送达日（生效日前 90 天，s.116）。未公布的年份回退到最近一年并标 `published:false`。· Guideline for the year the increase takes effect (RTA s.120; statutory cap 2.5%) and the latest N1 service date (90 days before, s.116). Unpublished years fall back to the latest figure with `published:false`.',
        parameters: [{ name: 'effective', in: 'query', required: true, schema: DateStr, description: '涨租生效日 · Date the increase takes effect' }],
        responses: { '200': ok('#/components/schemas/GuidelineResult', EX.guideline, '指导比例 · Guideline'), ...ERRORS },
      }),
    },
    '/n4/earliest-termination': {
      get: op({
        operationId: 'n4EarliestTermination',
        summary: '安省 N4 最早终止日 · Ontario N4 earliest termination date',
        description: '送达日 + 7 天（RTA s.59，2026-09-21 起），邮寄另加 5 天视为送达日。只做日期算术：不判断是否该发 N4、不填表。· Service date + 7 days (RTA s.59, since 2026-09-21); mail adds 5 deemed-service days. Date arithmetic only: no view on whether to serve, no form filling.',
        parameters: [
          { name: 'served', in: 'query', required: true, schema: DateStr, description: '送达日 · Date served' },
          { name: 'method', in: 'query', required: false, schema: { type: 'string', enum: ['hand', 'mail', 'email'], default: 'hand' } },
        ],
        responses: { '200': ok('#/components/schemas/N4Result', EX.n4, '日期 · Dates'), ...ERRORS },
      }),
    },
    '/late-payment/persistent': {
      post: op({
        operationId: 'persistentLatePayment',
        summary: '安省持续迟付判定 · Ontario persistent late payment test',
        description: '对一组账期（应付日 + 实付日，≤120 期）按 RTA s.58(1.1) 的定义判定：6 个月内 ≥3 次迟付超过 7 天。只回账期日期，不回金额；不接受姓名或地址。· Applies the RTA s.58(1.1) definition — rent more than 7 days late at least 3 times within any 6 months — to up to 120 periods (due date + paid date). Returns due dates only; takes no names or addresses.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LatePaymentInput' }, example: { periods: [{ due_date: '2026-04-01', paid_at: '2026-04-12' }, { due_date: '2026-05-01', paid_at: '2026-05-02' }, { due_date: '2026-06-01', paid_at: '2026-06-15' }, { due_date: '2026-07-01', paid_at: '2026-07-01' }, { due_date: '2026-08-01', paid_at: null }], as_of: '2026-10-16' } } } },
        responses: { '200': ok('#/components/schemas/LatePaymentResult', EX.late, '判定 · Result'), ...ERRORS },
      }),
    },
    '/rent-benchmark': {
      get: op({
        operationId: 'rentBenchmark',
        summary: '安省租金基准（CMHC / 统计局）· Ontario rent benchmark (CMHC / StatCan)',
        description: '按区域、户型、物业类型给出最具体的 CMHC 租赁市场调查均租（公寓单元优先子区域，其余按分区，回退全市 / CMA），并附统计局季度挂牌均租。CMHC 均租是在住单元的调查均值，低于新签约价。**`attribution` 必须随数字一起展示**（开放授权的署名要求）。目前只有安省；其他省份 404 `not_available`。· The most specific CMHC Rental Market Survey average for the area / bedrooms / type (condo sub-area first, else zone, falling back to city / CMA), with the StatCan quarterly asking rent. CMHC averages are occupied-stock survey means and sit below new-lease prices. **`attribution` must be shown with the figure** (licence requirement). Ontario only for now; other provinces 404 `not_available`.',
        parameters: [
          { name: 'province', in: 'query', required: false, schema: { type: 'string', enum: ['ON'], default: 'ON' } },
          { name: 'area', in: 'query', required: false, schema: { type: 'string', maxLength: 200 }, description: '社区 / 城市名（英文）· Neighbourhood or city name (English)', example: 'Liberty Village' },
          { name: 'bedrooms', in: 'query', required: false, schema: { type: 'integer', minimum: 0, maximum: 10, default: 1 } },
          { name: 'type', in: 'query', required: false, schema: { type: 'string', enum: ['apartment', 'condo', 'townhouse', 'house'], default: 'apartment' } },
        ],
        responses: { '200': ok('#/components/schemas/RentBenchmarkResult', EX.benchmark, '基准 · Benchmark'), '404': { description: 'not_available（非安省，或该户型没有数据）· not_available (not Ontario, or no row for the bedroom bucket)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }, ...ERRORS },
      }),
    },
  },
  components: {
    schemas: {
      Bi, ProvinceCode, Error: ErrorBody, Finding, Envelope,
      ComplianceResult, RulesResult, GuidelineResult, N4Result, LatePaymentResult, RentBenchmarkResult,
      ListingComplianceInput, LeaseTermsInput, LatePaymentInput,
    },
  },
}

// ── Short table for the docs page ───────────────────────────────────────────

export type OpenAPIEndpoint = { method: 'GET' | 'POST'; path: string; summary: { zh: string; en: string }; exampleCurl: string }

const B = API_BASE_URL
export const OPENAPI_ENDPOINTS: OpenAPIEndpoint[] = [
  { method: 'GET', path: '/rules', summary: { zh: '列出一个省的租房规则', en: 'List a province’s tenancy rules' }, exampleCurl: `curl "${B}/rules?province=QC"` },
  { method: 'POST', path: '/listings/compliance', summary: { zh: '核对房源条款', en: 'Check listing terms' }, exampleCurl: `curl -X POST "${B}/listings/compliance" -H "content-type: application/json" -d '{"province":"ON","monthly_rent":2800,"deposit":3000,"pets_allowed":"restricted"}'` },
  { method: 'POST', path: '/lease/terms-check', summary: { zh: '核对租约条款', en: 'Check lease terms' }, exampleCurl: `curl -X POST "${B}/lease/terms-check" -H "content-type: application/json" -d '{"province":"ON","rent_amount":2800,"deposit_amount":2800,"form_type":"trreb","start_date":"2026-12-01","end_date":"2027-11-30"}'` },
  { method: 'GET', path: '/guideline', summary: { zh: '安省涨租指导比例与 N1 截止日', en: 'Ontario rent-increase guideline and N1 deadline' }, exampleCurl: `curl "${B}/guideline?effective=2027-01-01"` },
  { method: 'GET', path: '/n4/earliest-termination', summary: { zh: '安省 N4 最早终止日', en: 'Ontario N4 earliest termination date' }, exampleCurl: `curl "${B}/n4/earliest-termination?served=2026-11-02&method=mail"` },
  { method: 'POST', path: '/late-payment/persistent', summary: { zh: '安省持续迟付判定', en: 'Ontario persistent late payment test' }, exampleCurl: `curl -X POST "${B}/late-payment/persistent" -H "content-type: application/json" -d '{"periods":[{"due_date":"2026-04-01","paid_at":"2026-04-12"},{"due_date":"2026-06-01","paid_at":"2026-06-15"},{"due_date":"2026-08-01","paid_at":null}],"as_of":"2026-10-16"}'` },
  { method: 'GET', path: '/rent-benchmark', summary: { zh: '安省租金基准（CMHC / 统计局）', en: 'Ontario rent benchmark (CMHC / StatCan)' }, exampleCurl: `curl "${B}/rent-benchmark?province=ON&area=Liberty%20Village&bedrooms=1&type=condo"` },
]

/** `/api/v1/openapi.json` itself (not an operation in the document, listed for the docs page). */
export const OPENAPI_DOCUMENT_URL = `${API_BASE_URL}/openapi.json`
