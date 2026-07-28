// Shared CSV builder for the workspace exports.
//
// Two problems it fixes, both of which existed in the hand-rolled exporters:
//
//  1. Unquoted interpolation. `${l.tenant}` wrote a tenant's name straight into
//     the row, so a name containing a comma ("Chen, Mia") silently shifted every
//     later column — the landlord's rent figures landed under "Unit".
//
//  2. Formula injection. Excel and Sheets evaluate a cell beginning with
//     = + - @ (or a leading tab/CR) even when it is quoted, so a name typed by
//     an applicant is executable content in the landlord's spreadsheet. We
//     prefix a single quote, which those apps strip on display.
const RISKY_LEAD = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  const safe = RISKY_LEAD.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

export function toCsv(header: readonly unknown[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
}

/** Trigger a browser download of `csv` with a UTF-8 BOM (Excel needs it). */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
