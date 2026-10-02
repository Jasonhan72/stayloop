// 2026-10-02 user: 「蒙特利尔房源，改成魁北克」→「是的，要改」→「外省的要查外省的法规，不要用安省的法规和说法。，
// 也不用特别加 一句话：「安省租房规则不适用于这套房源（魁北克省）。」」 — a listing outside Ontario follows its
// own province's rules (lib/provinces), never Ontario's, and no "Ontario rules do not apply" sentence is
// printed anywhere. An empty or unknown province is Ontario (older rows; the product is Ontario-first).
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isOntarioListing, listingProvince, provinceName } from '../lib/listingDisplay'

describe('which listings follow Ontario rules', () => {
  it('Ontario, its spellings and an empty or unknown province are Ontario; Quebec and others are not', () => {
    for (const p of ['ON', 'on', 'Ont', 'Ontario', '安省', '', null, undefined, 'Foo']) expect(isOntarioListing(p), String(p)).toBe(true)
    for (const p of ['QC', 'BC', 'Quebec', 'Québec', 'AB', '魁北克省']) expect(isOntarioListing(p), p).toBe(false)
  })
  it('the listing’s province is read from its postal code / address before the stored value', () => {
    // the Montréal listing that started this (stored as ON before the 2026-10-02 fix)
    expect(listingProvince({ province: 'ON', address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1', city: 'Montréal' })).toBe('QC')
    expect(listingProvince({ province: 'QC', address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1' })).toBe('QC')
    expect(listingProvince({ province: null, address: '100 King St W, Toronto, ON M5X 1A9' })).toBe('ON')
    expect(listingProvince({ province: null, address: null })).toBe('ON')
  })
  it('province names are re-exported for older imports', () => {
    expect(provinceName('QC', true)).toBe('魁北克省')
    expect(provinceName('QC', false)).toBe('Quebec')
  })
})

describe('no "Ontario rules do not apply" sentence anywhere', () => {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(tsx?|mjs|js)$/.test(name)) files.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(d)
  it('neither the sentence nor its helper survives', () => {
    expect(files.length).toBeGreaterThan(100)
    for (const f of files) {
      const s = readFileSync(f, 'utf8')
      expect(s, f).not.toContain('ontarioRulesNotApplicable')
      expect(s, f).not.toMatch(/安省(租房)?规则不适用/)
      expect(s, f).not.toMatch(/Ontario rental rules do not apply/i)
    }
  })
})
