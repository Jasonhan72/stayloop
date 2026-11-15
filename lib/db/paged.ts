// Reading "all the rows" through PostgREST has two silent ceilings (code review 2026-11-15, S3-3):
//   · the server's max-rows (1000 on Supabase) truncates a select with no error, so a dedupe
//     set built from it is incomplete and the same card is created twice;
//   · a long `.in()` list goes into the URL, and a few hundred uuids exceed what the gateway
//     accepts — the whole request fails.
// These two helpers page and chunk instead. Pure control flow; the caller supplies the query.

export type PagedResult<T> = { data: T[] | null; error: { message: string } | null }

/** Split a list into runs of at most `size`. */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

/** How many uuids fit in one `.in()` before the URL gets long (37 characters each). */
export const IN_CHUNK = 80

/** Read every row of a query, `pageSize` at a time. `page(from, to)` must apply a stable
 *  `.order(…)` and `.range(from, to)`. Stops at `maxPages` (a runaway guard, reported through
 *  `truncated`), on a short page, or on the first error. */
export async function selectPaged<T>(
  page: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  pageSize = 1000,
  maxPages = 20,
): Promise<{ data: T[]; error: { message: string } | null; truncated: boolean }> {
  const size = Math.max(1, Math.floor(pageSize))
  const data: T[] = []
  for (let p = 0; p < maxPages; p++) {
    const { data: rows, error } = await page(p * size, p * size + size - 1)
    if (error) return { data, error, truncated: false }
    const got = rows ?? []
    data.push(...got)
    if (got.length < size) return { data, error: null, truncated: false }
  }
  return { data, error: null, truncated: true }
}

/** Run one query per chunk of ids and concatenate the rows; the first error wins. */
export async function selectInChunks<T, K>(
  ids: readonly K[],
  run: (ids: K[]) => PromiseLike<PagedResult<T>>,
  size = IN_CHUNK,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const data: T[] = []
  for (const part of chunk(ids, size)) {
    const { data: rows, error } = await run(part)
    if (error) return { data, error }
    data.push(...(rows ?? []))
  }
  return { data, error: null }
}
