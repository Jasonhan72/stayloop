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
const OHRC_LIC = 'Ontario Human Rights Commission; cited with a link'
const TORONTO_LIC = 'City of Toronto; cited with a link'
const OHRC_SECTIONS: [string, string][] = [
  ['i-introduction', 'I. Introduction'], ['ii-purpose-ohrcs-policies', 'II. Purpose of OHRC policies'],
  ['iii-ontario-human-rights-code', 'III. The Ontario Human Rights Code'], ['iv-social-and-economic-status', 'IV. Social and economic status'],
  ['v-identifying-discrimination-rental-housing', 'V. Identifying discrimination in rental housing'], ['vi-duty-accommodate', 'VI. The duty to accommodate'],
  ['vii-social-housing', 'VII. Social housing'], ['viii-co-op-housing', 'VIII. Co-op housing'],
  ['ix-organizational-responsibility', 'IX. Organizational responsibility'], ['x-preventing-and-responding-discrimination-rental-housing', 'X. Preventing and responding to discrimination'],
  ['appendix-table-cases', 'Appendix: table of cases'],
]
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
  { key: 'ohrc-rental-housing-policy', kind: 'html', title: 'OHRC — Policy on human rights and rental housing', url: 'https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing', authority: 3, licence: OHRC_LIC, refreshDays: 90 },
  // 2026-10-27 第 2 期 9.1: the policy's body lives in sub-pages (the overview is 4 chunks); each is its own document
  ...OHRC_SECTIONS.map(([slug, name]): KbSource => ({
    key: `ohrc-policy-${slug.split('-')[0]}`, kind: 'html', title: `OHRC — Policy on human rights and rental housing · ${name}`,
    url: `https://www.ohrc.on.ca/en/policy-human-rights-and-rental-housing/${slug}`, authority: 3, licence: OHRC_LIC, refreshDays: 90,
  })),
  { key: 'toronto-rentsafeto-tenants', kind: 'html', title: 'RentSafeTO for Tenants (City of Toronto)', url: 'https://www.toronto.ca/community-people/housing-shelter/rental-housing-tenant-information/rental-housing-standards/apartment-building-standards/rentsafeto-for-tenants/', authority: 4, licence: TORONTO_LIC, refreshDays: 90 },
  { key: 'toronto-rentsafeto-program', kind: 'html', title: 'RentSafeTO: Apartment Building Standards (City of Toronto)', url: 'https://www.toronto.ca/community-people/housing-shelter/rental-housing-tenant-information/rental-housing-standards/apartment-building-standards/', authority: 4, licence: TORONTO_LIC, refreshDays: 90 },
  { key: 'toronto-rentsafeto-owners', kind: 'html', title: 'RentSafeTO for Building Owners (City of Toronto)', url: 'https://www.toronto.ca/community-people/housing-shelter/rental-housing-tenant-information/rental-housing-standards/apartment-building-standards/rentsafeto-for-building-owners/', authority: 4, licence: TORONTO_LIC, refreshDays: 90 },
  { key: 'toronto-renovictions-bylaw', kind: 'html', title: 'Rental Renovation Licence By-law (City of Toronto)', url: 'https://www.toronto.ca/services-payments/permits-licences-bylaws/renovictions-bylaw-development/', authority: 4, licence: TORONTO_LIC, refreshDays: 30 },
  { key: 'toronto-renter-rights', kind: 'html', title: 'Renter Rights & Landlord Information (City of Toronto)', url: 'https://www.toronto.ca/community-people/housing-shelter/rental-housing-rights-information/renter-rights-landlord-information/', authority: 4, licence: TORONTO_LIC, refreshDays: 90 },
  { key: 'toronto-prevent-evictions', kind: 'html', title: 'Understand & Prevent Evictions (City of Toronto)', url: 'https://www.toronto.ca/community-people/housing-shelter/rental-housing-rights-information/understand-prevent-evictions/', authority: 4, licence: TORONTO_LIC, refreshDays: 90 },
  { key: 'toronto-property-standards', kind: 'html', title: 'Housing & Property Standards (City of Toronto)', url: 'https://www.toronto.ca/community-people/housing-shelter/rental-housing-rights-information/housing-property-standards/', authority: 4, licence: TORONTO_LIC, refreshDays: 90 },
]
