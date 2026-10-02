// Test accounts stay out of the public agent picker (2026-10-02: the public saw
// "[TEST] Agent Person · [TEST] Example Realty Inc., Brokerage" on every
// Realtor.ca listing). A viewer whose own account is a test account
// (user_metadata.test_account === true) still sees them, so the end-to-end
// runs keep working. Pure — tests/listingPageLang20261002.spec.ts.

const TEST_PREFIX = /^\s*\[\s*test\s*\]/i

/** An agent row whose display name or brokerage starts with "[TEST]". */
export function isTestAgent(row: { legal_name?: string | null; brokerage_name?: string | null }): boolean {
  return TEST_PREFIX.test(String(row.legal_name ?? '')) || TEST_PREFIX.test(String(row.brokerage_name ?? ''))
}

/** The signed-in viewer is one of the seeded test accounts. */
export function isTestViewer(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return user?.user_metadata?.test_account === true
}

/** The agents a viewer may be shown: test agents only to test viewers. */
export function visibleAgents<T extends { legal_name?: string | null; brokerage_name?: string | null }>(rows: readonly T[], viewerIsTest: boolean): T[] {
  return viewerIsTest ? [...rows] : rows.filter((r) => !isTestAgent(r))
}
