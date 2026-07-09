// TRREB Agreement to Lease — Residential (Form 400 structure) — the digital
// terms model. This is system #2 of two: it shares the same lease_documents
// row shape as the Ontario Standard Lease (form_type 'ontario_standard' in
// lib/lease/ontario.ts) with a different terms schema + renderer
// (components/lease/TrrebLeaseDoc.tsx). The Schedule A free text runs through
// the same checkAdditionalTerms() RTA/OHRC guardrail as Ontario's §15.

export type TrrebLeaseTerms = {
  // Parties (Form 400: Tenant = Lessee, Landlord = Lessor)
  landlord_legal_name: string
  tenant_names: string[]
  // Premises
  premises: {
    street: string
    unit?: string
    city: string
    postal?: string
  }
  // Term — "for a term of … commencing …"
  term: {
    start_date: string
    end_date: string
    duration_text?: string // e.g. "one (1) year"
  }
  // Rent — payable in advance on the first day of each month
  rent: {
    amount: number
    first_payment_date?: string
    payable_to?: string
    methods?: string
  }
  // Deposit — "upon acceptance", held by the Deposit Holder, credited toward
  // first and last month's rent (RTA: deposits beyond LMR are illegal)
  deposit: {
    amount?: number | null
    holder?: string // e.g. listing brokerage "in trust"
    applied_to_first_last?: boolean
  }
  // Use of premises — residential use only; only the named occupants
  use: {
    residential_only?: boolean
    occupant_names?: string
    occupant_count?: number
  }
  parking?: string
  locker?: string
  // Services & utilities included in rent (checked = landlord pays)
  services: {
    gas?: boolean
    hydro?: boolean
    water?: boolean
    heat?: boolean
    air_conditioning?: boolean
    cable_tv?: boolean
    internet?: boolean
    laundry?: boolean
    snow_removal?: boolean
    landscaping?: boolean
    other?: string
  }
  // Chattels included / fixtures rented (e.g. hot water tank)
  chattels_included?: string
  fixtures_rented?: string
  // Schedule(s) — Schedule A free text = additional terms (guardrailed)
  schedule_a?: string
  // Irrevocability — offer open for acceptance until this date
  irrevocability_date?: string
  // References / credit check acknowledgement clause
  references_credit_ack?: boolean
}

export function emptyTrrebTerms(): TrrebLeaseTerms {
  return {
    landlord_legal_name: '',
    tenant_names: [''],
    premises: { street: '', city: 'Toronto' },
    term: { start_date: '', end_date: '', duration_text: '' },
    rent: { amount: 0 },
    deposit: { amount: null, applied_to_first_last: true },
    use: { residential_only: true, occupant_count: 1 },
    services: {},
    chattels_included: '',
    fixtures_rented: '',
    schedule_a: '',
    references_credit_ack: true,
  }
}
