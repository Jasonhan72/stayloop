// @vitest-environment jsdom
// 2026-11-18 · phone and tablet sweep (WebKit + Chrome, ten widths from 360 to 1180, four hats + visitors,
// token pages). What it found, each pinned here so it does not come back:
//   · tablet upright: the workspace aside took 320px beside the rail and left the page ~380px
//   · phones: the aside's last lines sat under the fixed tab bar
//   · shared Table: one 440px floor for three columns and for ten
//   · lease document: a fixed 190px label column, and a two-column row cut off by the card
//   · pricing: the trial banner painted over by the hero below it (every width)
//   · multi-line boxes squeezed to one line by .sl-input's fixed height
//   · rows that wrapped one character per line or ran off a 360px screen
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanup, render } from '@testing-library/react'
import { only } from './helpers/dom'
import { StatStrip, Table, Td, Tr } from '@/components/workspace'

const read = (p: string) => readFileSync(p, 'utf8')
afterEach(cleanup)

describe('workspace shell columns', () => {
  const shell = read('components/WorkspaceShell.tsx')
  const asideClass = (shell.match(/<aside className="([^"]+)"/) || [])[1] || ''

  it('puts the aside beside the page from lg, not md', () => {
    expect(asideClass).toContain('lg:w-[320px]')
    expect(asideClass).toContain('lg:border-l')
    expect(asideClass).not.toMatch(/\bmd:w-\[320px\]/)
    expect(shell).toMatch(/data-testid="shell-columns"/)
    expect(shell).toMatch(/className="flex min-w-0 flex-1 flex-col lg:flex-row"/)
  })

  it('leaves room for the phone tab bar under the aside, and does not double it above', () => {
    expect(asideClass).toContain('pb-24')
    expect(asideClass).toContain('md:pb-9')
    expect(shell).toContain("${asideHidden ? 'pb-24' : 'pb-8'}")
  })
})

describe('shared Table', () => {
  it('sizes its phone and upright-tablet min-width from the number of columns and keeps the old floor from lg', () => {
    const { container } = render(
      <Table head={['a', 'b', 'c', 'd', 'e', 'f']}>
        <Tr><Td mono>2026-11-18</Td><Td>x</Td><Td>x</Td><Td>x</Td><Td>x</Td><Td>x</Td></Tr>
      </Table>,
    )
    const table = only<HTMLTableElement>(container, 'table')
    expect(table.style.getPropertyValue('--sl-cols')).toBe('6')
    expect(table.className).toContain('min-w-[calc(var(--sl-cols)*104px)]')
    expect(table.className).toContain('lg:min-w-[440px]')
    expect(table.className).not.toContain('md:min-w-[440px]')
    expect(table.parentElement?.className).toContain('overflow-x-auto')
  })

  it('never breaks a date or an amount in two', () => {
    const { container } = render(<Table head={['a', 'b']}><Tr><Td mono>2026-11-18</Td><Td>plain</Td></Tr></Table>)
    const cells = container.querySelectorAll('td')
    expect(cells[0].className).toContain('whitespace-nowrap')
    expect(cells[1].className).not.toContain('whitespace-nowrap')
  })
})

describe('lease document on a phone', () => {
  for (const f of ['components/lease/OntarioLeaseDoc.tsx', 'components/lease/TrrebLeaseDoc.tsx']) {
    it(`${f}: the label column is a share of the row on phones and 190px from sm`, () => {
      const src = read(f)
      expect(src).toContain('w-[42%] max-w-[190px] flex-none text-neutral-500 sm:w-[190px]')
      expect(src).toContain('min-w-0 break-words font-medium')
      expect(src).not.toMatch(/className="w-\[190px\] flex-none/)
    })
  }
  it('the utilities row is one column on phones', () => {
    const src = read('components/lease/OntarioLeaseDoc.tsx')
    expect(src).toContain('grid grid-cols-1 gap-x-6 sm:grid-cols-2')
    expect(src).not.toContain('"grid grid-cols-2 gap-x-6"')
  })
})

describe('things that were covered, squeezed or cut', () => {
  it('pricing: nothing sits between the header and the hero that pulls itself up under it', () => {
    // 2026-11-18: a green banner sat here and the hero painted over it, so it was given `relative z-10`.
    // 2026-11-23: the user removed the banner (「整条都拿掉」), so there is nothing left to cover.
    const src = read('app/pricing/page.tsx')
    expect(src).not.toContain('pricing-trial-banner')
    expect(src).toMatch(/<main>\s*\{\/\*[\s\S]*?\*\/\}\s*<section\s+className="relative overflow-hidden"/)
    expect(src).toContain('marginTop: -72')
  })

  it('a textarea with .sl-input keeps its rows', () => {
    const css = read('app/globals.css')
    const rule = (css.match(/:where\(textarea\)\.sl-input\s*\{([^}]+)\}/) || [])[1] || ''
    expect(rule).toMatch(/height:\s*auto/)
    expect(rule).toMatch(/min-height:\s*2\.75rem/)
  })

  it('agent checklist: the input card has padding', () => {
    expect(read('app/agent/checklist/page.tsx')).toMatch(/\{\/\* Left: input \*\/\}\s*<div className="sl-card p-4 sm:p-5">/)
  })

  it('public-profile editor: the form grid cannot be widened by an input', () => {
    expect(read('components/agent/PublicProfileEditor.tsx')).toContain('<div className="mt-4 grid grid-cols-1 gap-4">')
  })

  it('client tasks: the sentence keeps a line of its own when the buttons do not fit beside it', () => {
    expect(read('components/agent/ClientTasks.tsx')).toContain('<span className="min-w-0 flex-1 basis-[220px]">')
  })

  it('thread panel header: the title, count and toggle do not shrink', () => {
    const src = read('components/threads/ThreadPanel.tsx')
    expect(src).toContain('<span className="flex-none whitespace-nowrap text-[13px] font-bold">{heading}</span>')
    expect(src).toContain('<span className="ml-auto flex-none whitespace-nowrap text-[11.5px] text-body-3">')
  })

  it('tenant rent rows wrap inside a 360px card; the off-market chip stays in one piece', () => {
    expect(read('components/tenant/MyRent.tsx')).toContain('<div className="flex max-w-full flex-none flex-wrap items-center gap-2">')
    for (const f of ['components/tenant/MyApplications.tsx', 'components/tenant/MyShowings.tsx']) {
      expect(read(f)).toMatch(/<span className="ml-1\.5 whitespace-nowrap rounded-full bg-surface-chip[^"]*">\{zh \? '已下架'/)
    }
  })
})

describe('touch targets', () => {
  it('footer links, header links and FAQ rows are padded boxes, with the layout unchanged', () => {
    expect(read('components/Footer.tsx')).toContain('-my-2 inline-block whitespace-nowrap py-2 text-[13.5px]')
    const header = read('components/Header.tsx')
    expect(header).toContain("'group relative -my-3 inline-flex items-center py-3 text-[14px] transition'")
    expect(header).toContain('className="group -my-3 inline-flex items-center gap-1 py-3 text-[14px] transition"')
    const role = read('components/RoleLanding.tsx')
    expect(role).toMatch(/<summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 /)
    expect(role).toContain('<details key={f.q.en} className="group border-t border-line-divider last:border-b"')
  })
})

// Same day, after the user's 「加上名字」: on a screen that cannot hover, the workspace rail shows each name under
// its icon. With a mouse it stays icons only (the 2026-10-04 decision), so the names are in the markup but hidden.
describe('workspace rail on touch screens', () => {
  const css = read('app/globals.css')
  const shell = read('components/WorkspaceShell.tsx')
  const provider = read('components/provider/ProviderNav.tsx')

  it('the name is hidden by default and shown only under (hover: none)', () => {
    const at = css.indexOf('.sl-rail-label { display: none; }')
    const media = css.indexOf('@media (hover: none) {')
    expect(at).toBeGreaterThan(-1)
    expect(media).toBeGreaterThan(at)
    const block = css.slice(media, css.indexOf('/* Phone bottom tab bar'))
    expect(block).toMatch(/\.sl-rail \.sl-rail-label \{[^}]*display: -webkit-box/)
    expect(block).toMatch(/\.sl-rail \.sl-rail-item \{[^}]*flex-direction: column/)
    expect(block).toMatch(/nav\.sl-rail \{[^}]*width: 76px/)
    // nothing about the rail's names applies to devices that can hover
    expect(css.slice(0, media)).not.toMatch(/\.sl-rail-label \{[^}]*display: (?!none)/)
  })

  it('both rails carry the hooks and the name, and skip the hover tooltip where there is no hover', () => {
    for (const src of [shell, provider]) {
      expect(src).toMatch(/className="sl-rail hidden md:sticky/)
      expect(src).toContain('className="sl-rail-item relative flex h-11 w-11 flex-none items-center justify-center rounded-[10px] transition hover:bg-white"')
      expect(src).toContain('<span className="sl-rail-label" data-testid="rail-label">{label}</span>')
      expect(src).toMatch(/const showTip = [^\n]+\n[^\n]*(?:\n[^\n]*){0,2}\(hover: none\)'\)\.matches\) return/)
    }
  })
})

describe('stat strip with five tiles', () => {
  const five = [1, 2, 3, 4, 5].map((n) => ({ label: `s${n}`, value: n === 4 ? '$54,600' : String(n) }))
  it('is three to a row between sm and xl and five from xl', () => {
    const { container } = render(<StatStrip stats={five} />)
    const grid = container.firstElementChild as HTMLElement
    expect(grid.className).toContain('sm:grid-cols-3')
    expect(grid.className).toContain('xl:grid-cols-5')
    expect(grid.className).not.toContain('sm:grid-cols-5')
    const cells = Array.from(grid.children) as HTMLElement[]
    expect(cells[3].className).toContain('sm:max-xl:border-l-0') // starts the second row of three
    expect(cells[3].className).toContain('sm:max-xl:border-t')
    expect(cells[4].className).toContain('sm:max-xl:border-t')
    expect(cells[1].className).not.toContain('sm:max-xl:')
  })
  it('four tiles keep four to a row', () => {
    const { container } = render(<StatStrip stats={five.slice(0, 4)} />)
    const grid = container.firstElementChild as HTMLElement
    expect(grid.className).toContain('sm:grid-cols-4')
    expect(Array.from(grid.children).some((c) => c.className.includes('sm:max-xl:'))).toBe(false)
  })
})

