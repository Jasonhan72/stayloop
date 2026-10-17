// Minimal JSON Schema (draft 2020-12 subset) checker for the MCP tool input
// schemas in lib/mcp/tools.ts. The schemas are ours and small, so this only
// implements what they use: type (incl. type arrays), enum, const, required,
// properties, additionalProperties:false, minimum / maximum, minLength /
// maxLength, pattern, items, minItems / maxItems. Pure; no dependency.
//
// Why not a library: the edge bundle is shared with the whole site and the
// AI clients that call us already validate against the published schema —
// this is the server-side backstop so a bad argument becomes an
// `isError` tool result (contract) instead of a thrown TypeError.
export type JsonSchema = {
  type?: string | string[]
  enum?: readonly unknown[]
  const?: unknown
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  description?: string
  title?: string
  $schema?: string
  default?: unknown
  examples?: unknown[]
}

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v
}

function typeMatches(v: unknown, t: string): boolean {
  const actual = typeOf(v)
  if (t === 'number') return actual === 'number' || actual === 'integer'
  return actual === t
}

/** Returns a list of human-readable problems; empty = valid. */
export function validateSchema(value: unknown, schema: JsonSchema, path = '$'): string[] {
  const errs: string[] = []
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => typeMatches(value, t))) {
      errs.push(`${path} must be ${types.join(' | ')} (got ${typeOf(value)})`)
      return errs
    }
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) {
    errs.push(`${path} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(' | ')}`)
    return errs
  }
  if ('const' in schema && schema.const !== value) {
    errs.push(`${path} must be ${JSON.stringify(schema.const)}`)
    return errs
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path} must be ≥ ${schema.minimum}`)
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path} must be ≤ ${schema.maximum}`)
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path} must be at least ${schema.minLength} characters`)
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${path} must be at most ${schema.maxLength} characters`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path} must match ${schema.pattern}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path} must have at least ${schema.minItems} item(s)`)
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path} must have at most ${schema.maxItems} items`)
    if (schema.items) value.forEach((item, i) => errs.push(...validateSchema(item, schema.items!, `${path}[${i}]`)))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const key of schema.required || []) {
      if (!(key in obj) || obj[key] === undefined) errs.push(`${path}.${key} is required`)
    }
    const props = schema.properties || {}
    for (const [key, v] of Object.entries(obj)) {
      if (v === undefined) continue
      if (key in props) {
        errs.push(...validateSchema(v, props[key], `${path}.${key}`))
      } else if (schema.additionalProperties === false) {
        errs.push(`${path}.${key} is not an accepted property`)
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errs.push(...validateSchema(v, schema.additionalProperties, `${path}.${key}`))
      }
    }
  }
  return errs
}
