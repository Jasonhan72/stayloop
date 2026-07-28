// Reading a request body must never be the thing that turns a client mistake
// into a 500. Several routes did `await req.json()` inside the handler's outer
// try/catch, so an empty body, a truncated upload or a stray `text/plain` POST
// surfaced as "internal server error" — indistinguishable, to a caller and to
// our own alerting, from the server actually being broken.
export async function readJsonBody<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    const v: unknown = await req.json()
    // A bare `null`, a number or an array is not a request body we can read
    // fields off; treat those as malformed rather than letting a later
    // property access throw.
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    return v as T
  } catch {
    return null
  }
}

export const INVALID_BODY = { error: 'invalid JSON body' } as const
