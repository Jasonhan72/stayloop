import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 2026-10-31 — ~/Documents is an iCloud Drive file-provider domain. iCloud
// drops "name 2.js" dataless duplicates into node_modules / .next / .open-next
// and Turbopack's file tracing then times out on the network (ship100 build
// failure, 2026-10-30). scripts/icloud-nosync.sh deletes those duplicates and
// marks the build dirs com.apple.fileprovider.ignore#P; it must run before
// `next dev` (npm predev) and before + after the OpenNext build (ship2 script,
// which is .gitignored and therefore only pinned when present).
const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('icloud-nosync keeps iCloud out of the build directories', () => {
  const sh = read('scripts/icloud-nosync.sh')

  it('is a macOS-only no-op elsewhere and never fails the caller', () => {
    expect(sh).toContain('[ "$(uname -s)" = "Darwin" ] || exit 0')
    expect(sh).toContain('set -u')
    expect(sh).not.toContain('set -e')
    expect(sh.trimEnd().endsWith('exit 0')).toBe(true)
  })

  it('deletes only "name N.ext" duplicate files inside the build dirs, never the source tree', () => {
    expect(sh).toContain("DIRS=(node_modules .next .open-next .wrangler .vercel)")
    expect(sh).toContain(`find "$dir" -name '* [0-9].*' -type f -print -delete`)
    expect(sh).not.toMatch(/find "\$ROOT" -name/)
  })

  it('marks the dirs with the file-provider ignore attribute, creating the three build dirs first', () => {
    expect(sh).toContain("ATTR='com.apple.fileprovider.ignore#P'")
    expect(sh).toContain('xattr -w "$ATTR" 1 "$dir"')
    expect(sh).toContain('case "$rel" in node_modules|.next|.open-next) mkdir -p "$dir" ;; esac')
  })

  it('also covers stale worktrees under .claude/worktrees', () => {
    expect(sh).toContain('"$ROOT"/.claude/worktrees/*/')
  })

  it('runs before next dev via npm predev', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    expect(pkg.scripts.predev).toBe('bash scripts/icloud-nosync.sh')
    expect(pkg.scripts.dev).toBe('next dev')
  })

  it('ship2 runs it after clearing the cache and again after the OpenNext build (local script, pinned when present)', () => {
    const p = join(ROOT, 'ship2-v53.command')
    if (!existsSync(p)) return
    const ship = readFileSync(p, 'utf8')
    const clear = ship.indexOf('rm -rf .open-next .next')
    const build = ship.indexOf('npx opennextjs-cloudflare build || fail "BUILD FAILED"')
    const first = ship.indexOf('bash scripts/icloud-nosync.sh')
    const second = ship.indexOf('bash scripts/icloud-nosync.sh', first + 1)
    expect(clear).toBeGreaterThan(-1)
    expect(first).toBeGreaterThan(clear)
    expect(first).toBeLessThan(build)
    expect(second).toBeGreaterThan(build)
    // the env guard must still see the finished bundle after the second run
    expect(second).toBeLessThan(ship.indexOf('node scripts/opennext-env-guard.mjs'))
  })
})
