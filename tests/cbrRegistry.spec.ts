import { describe, it, expect } from 'vitest'
import { cbrDocToCompanyInfo, pickBestCbrDoc, type CbrDoc } from '../lib/forensics/cbr-registry'

// Real payloads observed from the CBR API on 2026-07-26 (the Alaleh case).
const ON_NORTHLINE: CbrDoc = {
  Company_Name: 'NORTHLINE MOTORS INC.',
  Jurisdiction: 'ON', Registry_Source: 'ON', Juri_ID: '1873411',
  Status_State: 'Active', Status_Notes: 'incorporated',
  Entity_Type: 'ONTARIO BUSINESS CORP.', Date_Incorporated: '2012-05-16',
  Reg_office_city: 'Woodbridge', Reg_office_province: 'Ontario',
}
const AB_NORTHLINE: CbrDoc = {
  Company_Name: 'NORTHLINE MOTORS LTD',
  Jurisdiction: 'AB', Registry_Source: 'AB', Juri_ID: '200612182',
  Status_State: 'Inactive', Entity_Type: 'Alberta Business Corporation',
  Date_Incorporated: '1972-02-17',
}
const ON_NLMA: CbrDoc = {
  Company_Name: 'NLMA AUTO INC.',
  Jurisdiction: 'ON', Juri_ID: '2858546', BN: '784195406',
  Status_State: 'Active', Status_Notes: 'incorporated',
  Entity_Type: 'ONTARIO BUSINESS CORP.', Date_Incorporated: '2021-08-05',
  Reg_office_city: 'Woodbridge', Reg_office_province: 'Ontario',
}

describe('pickBestCbrDoc', () => {
  it('prefers the ACTIVE Ontario corp over a dissolved same-name Alberta corp', () => {
    // The live case: an employer letter says "Northline Motors"; the registry
    // holds an ON corp active since 2012 and an AB corp dead since 1978.
    expect(pickBestCbrDoc('Northline Motors', [AB_NORTHLINE, ON_NORTHLINE])?.Juri_ID)
      .toBe('1873411')
  })

  it('still returns an inactive match when that is all there is', () => {
    expect(pickBestCbrDoc('Northline Motors', [AB_NORTHLINE])?.Juri_ID).toBe('200612182')
  })

  it('does not match an unrelated company that merely shares a generic word', () => {
    expect(pickBestCbrDoc('Northline Motors', [
      { Company_Name: 'LAKESIDE MOTORS INC.', Jurisdiction: 'ON', Status_State: 'Active' },
    ])).toBeNull()
  })

  it('handles empty / nameless docs', () => {
    expect(pickBestCbrDoc('Northline Motors', [])).toBeNull()
    expect(pickBestCbrDoc('Northline Motors', [{ Jurisdiction: 'ON' }])).toBeNull()
  })
})

describe('cbrDocToCompanyInfo', () => {
  it('maps an Ontario record into the shared registry shape', () => {
    const info = cbrDocToCompanyInfo(ON_NLMA)
    expect(info.name).toBe('NLMA AUTO INC.')
    expect(info.company_number).toBe('2858546')
    expect(info.jurisdiction).toBe('Ontario')
    expect(info.incorporation_date).toBe('2021-08-05')
    expect(info.status).toBe('Active (incorporated)')
    expect(info.registered_address).toBe('Woodbridge, Ontario')
    expect(info.company_type).toBe('ONTARIO BUSINESS CORP.')
    expect(info.source).toBe('cbr_on')
    expect(info.registry_url).toContain('ised-isde.canada.ca/cbr-rec')
    expect(info.officers).toEqual([])   // CBR exposes no directors
  })

  it('labels the federal (CC) jurisdiction and tolerates sparse records', () => {
    const info = cbrDocToCompanyInfo({ Company_Name: 'ACME CANADA INC.', Jurisdiction: 'CC', Status_State: 'Active' })
    expect(info.jurisdiction).toBe('Canada (federal)')
    expect(info.source).toBe('cbr_federal')
    expect(info.registered_address).toBeNull()
    expect(info.incorporation_date).toBeNull()
    expect(info.status).toBe('Active')
  })
})
