// Province detection + the rental rules of the 12 jurisdictions outside Ontario
// (2026-10-02). Ontario's rules stay in lib/ontario/rules.ts; every helper in
// ./rules returns null / [] for 'ON' (checkListingComplianceFor and
// decisionNoticeFooterFor delegate to the Ontario versions).
export * from './detect'
export * from './rules'
