// Stayloop core domain types — used by dashboard, apply page, and APIs.

export type Plan = 'free' | 'pro' | 'enterprise'
export type AppStatus = 'new' | 'reviewing' | 'approved' | 'declined'

export interface Landlord {
  id: string
  auth_id: string
  email: string
  full_name?: string | null
  phone?: string | null
  plan: Plan
  plan_status?: string | null
  plan_current_period_end?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  created_at?: string
}

export interface Listing {
  id: string
  landlord_id: string
  address: string
  unit?: string | null
  city: string
  province: string
  monthly_rent: number
  bedrooms?: number | null
  bathrooms?: number | null
  slug: string
  is_active: boolean
  created_at?: string
}

export type FileKind =
  | 'id'
  | 'paystub'
  | 'bank_statement'
  | 'employment_letter'
  | 'other'

export interface ApplicationFile {
  // V5 prefers `kind`; legacy code may set `type`. Both are accepted.
  kind: FileKind
  type?: FileKind
  path: string
  name: string
  size: number
  mime?: string
  uploaded_at?: string
}

export interface Application {
  id: string
  listing_id: string
  // Both legacy + new shapes — DB has first/last name + a derived full_name
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  email: string
  phone?: string | null
  monthly_income?: number | null
  employer?: string | null
  occupation?: string | null
  notes?: string | null
  created_at: string
  notified_at?: string | null
  status?: AppStatus | null

  // 6-dim AI scoring
  ai_overall_score?: number | null
  ai_score?: number | null // alias kept for backwards compat
  ai_extracted_name?: string | null
  doc_authenticity?: number | null
  payment_ability?: number | null
  court_records?: number | null
  stability?: number | null
  behavior_signals?: number | null
  info_consistency?: number | null
  doc_authenticity_note?: string | null
  payment_ability_note?: string | null
  court_records_note?: string | null
  stability_note?: string | null
  behavior_signals_note?: string | null
  info_consistency_note?: string | null

  // CanLII court search
  court_search_done?: boolean | null
  court_search_count?: number | null
  court_search_summary?: string | null
  court_records_score?: number | null
  ltb_records_found?: number | null

  files?: ApplicationFile[] | null

  // Joined relation
  listing?: Listing
}
