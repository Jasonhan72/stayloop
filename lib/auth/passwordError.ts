// Weak / leaked password errors from Supabase Auth, in words people understand
// (2026-10-02: leaked-password protection — Have I Been Pwned — is on for the
// project). Supabase returns code 'weak_password' (AuthWeakPasswordError) with
// `reasons` such as 'pwned' (the password appears in a known breach), 'length'
// or 'characters'; older clients only carry the English message. Pure: used by
// sign-up (lib/auth/useLoginForm), /auth/reset-password and the admin rotation.

type AuthLikeError = { code?: unknown; name?: unknown; message?: unknown; reasons?: unknown } | null | undefined

export function isWeakPasswordError(e: AuthLikeError): boolean {
  if (!e || typeof e !== 'object') return false
  const msg = typeof e.message === 'string' ? e.message : ''
  return e.code === 'weak_password'
    || e.name === 'AuthWeakPasswordError'
    || /weak and easy to guess|pwned|leaked password|password is too weak/i.test(msg)
}

export function isLeakedPasswordError(e: AuthLikeError): boolean {
  if (!isWeakPasswordError(e)) return false
  const reasons = Array.isArray(e?.reasons) ? (e!.reasons as unknown[]) : []
  const msg = typeof e?.message === 'string' ? e.message : ''
  // The message Supabase sends for a breached password; no other reason produces it.
  return reasons.includes('pwned') || /known to be weak and easy to guess|pwned/i.test(msg)
}

/** A readable message for a weak or leaked password, or null for any other error. */
export function passwordErrorMessage(e: AuthLikeError, zh: boolean): string | null {
  if (isLeakedPasswordError(e)) {
    return zh
      ? '这个密码出现在已公开的数据泄露记录里，请换一个没在别处用过的密码。'
      : 'This password has appeared in a known data breach. Choose one you haven’t used anywhere else.'
  }
  if (isWeakPasswordError(e)) {
    return zh ? '密码太弱，请换一个更长、更难猜的密码。' : 'That password is too weak. Choose a longer one that is harder to guess.'
  }
  return null
}
