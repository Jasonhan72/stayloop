import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// 2026-11-25: the shared password of the test accounts had been written in CLAUDE.md since
// 2026-09, in a public repository, and one of those accounts was a back-office admin. All of them
// were voided (a random value each, generated in the database) and every session closed. What
// this file pins: no password is stated in the docs again, nothing in scripts/e2e signs in with
// one, and the two scripts that replace it stay what they are.

const read = (p: string) => readFileSync(p, 'utf8')

// 「密码 `…`」「密码都是 `…`」「密码：`…`」 / "password: `…`": a value written next to the word.
const STATED = /密码(?:都是|是|为|[:：=])?\s*`[^`\n]+`|password(?::| is| =)\s*`[^`\n]+`/i

function markdown(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) markdown(p, out)
    else if (name.endsWith('.md')) out.push(p)
  }
  return out
}

describe('no test-account password is written in the repository', () => {
  it('the pattern catches the way it used to be written, and not a path or a rule about passwords', () => {
    expect('测试账号（密码 `abcDEF12`，其余略）').toMatch(STATED)
    expect('账号（密码都是 `abcDEF12`，其余略）').toMatch(STATED)
    expect('the password is `abcDEF12`').toMatch(STATED)
    expect('密码只在本机 `.forensics-tmp/`').not.toMatch(STATED)
    expect('**没有可用的密码**，`user_metadata.test_account=true`').not.toMatch(STATED)
  })

  it('CLAUDE.md and every document under design/ state no password', () => {
    const files = ['CLAUDE.md', ...markdown('design')]
    expect(files.length).toBeGreaterThan(20)
    const hits = files.flatMap((f) => read(f).split('\n').filter((l) => STATED.test(l)).map((l) => `${f}: ${l.slice(0, 80)}`))
    expect(hits).toEqual([])
  })

  it('CLAUDE.md says the accounts have no usable password and how to sign in instead', () => {
    const doc = read('CLAUDE.md')
    expect(doc).toContain('测试账号（**没有可用的密码**')
    expect(doc).toContain('scripts/e2e/test-login-link.sh')
    expect(doc).toContain('scripts/e2e/void-test-passwords.sql')
    expect(doc).toContain('任何密码都不写进入库的文件')
  })
})

describe('scripts/e2e signs in with one-time links only', () => {
  it('nothing there uses the password grant or takes a password from the environment', () => {
    for (const name of readdirSync('scripts/e2e')) {
      const p = join('scripts/e2e', name)
      if (statSync(p).isDirectory()) continue
      const s = read(p)
      expect(s, name).not.toContain('grant_type=password')
      expect(s, name).not.toContain('signInWithPassword')
      expect(s, name).not.toMatch(/E2E_TEST_PASSWORD|TEST_PASSWORD=/)
    }
  })

  it('the probes keep the service role key out of argv and close the sessions they opened', () => {
    const s = read('scripts/e2e/hat-probes.sh')
    expect(s).toContain('/auth/v1/admin/generate_link')
    expect(s).toContain('-H @"$HDR"')
    expect(s).toContain('chmod 600 "$HDR"')
    expect(s).toContain('unset SERVICE')
    expect(s).toContain('/auth/v1/logout?scope=local')
    expect(s).toContain('trap finish EXIT')
    // the key is never an argument and never echoed
    expect(s).not.toMatch(/curl[^\n]*\$SERVICE/)
    expect(s).not.toMatch(/echo[^\n]*\$SERVICE/)
  })

  it('the hand sign-in helper only knows the five test accounts', () => {
    const s = read('scripts/e2e/test-login-link.sh')
    expect(s).toContain('tenant|landlord|agent|provider|admin) EMAIL="$1-test@stayloop.ai" ;;')
    // the address is built from the role word; no other address can be passed in
    expect(s.match(/EMAIL=/g)?.length).toBe(1)
    expect(s).toContain('generate_link?redirect_to=$TO')
    expect(s).toContain('-H @"$HDR"')
    expect(s).not.toMatch(/curl[^\n]*\$SERVICE/)
    expect(s).not.toMatch(/echo[^\n]*\$SERVICE/)
    // it lands on our own site, on a plain path
    expect(s).toContain('SITE="https://www.stayloop.ai"')
    expect(s).toContain('//*|*[[:space:]]*)')
  })

  it('the void script makes the value in the database and closes the sessions in the same transaction', () => {
    const s = read('scripts/e2e/void-test-passwords.sql')
    expect(s).toContain("extensions.crypt(encode(extensions.gen_random_bytes(48), 'base64'), extensions.gen_salt('bf', 10))")
    expect(s).toContain('delete from auth.sessions s')
    expect(s.indexOf('begin;')).toBeLessThan(s.indexOf('update auth.users'))
    expect(s.indexOf('delete from auth.sessions')).toBeLessThan(s.indexOf('commit;'))
    for (const who of ['tenant', 'landlord', 'agent', 'provider', 'admin']) expect(s).toContain(`'${who}-test@stayloop.ai'`)
    expect(s).toContain("'tester@stayloop.ai'")
    // no literal password anywhere: every quoted string is an address, a format or a key name
    expect(s).not.toMatch(/crypt\(\s*'/)
    // it never touches an account that is not a test account
    expect(s).not.toContain("'admin@stayloop.ai'")
  })
})
