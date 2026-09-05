// Edge-safe opaque token for /verify/<token>. 32 random bytes, base64url —
// 256 bits of entropy; the token IS the credential, so it is never derived
// from ids and never logged.
export function newVerifyToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isVerifyToken(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{40,48}$/.test(s)
}
