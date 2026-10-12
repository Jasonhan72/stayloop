// Constant-time comparison of a cron secret header against CRON_SECRET (SHA-256 both sides, then XOR).
// Shared by the cron routes (realtor-freshness, model-discover).
export async function secretMatches(given: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(secret)),
  ])
  const va = new Uint8Array(a)
  const vb = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}
