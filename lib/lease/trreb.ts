// Offer-to-lease summary of terms (Stayloop's own format) — the digital terms
// model behind form_type 'trreb'. This is system #2 of two: it shares the same
// lease_documents row shape as the Ontario Standard Lease (form_type
// 'ontario_standard' in lib/lease/ontario.ts) with a different terms schema +
// renderer (components/lease/TrrebLeaseDoc.tsx). The additional-terms free text
// runs through the same checkAdditionalTerms() RTA/OHRC guardrail as Ontario's §15.
//
// 2026-10-16 (V1.0 stage 2, discussion paper item 3): 原 Form 400 对照已移除。
// This summary is Stayloop's own layout of the points an offer settles before
// the Ontario standard lease is signed; it does not reproduce, mirror or stand
// in for any real-estate-board form, and only the landlord's workbench
// (/landlord/leases/new) can draft it. The form_type value 'trreb' and the file
// name stay for the stored rows and imports.

export type OfferSummaryTerms = {
  // Parties
  landlord_legal_name: string
  tenant_names: string[]
  // Premises
  premises: {
    street: string
    unit?: string
    city: string
    postal?: string
  }
  // Term — start, end and an optional spelled-out duration
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
  // Deposit — held by the named holder; RTA s.105–106: at most one month,
  // applied only to the last rental period
  deposit: {
    amount?: number | null
    holder?: string // e.g. a brokerage "in trust"
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
  // Additional terms free text (guardrailed); the stored key keeps its name
  schedule_a?: string
  // Offer open for acceptance until this date
  irrevocability_date?: string
  // References / credit check acknowledgement clause
  references_credit_ack?: boolean
}

export function emptyOfferSummaryTerms(): OfferSummaryTerms {
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
