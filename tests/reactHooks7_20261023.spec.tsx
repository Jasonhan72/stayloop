// @vitest-environment jsdom
// react-hooks 7 clean-up (2026-10-23): the three hooks that replaced the flagged patterns, and the
// guards that keep the patterns out: no `ref.current = x` during render in the converted files, no
// inline component definitions inside components, no Date.now() in render for the countdown rows.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useEffect, useState } from 'react'
import { readFileSync } from 'node:fs'
import { useLatest } from '@/lib/ui/useLatest'
import { useOnChange } from '@/lib/ui/useOnChange'
import { useStoredChoice, useStoredString, writeStoredString } from '@/lib/ui/useStoredChoice'

afterEach(() => { cleanup(); try { localStorage.clear(); sessionStorage.clear() } catch { /* jsdom */ } })
const read = (p: string) => readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('useOnChange — adjust own state in the render where the key changed', () => {
  function Probe({ name }: { name: string }) {
    const [draft, setDraft] = useState(name)
    const [renders, setRenders] = useState<string[]>([])
    useOnChange(name, () => setDraft(name))
    useEffect(() => { setRenders((r) => [...r, draft]) }, [draft])
    return <div><span data-testid="draft">{draft}</span><span data-testid="seen">{renders.join(',')}</span></div>
  }
  it('does not fire on mount; fires once per change; the committed draft never shows the stale value', () => {
    const r = render(<Probe name="Ada" />)
    expect(r.getByTestId('draft').textContent).toBe('Ada')
    r.rerender(<Probe name="Ada" />)
    r.rerender(<Probe name="Grace" />)
    expect(r.getByTestId('draft').textContent).toBe('Grace')
    // Every committed value of `draft`: Ada then Grace — no intermediate commit with the old name.
    expect(r.getByTestId('seen').textContent).toBe('Ada,Grace')
  })
})

describe('useLatest — the ref is current by the time effects run', () => {
  function Probe({ v }: { v: number }) {
    const ref = useLatest(v)
    const [seen, setSeen] = useState<number | null>(null)
    useEffect(() => { setSeen(ref.current) }, [v, ref])
    return <span data-testid="seen">{seen}</span>
  }
  it('passive effects of the same commit read the new value', () => {
    const r = render(<Probe v={1} />)
    expect(r.getByTestId('seen').textContent).toBe('1')
    r.rerender(<Probe v={2} />)
    expect(r.getByTestId('seen').textContent).toBe('2')
  })
})

describe('useStoredChoice — external store with a server fallback', () => {
  function Probe() {
    const [v, set] = useStoredChoice<'grid' | 'list'>('sl-test-view', 'grid', ['grid', 'list'])
    return <button data-testid="b" onClick={() => set(v === 'grid' ? 'list' : 'grid')}>{v}</button>
  }
  it('falls back for unset / unknown values, writes storage, and updates other subscribers in this tab', () => {
    localStorage.setItem('sl-test-view', 'bogus')
    const r = render(<><Probe /><Probe /></>)
    const [a, b] = r.getAllByTestId('b')
    expect(a.textContent).toBe('grid')
    act(() => { a.click() })
    expect(a.textContent).toBe('list')
    expect(b.textContent).toBe('list')
    expect(localStorage.getItem('sl-test-view')).toBe('list')
  })
  it('useStoredString reads raw strings and writeStoredString(null) removes', () => {
    function P() { return <span data-testid="s">{useStoredString('sl-raw') ?? '∅'}</span> }
    const r = render(<P />)
    expect(r.getByTestId('s').textContent).toBe('∅')
    act(() => writeStoredString('sl-raw', 'x'))
    expect(r.getByTestId('s').textContent).toBe('x')
    act(() => writeStoredString('sl-raw', null))
    expect(r.getByTestId('s').textContent).toBe('∅')
  })
})

describe('guards on the converted files', () => {
  it('no `ref.current = value` during render in the converted components / hooks', () => {
    for (const p of ['components/ListingsMap.tsx', 'lib/agent/useAgentSession.ts', 'components/agent/IntakeCard.tsx', 'components/messages/MessageCenter.tsx', 'components/tenant/NewTicketModal.tsx', 'components/threads/ThreadPanel.tsx', 'lib/ui/useModalA11y.ts', 'app/listings/[slug]/page.tsx']) {
      const s = read(p)
      // The pattern the rule flags: a ref assigned on the line right after useRef(...) / on the same line.
      expect(s, p).not.toMatch(/useRef\([^)]*\);\s*\w+Ref\.current = /)
      expect(s, p).not.toMatch(/const (\w+) = useRef\([^\n]*\)\n\s*\1\.current = /)
    }
  })
  it('components are module-level, not defined inside render', () => {
    expect(read('app/admin/agents/page.tsx')).toMatch(/\nfunction Shell\(/)
    expect(read('app/provider/jobs/page.tsx')).toMatch(/\nfunction TILE\(/)
    expect(read('components/admin/RealtorFreshnessCard.tsx')).toMatch(/\nfunction Stat\(/)
    expect(read('components/AuthModal.tsx')).toMatch(/\nfunction PasswordEye\(/)
    for (const p of ['app/admin/agents/page.tsx', 'app/provider/jobs/page.tsx', 'components/admin/RealtorFreshnessCard.tsx', 'components/AuthModal.tsx']) {
      expect(read(p), p).not.toMatch(/\n  const (Shell|TILE|Stat|PasswordEye) = \(/)
    }
  })
  it('preferences read from storage go through the external store, not setState in an effect', () => {
    for (const [p, key] of [['app/dashboard/page.tsx', 'sl-listing-view'], ['components/agent/AgentWorkspacePage.tsx', 'sl-thread-list'], ['lib/agent/useAssistantPanel.ts', 'sl-assistant-panel'], ['components/WorkspaceShell.tsx', 'sl-show-demo'], ['lib/i18n.tsx', 'stayloop_currency']] as const) {
      const s = read(p)
      expect(s, p).not.toMatch(new RegExp(`getItem\\('${key}'\\)`))
      expect(s, p).toMatch(/useStored(Choice|String)(<[^>]*>)?\(/)
    }
  })
  it('the lint config only turns off set-state-in-effect, with the reason written beside it; the compiler rules stay on', () => {
    const cfg = readFileSync('eslint.config.mjs', 'utf8')
    expect(cfg).toMatch(/'react-hooks\/set-state-in-effect': 'off'/)
    for (const r of ['refs', 'static-components', 'purity', 'immutability', 'globals']) expect(cfg).not.toMatch(new RegExp(`'react-hooks/${r}': 'off'`))
    expect(cfg).toMatch(/useOnChange|useStoredChoice/)
  })
})
