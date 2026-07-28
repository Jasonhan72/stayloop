import { describe, it, expect } from 'vitest'
import { csvCell, toCsv } from '../lib/csv'

describe('CSV export safety', () => {
  it('quotes a value containing a comma so later columns do not shift', () => {
    // `${l.tenant}` used to be interpolated raw, so "Chen, Mia" pushed the
    // landlord's rent figure under the Unit column.
    expect(csvCell('Chen, Mia')).toBe('"Chen, Mia"')
  })

  it('escapes embedded quotes', () => {
    expect(csvCell('Mia "MC" Chen')).toBe('"Mia ""MC"" Chen"')
  })

  it('neutralises formula-injection leads', () => {
    // Applicant-supplied text lands in the landlord's spreadsheet; Excel
    // evaluates these even inside quotes.
    for (const lead of ['=', '+', '-', '@']) {
      expect(csvCell(`${lead}HYPERLINK("http://x")`)).toBe(`"'${lead}HYPERLINK(""http://x"")"`)
    }
  })

  it('leaves ordinary values and numbers intact', () => {
    expect(csvCell('Mia Chen')).toBe('"Mia Chen"')
    expect(csvCell(3200)).toBe('"3200"')
    expect(csvCell(null)).toBe('""')
  })

  it('builds a full document with the header row', () => {
    expect(toCsv(['Name', 'Rent'], [['Mia Chen', 3200]])).toBe('"Name","Rent"\n"Mia Chen","3200"')
  })
})
