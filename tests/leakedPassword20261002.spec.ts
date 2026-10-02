// 2026-10-02 user: 「supabase 的检查也要开启」 — leaked-password protection (Have I Been Pwned) is on for the
// project. Supabase then rejects a breached password at sign-up / password change with code 'weak_password'
// and reasons ['pwned']; every place that sets a password shows a readable message instead of the raw English.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isLeakedPasswordError, isWeakPasswordError, passwordErrorMessage } from '../lib/auth/passwordError'

const pwned = { name: 'AuthWeakPasswordError', code: 'weak_password', reasons: ['pwned'], message: 'Password is known to be weak and easy to guess, please choose a different one.' }

describe('weak / leaked password errors', () => {
  it('a breached password reads as such, in both languages', () => {
    expect(isLeakedPasswordError(pwned)).toBe(true)
    expect(passwordErrorMessage(pwned, true)).toContain('数据泄露')
    expect(passwordErrorMessage(pwned, false)).toContain('known data breach')
    // older clients carry only the message
    expect(isLeakedPasswordError({ message: pwned.message })).toBe(true)
  })
  it('other weak-password reasons get the generic message; unrelated errors are left alone', () => {
    const short = { code: 'weak_password', reasons: ['length'], message: 'Password should be at least 6 characters.' }
    expect(isWeakPasswordError(short)).toBe(true)
    expect(isLeakedPasswordError(short)).toBe(false)
    expect(passwordErrorMessage(short, true)).toContain('密码太弱')
    expect(passwordErrorMessage({ message: 'User already registered' }, true)).toBeNull()
    expect(passwordErrorMessage(null, false)).toBeNull()
  })
  it('sign-up, the password reset page and the admin rotation all use it', () => {
    for (const f of ['lib/auth/useLoginForm.ts', 'app/auth/reset-password/page.tsx', 'app/admin/layout.tsx']) {
      const s = readFileSync(f, 'utf8')
      expect(s, f).toContain("import { passwordErrorMessage } from '@/lib/auth/passwordError'")
      expect(s, f).toMatch(/passwordErrorMessage\(e as Parameters<typeof passwordErrorMessage>\[0\], zh\) \?\?/)
    }
  })
})
