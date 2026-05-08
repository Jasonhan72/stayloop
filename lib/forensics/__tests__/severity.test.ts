// -----------------------------------------------------------------------------
// Severity computation tests — fixture-based
// -----------------------------------------------------------------------------
// The forensics severity tier (clean / suspicious / likely_fraud / fraud)
// is the core scoring decision that gates whether the screening route
// applies hard penalties. These tests pin down the EXACT mapping from
// (flags + hardGates) → severity so a future tweak to weights doesn't
// silently flip clean cases to suspicious or vice versa.
//
// Run: npm test
// -----------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { computeSeverity } from '../index'
import type { ForensicFlag } from '../types'

const lowFlag = (code: string): ForensicFlag => ({
  code,
  severity: 'low',
  evidence_en: `low test flag: ${code}`,
})
const medFlag = (code: string): ForensicFlag => ({
  code,
  severity: 'medium',
  evidence_en: `medium test flag: ${code}`,
})
const highFlag = (code: string): ForensicFlag => ({
  code,
  severity: 'high',
  evidence_en: `high test flag: ${code}`,
})
const critFlag = (code: string): ForensicFlag => ({
  code,
  severity: 'critical',
  evidence_en: `critical test flag: ${code}`,
})

describe('computeSeverity', () => {
  it('returns "clean" when there are no flags and no hard gates', () => {
    expect(computeSeverity([], [])).toBe('clean')
  })

  it('returns "clean" for a single low-severity flag (weight 1, below threshold 4)', () => {
    expect(computeSeverity([lowFlag('one_low')], [])).toBe('clean')
  })

  it('returns "clean" for two low-severity flags (weight 2)', () => {
    expect(computeSeverity([lowFlag('a'), lowFlag('b')], [])).toBe('clean')
  })

  it('returns "suspicious" when score >= 4 (e.g. one high)', () => {
    // high weight = 4 → exactly at threshold
    expect(computeSeverity([highFlag('one_high')], [])).toBe('suspicious')
  })

  it('returns "suspicious" for two medium-severity flags (weight 4)', () => {
    expect(computeSeverity([medFlag('a'), medFlag('b')], [])).toBe('suspicious')
  })

  it('returns "likely_fraud" when score >= 12 (e.g. three high or two critical fragments)', () => {
    // 3 × high (4 each) = 12
    expect(computeSeverity([highFlag('a'), highFlag('b'), highFlag('c')], [])).toBe('likely_fraud')
  })

  it('returns "likely_fraud" with one critical + one high (8 + 4 = 12)', () => {
    expect(computeSeverity([critFlag('crit_a'), highFlag('high_a')], [])).toBe('likely_fraud')
  })

  it('returns "likely_fraud" when exactly one hard gate fires regardless of flag count', () => {
    expect(computeSeverity([], ['paystub_math_impossible'])).toBe('likely_fraud')
    expect(computeSeverity([lowFlag('a')], ['identity_mismatch'])).toBe('likely_fraud')
  })

  it('returns "fraud" when 2+ hard gates fire', () => {
    expect(
      computeSeverity([], ['paystub_math_impossible', 'identity_mismatch']),
    ).toBe('fraud')
  })

  it('returns "fraud" for 3 hard gates (covers both >=2 and tie-breaking)', () => {
    expect(
      computeSeverity([critFlag('a')], [
        'pdf_is_screenshot',
        'cross_doc_collision',
        'employer_fraud',
      ]),
    ).toBe('fraud')
  })

  it('hard gates take priority over flag-based scoring', () => {
    // Lots of clean-tier flags + one hard gate should still escalate
    const flags = [lowFlag('a'), lowFlag('b'), lowFlag('c')]
    expect(computeSeverity(flags, ['identity_mismatch'])).toBe('likely_fraud')
  })

  it('regression: 4 low flags (weight 4) is "suspicious", not "clean"', () => {
    // The threshold for suspicious is exactly 4. A change to weights or
    // thresholds that demotes this back to clean would silently miss
    // genuine multi-signal cases.
    expect(
      computeSeverity(
        [lowFlag('a'), lowFlag('b'), lowFlag('c'), lowFlag('d')],
        [],
      ),
    ).toBe('suspicious')
  })

  it('regression: an unknown flag.severity (not in SEVERITY_WEIGHT) contributes 0, not crash', () => {
    // Defensive against a future enum widening — unknown severities should
    // be ignored, not throw or get a default weight.
    const weird: ForensicFlag = {
      code: 'unknown_severity',
      severity: 'info' as any, // not in SEVERITY_WEIGHT
      evidence_en: 'should contribute 0',
    }
    expect(computeSeverity([weird, weird, weird, weird, weird], [])).toBe('clean')
  })
})
