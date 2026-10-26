// Knowledge base · the corpus (first batch = Ontario, design/rag-knowledge-base-plan-2026-10-27.md §2).
// `elaws` sources are read through e-Laws' own JSON endpoint (the law pages are a JS app):
//   https://www.ontario.ca/laws/api/v2/legislation/en/doc-search/<statute|regulation>/<alias>
// `html` sources are plain GETs of official pages. Licence notes are what the ingest records.
export type KbSource = {
  key: string
  kind: 'elaws' | 'html'
  title: string
  url: string
  /** elaws only: "statute/06r17" */
  alias?: string
  authority: 1 | 2 | 3 | 4 | 5
  licence: string
  refreshDays: number
}

const OGL = 'Open Government Licence – Ontario'
const CROWN = 'Crown copyright (Ontario); passages stored for retrieval and short quotation with a link'
const LTB_GUIDELINES: [string, string][] = [
  ['01', 'Adjourning and Rescheduling Hearings_dec2020'], ['02', 'Payment into the Board'], ['03', 'Costs'],
  ['04', 'Abandonment of a Rental Unit'], ['05', 'Breach of Maintenance Obligations'], ['06', 'Tenants Rights'],
  ['07', 'Relief from Eviction - Refusing or Delaying an Eviction'], ['08', 'Review of an Order'],
  ['09', 'Eviction for an Illegal Act or Business'], ['10', 'Procedural Issues Regarding Eviction Applications'],
  ['11', 'Rent Arrears'], ['12', 'Eviction for Personal Use'], ['13', 'Other Powers of the Board'],
  ['14', 'Applications for Rent Increases above the Guideline'], ['15', 'Amending an Order'], ['16', 'Administrative Fines'],
  ['17', 'Human Rights'], ['18', 'Restricting Public Access and Seeking Confidentiality Orders'],
  ['19', 'The Landlords Right of Entry into a Rental Unit'], ['21', 'Landlords Tenants Occupants and Residential Tenancies'],
]

export const KB_SOURCES: KbSource[] = [
  { key: 'on-rta-2006', kind: 'elaws', alias: 'statute/06r17', title: 'Residential Tenancies Act, 2006', url: 'https://www.ontario.ca/laws/statute/06r17', authority: 1, licence: OGL, refreshDays: 7 },
  { key: 'on-reg-516-06', kind: 'elaws', alias: 'regulation/060516', title: 'O. Reg. 516/06 — General (under the Residential Tenancies Act, 2006)', url: 'https://www.ontario.ca/laws/regulation/060516', authority: 2, licence: OGL, refreshDays: 7 },
  { key: 'on-reg-517-06', kind: 'elaws', alias: 'regulation/060517', title: 'O. Reg. 517/06 — Maintenance Standards', url: 'https://www.ontario.ca/laws/regulation/060517', authority: 2, licence: OGL, refreshDays: 30 },
  { key: 'on-reg-9-18', kind: 'elaws', alias: 'regulation/180009', title: 'O. Reg. 9/18 — Residential Tenancy Agreement (Standard Form of Lease)', url: 'https://www.ontario.ca/laws/regulation/180009', authority: 2, licence: OGL, refreshDays: 30 },
  { key: 'ltb-rules-of-procedure', kind: 'html', title: 'LTB Rules of Procedure', url: 'https://tribunalsontario.ca/documents/ltb/Rules/LTB-Rules_of_Procedure.html', authority: 3, licence: CROWN, refreshDays: 30 },
  ...LTB_GUIDELINES.map(([n, name]): KbSource => ({
    key: `ltb-ig-${n}`, kind: 'html', title: `LTB Interpretation Guideline ${Number(n)} — ${name.replace(/_dec2020$/, '').replace(/Landlords Right/, "Landlord's Right").replace(/Tenants Rights/, "Tenants' Rights")}`,
    url: `https://tribunalsontario.ca/documents/ltb/Interpretation Guidelines/${n} - ${name}.html`, authority: 3, licence: CROWN, refreshDays: 30,
  })),
  { key: 'on-standard-lease-guide', kind: 'html', title: 'Guide to Ontario’s standard lease', url: 'https://www.ontario.ca/page/guide-ontarios-standard-lease', authority: 3, licence: OGL, refreshDays: 30 },
  { key: 'on-rent-increase-guideline', kind: 'html', title: 'Rent increase guideline (Ontario)', url: 'https://www.ontario.ca/page/rent-increase-guideline', authority: 3, licence: OGL, refreshDays: 7 },
  { key: 'ohrc-rental-housing-policy', kind: 'html', title: 'OHRC — Policy on human rights and rental housing', url: 'https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing', authority: 3, licence: 'Ontario Human Rights Commission; cited with a link', refreshDays: 90 },
  { key: 'toronto-rentsafeto-tenants', kind: 'html', title: 'RentSafeTO for Tenants (City of Toronto)', url: 'https://www.toronto.ca/community-people/housing-shelter/rental-housing-tenant-information/rental-housing-standards/apartment-building-standards/rentsafeto-for-tenants/', authority: 4, licence: 'City of Toronto; cited with a link', refreshDays: 90 },
]
