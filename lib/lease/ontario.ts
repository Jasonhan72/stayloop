// Ontario Standard Form of Lease (Residential Tenancy Agreement, form 2229E
// structure) — the digital terms model. This is system #1 of two: form_type
// 'ontario_standard' now, RECO/TRREB agreement forms ('trreb') later share
// the same lease_documents row shape with a different terms schema+renderer.

export type OntarioLeaseTerms = {
  // §1 Parties
  landlord_legal_name: string
  tenant_names: string[]
  // §2 Rental unit
  unit: {
    street: string
    unit?: string
    city: string
    postal?: string
    parking?: string
    is_condo?: boolean
  }
  // §3 Contact / notices
  contact: {
    landlord_notice_address?: string
    landlord_email?: string
    email_consent?: boolean
  }
  // §4 Term
  term: {
    start_date: string
    type: 'fixed' | 'monthly'
    end_date?: string
  }
  // §5 Rent
  rent: {
    amount: number
    due_day: string // e.g. "first day of each month"
    payable_to?: string
    methods?: string
    parking_amount?: number
    nsf_charge?: number
  }
  // §6 Services & utilities
  services: {
    gas?: boolean
    air_conditioning?: boolean
    storage?: boolean
    laundry_in_unit?: boolean
    guest_parking?: boolean
    other?: string
  }
  utilities: {
    electricity: 'landlord' | 'tenant'
    heat: 'landlord' | 'tenant'
    water: 'landlord' | 'tenant'
  }
  // §7–§11
  rent_discounts?: string
  rent_deposit?: number | null // last month's rent only — RTA s.106
  key_deposit?: number | null  // refundable, max actual key cost — RTA s.105
  smoking_rules?: string
  tenant_insurance_required?: boolean
  // §15 Additional terms (must not conflict with the RTA — void if they do)
  additional_terms?: string
}

export function emptyOntarioTerms(): OntarioLeaseTerms {
  return {
    landlord_legal_name: '',
    tenant_names: [''],
    unit: { street: '', city: 'Toronto' },
    contact: { email_consent: true },
    term: { start_date: '', type: 'fixed', end_date: '' },
    rent: { amount: 0, due_day: 'first day of each month' },
    services: {},
    utilities: { electricity: 'tenant', heat: 'landlord', water: 'landlord' },
    rent_deposit: null,
    key_deposit: null,
    tenant_insurance_required: true,
    additional_terms: '',
  }
}

/** Compliance check on the free-text additional terms — the same OHRC/RTA
 *  red lines the agent guardrail enforces. A term that is void under the
 *  RTA must not make it into a signed document. */
const VOID_TERM_PATTERNS: Array<{ re: RegExp; reason_zh: string; reason_en: string }> = [
  { re: /(禁止养宠|不(允许|得|可)养宠|no[\s-]?pets?\b|pets?\s+not\s+allowed)/i,
    reason_zh: '"禁止养宠"条款在安省 RTA 下无效（s.14）', reason_en: '"No pets" clauses are void under RTA s.14' },
  { re: /(不(允许|接受|租)(有)?(小孩|孩子|儿童|家庭)|no\s+(children|kids|families))/i,
    reason_zh: '排除儿童/家庭违反 OHRC 受保护特征', reason_en: 'Excluding children/families violates the OHRC (family status)' },
  { re: /(damage\s+deposit|损坏押金|押金.{0,6}(两|2|叁|3)个月)/i,
    reason_zh: '损坏押金/超过一个月的押金在安省不合法（RTA s.105-106）', reason_en: 'Damage deposits / deposits beyond LMR are illegal in Ontario (RTA s.105-106)' },
  { re: /(种族|国籍|宗教|性取向|残疾|残障|social\s+assistance|race\b|religio|national\s+origin|sexual\s+orientation|disabilit)/i,
    reason_zh: '条款涉及 OHRC 受保护特征', reason_en: 'Term references an OHRC protected ground' },
]

export function checkAdditionalTerms(text: string): { ok: boolean; issues: { zh: string; en: string }[] } {
  const issues: { zh: string; en: string }[] = []
  for (const p of VOID_TERM_PATTERNS) {
    if (p.re.test(text)) issues.push({ zh: p.reason_zh, en: p.reason_en })
  }
  return { ok: issues.length === 0, issues }
}

export type LeaseSignature = {
  name: string
  signed_at: string // ISO
  role: 'landlord' | 'tenant'
}
