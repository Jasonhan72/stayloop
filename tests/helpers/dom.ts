// DOM helpers for component tests (React 19 upgrade, 2026-10-21). react-test-renderer is
// deprecated in React 19, so component tests render into jsdom with @testing-library/react:
// put `// @vitest-environment jsdom` on the first line of the spec and `afterEach(cleanup)`.
// These keep the old renderer's strictness where the specs relied on it.

/** Exactly one match, like the old renderer's findByType / findByProps (which threw on 0 or 2+). */
export function only<E extends Element = HTMLElement>(root: ParentNode, selector: string): E {
  const all = root.querySelectorAll<E>(selector)
  if (all.length !== 1) throw new Error(`expected exactly one "${selector}", found ${all.length}`)
  return all[0]
}

/** All matches as an array. */
export function all<E extends Element = HTMLElement>(root: ParentNode, selector: string): E[] {
  return Array.from(root.querySelectorAll<E>(selector))
}

/** Rendered text of a node (the old textOf walked children; textContent is the same thing). */
export const textOf = (n: Node | null | undefined): string => n?.textContent ?? ''

/** jsdom normalises inline colours to rgb(); compare against the hex the code writes. */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
