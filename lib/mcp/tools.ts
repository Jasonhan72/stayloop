// Remote MCP · tool table (stage 5 · 2026-10-16, design/open-api-contract-2026-10.md「MCP」).
//
// Seven tools, one per tier-1 core function in lib/api/v1Core.ts. Nothing here
// computes a rule: each tool validates its arguments against the published
// JSON Schema (lib/mcp/validate.ts), hands the object to the core function the
// REST route uses, and wraps the answer as an MCP tool result —
// `content[0].text` is the JSON string, `structuredContent` the same object.
// A bad argument or an ApiError from the core is an `isError:true` result
// (the model can read why and retry), never a JSON-RPC protocol error.
//
// Every tool: readOnly, non-destructive, idempotent, closed-world. The
// descriptions carry the boundary sentence and the data sources because a
// directory reviewer and a model both read them.
import { ApiError, BOUNDARY } from '@/lib/api/v1Http'
import {
  coreRules,
  coreListingCompliance,
  coreLeaseTermsCheck,
  coreGuideline,
  coreN4EarliestTermination,
  corePersistentLatePayment,
  coreRentBenchmark,
  type BenchmarkClient,
} from '@/lib/api/v1Core'
import { PROVINCE_CODES } from '@/lib/provinces/detect'
import { validateSchema, type JsonSchema } from './validate'

export type McpToolContext = {
  /** Read-only client for `rent_benchmarks` (service role in the route, a stub in tests); null = the core falls back to the anon REST reader. */
  sb: BenchmarkClient | null
}

export type McpToolAnnotations = {
  title: string
  readOnlyHint: true
  destructiveHint: false
  idempotentHint: true
  openWorldHint: false
}

export type McpTool = {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  annotations: McpToolAnnotations
}

export type McpToolResult = {
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** The fixed boundary sentence (same text as every REST response). */
export const MCP_BOUNDARY = BOUNDARY

const SOURCES_RULES =
  'Sources: Ontario — Residential Tenancies Act, 2006 (RTA), O. Reg. 516/06, O. Reg. 9/18; other provinces and territories — each jurisdiction\'s residential tenancy statute, cited with official URLs (snapshot date in `as_of`).'
const SOURCES_BENCHMARK =
  'Sources: CMHC Rental Market Survey (CMHC data licence) and Statistics Canada table 46-10-0092-01 (Open Government Licence – Canada). The `attribution` field is mandatory: display it next to any figure you show.'

const boundary = (sources: string) => `Boundary: ${MCP_BOUNDARY.en}（${MCP_BOUNDARY.zh}）${sources}`

const annotate = (title: string): McpToolAnnotations => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })

const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Calendar date, YYYY-MM-DD.' } as const
const PROVINCE = { type: 'string', enum: [...PROVINCE_CODES], description: 'Two-letter province / territory code. Default ON (Ontario).' } as const
const MONEY = { type: 'number', minimum: 0, maximum: 1_000_000 } as const

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_rules',
    title: 'List rental rules',
    description: [
      'List the residential-tenancy rules Stayloop applies for one Canadian province or territory, each with its id, statute citation, bilingual title and summary, and (Ontario) severity and in-force date.',
      'Input: `province` (optional, default ON).',
      boundary(SOURCES_RULES),
    ].join(' '),
    inputSchema: { type: 'object', properties: { province: PROVINCE }, additionalProperties: false },
    annotations: annotate('List rental rules'),
  },
  {
    name: 'check_listing_compliance',
    title: 'Check a rental listing',
    description: [
      'Check the terms of a rental listing (deposit, key deposit, application fee, pet policy, listing text) against the province\'s tenancy rules and return pass/fail with the rules hit.',
      'Input: `province` (default ON), `monthly_rent`, `deposit`, `key_deposit`, `application_fee` (numbers, CAD), `pets_allowed` (yes | no | restricted), `title`, `description`, `schedule_b` (listing text to scan). Do not pass names, addresses or other personal information — only the terms.',
      boundary(SOURCES_RULES),
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        province: PROVINCE,
        monthly_rent: { ...MONEY, description: 'Monthly rent in CAD.' },
        deposit: { ...MONEY, description: 'Rent deposit asked for, in CAD.' },
        key_deposit: { ...MONEY, description: 'Key deposit asked for, in CAD.' },
        application_fee: { ...MONEY, description: 'Any application / screening / processing fee, in CAD (0 or omit if none).' },
        pets_allowed: { type: 'string', enum: ['yes', 'no', 'restricted'], description: 'Pet policy as set on the listing.' },
        title: { type: 'string', maxLength: 500, description: 'Listing title text.' },
        description: { type: 'string', maxLength: 8000, description: 'Listing description text.' },
        schedule_b: { type: 'string', maxLength: 8000, description: 'Additional terms text (Ontario Schedule B or equivalent).' },
      },
      additionalProperties: false,
    },
    annotations: annotate('Check a rental listing'),
  },
  {
    name: 'check_lease_terms',
    title: 'Check lease terms',
    description: [
      'Check the money and date terms of a residential lease (rent, deposit, form type, additional terms, start / end dates) against the province\'s tenancy rules and return pass/fail with the rules hit.',
      'Input: `province` (default ON), `rent_amount`, `deposit_amount` (CAD), `form_type` (ontario_standard | trreb | imported), `schedule_b` (additional-terms text), `start_date`, `end_date` (YYYY-MM-DD). Pass terms only, never the parties\' names or the unit address.',
      boundary(SOURCES_RULES),
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        province: PROVINCE,
        rent_amount: { ...MONEY, description: 'Monthly rent in CAD.' },
        deposit_amount: { ...MONEY, description: 'Deposit in CAD.' },
        form_type: { type: 'string', enum: ['ontario_standard', 'trreb', 'imported'], description: 'Which lease form the terms come from.' },
        schedule_b: { type: 'string', maxLength: 8000, description: 'Additional terms text.' },
        start_date: { ...DATE, description: 'Tenancy start date, YYYY-MM-DD.' },
        end_date: { ...DATE, description: 'Fixed-term end date, YYYY-MM-DD.' },
      },
      additionalProperties: false,
    },
    annotations: annotate('Check lease terms'),
  },
  {
    name: 'rent_increase_guideline',
    title: 'Ontario rent increase guideline',
    description: [
      'Return the Ontario rent increase guideline that applies to a rent increase taking effect on a given date: the year, the percentage, whether it is published yet, the statutory cap, the 90-day notice period and the latest date the N1 notice could be served.',
      'Input: `effective` (YYYY-MM-DD, the date the new rent would start). Ontario only.',
      boundary('Source: Ontario RTA s.120 and the guideline published by the Province each year.'),
    ].join(' '),
    inputSchema: { type: 'object', properties: { effective: { ...DATE, description: 'Date the increased rent would take effect, YYYY-MM-DD.' } }, required: ['effective'], additionalProperties: false },
    annotations: annotate('Ontario rent increase guideline'),
  },
  {
    name: 'n4_earliest_termination',
    title: 'N4 earliest termination date',
    description: [
      'Compute, for an Ontario N4 (non-payment of rent) notice served on a given date by a given method, the deemed service date and the earliest termination date that satisfies the 7-day minimum (plus 5 days for mail).',
      'Input: `served` (YYYY-MM-DD), `method` (hand | mail | email, default hand). Ontario only. Date arithmetic only: it does not say whether an N4 is appropriate.',
      boundary('Source: Ontario RTA s.59 and the LTB rules on service.'),
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        served: { ...DATE, description: 'Date the notice was or would be served, YYYY-MM-DD.' },
        method: { type: 'string', enum: ['hand', 'mail', 'email'], description: 'Method of service; mail adds the deemed-service days.' },
      },
      required: ['served'],
      additionalProperties: false,
    },
    annotations: annotate('N4 earliest termination date'),
  },
  {
    name: 'persistent_late_payment',
    title: 'Persistent late payment test',
    description: [
      'Apply the Ontario persistent-late-payment definition to a list of rent periods: which periods were paid more than 7 days late, and whether 3 or more fell within any 6-month window.',
      'Input: `periods` (array, max 120, each `{ due_date, paid_at }` with `paid_at` null when unpaid), `as_of` (optional YYYY-MM-DD, default today). Pass dates only — no names, addresses or amounts are needed.',
      boundary('Source: Ontario RTA s.58(1) and the LTB\'s treatment of persistent late payment.'),
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        periods: {
          type: 'array',
          minItems: 1,
          maxItems: 120,
          description: 'One entry per rent period.',
          items: {
            type: 'object',
            properties: {
              due_date: { ...DATE, description: 'Date the rent was due, YYYY-MM-DD.' },
              paid_at: { type: ['string', 'null'], maxLength: 40, description: 'Date (YYYY-MM-DD) or ISO date-time the rent was paid; null if not paid.' },
            },
            required: ['due_date'],
            additionalProperties: false,
          },
        },
        as_of: { ...DATE, description: 'Evaluate as of this date (default today), YYYY-MM-DD.' },
      },
      required: ['periods'],
      additionalProperties: false,
    },
    annotations: annotate('Persistent late payment test'),
  },
  {
    name: 'rent_benchmark',
    title: 'Rent benchmark (CMHC / StatCan)',
    description: [
      'Return the published average rent for an area and unit size: the most specific CMHC Rental Market Survey figure available (survey average of occupied units, not an asking or transaction price) plus the Statistics Canada quarterly asking-rent series, each labelled with its period.',
      'Input: `province` (ON only for now), `area` (city, neighbourhood or CMHC zone name, e.g. "Toronto", "North York"), `bedrooms` (0–10; 0 = bachelor), `type` (apartment | condo | townhouse | house).',
      boundary(SOURCES_BENCHMARK),
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        province: { type: 'string', enum: ['ON'], description: 'Only ON is covered.' },
        area: { type: 'string', maxLength: 120, description: 'City, neighbourhood or CMHC zone name.' },
        bedrooms: { type: 'integer', minimum: 0, maximum: 10, description: 'Number of bedrooms (0 = bachelor / studio).' },
        type: { type: 'string', enum: ['apartment', 'condo', 'townhouse', 'house'], description: 'Unit type.' },
      },
      required: ['bedrooms'],
      additionalProperties: false,
    },
    annotations: annotate('Rent benchmark (CMHC / StatCan)'),
  },
]

export const MCP_TOOL_NAMES = MCP_TOOLS.map((t) => t.name)

export function findTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((t) => t.name === name)
}

type Args = Record<string, unknown>

function ok(result: unknown): McpToolResult {
  const obj = (result && typeof result === 'object' ? result : { result }) as Record<string, unknown>
  return { content: [{ type: 'text', text: JSON.stringify(obj) }], structuredContent: obj }
}

function fail(code: string, message: string): McpToolResult {
  return { content: [{ type: 'text', text: `${code}: ${message}` }], structuredContent: { error: code, message }, isError: true }
}

/**
 * Run one tool. Unknown tool → throws (the JSON-RPC layer turns it into
 * -32602, the protocol error the spec reserves for unknown tools); bad
 * arguments or a core ApiError → `isError:true` result.
 */
export async function callTool(name: string, rawArgs: unknown, ctx: McpToolContext): Promise<McpToolResult> {
  const tool = findTool(name)
  if (!tool) throw new UnknownToolError(name)
  const args: Args = rawArgs == null ? {} : (rawArgs as Args)
  const problems = validateSchema(args, tool.inputSchema)
  if (problems.length) return fail('invalid_input', problems.join('; '))
  try {
    switch (name) {
      case 'list_rules': return ok(await coreRules(args))
      case 'check_listing_compliance': return ok(await coreListingCompliance(args))
      case 'check_lease_terms': return ok(await coreLeaseTermsCheck(args))
      case 'rent_increase_guideline': return ok(await coreGuideline(args))
      case 'n4_earliest_termination': return ok(await coreN4EarliestTermination(args))
      case 'persistent_late_payment': return ok(await corePersistentLatePayment(args))
      case 'rent_benchmark': return ok(await coreRentBenchmark(ctx.sb, args))
      default: throw new UnknownToolError(name)
    }
  } catch (err) {
    if (err instanceof UnknownToolError) throw err
    if (err instanceof ApiError) return fail(err.code, err.message)
    return fail('not_available', 'The tool could not answer this request.')
  }
}

export class UnknownToolError extends Error {
  tool: string
  constructor(tool: string) {
    super(`Unknown tool: ${tool}`)
    this.name = 'UnknownToolError'
    this.tool = tool
  }
}
