/**
 * Escape `\`, `%` and `_` so a value can be passed to `.ilike(column, …)` as a
 * case-insensitive EXACT match. Without it `_` matches any one character and
 * `%` any run — `john_smith@…` would also match `john.smith@…` (code review
 * 2026-11-15, S1-3: with the service role there is no RLS behind the query, so
 * a tenant's message went to another tenant's landlord).
 *
 * Use it for every email that goes into `.ilike()`. Never for `.or()` filter
 * strings — commas and parentheses there need a different treatment; prefer
 * separate `.eq()` / `.in()` queries.
 */
export function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
