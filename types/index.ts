export type ApplicationStatus = 'new' | 'reviewing' | 'approved' | 'declined'

export interface Listing {
  id: string
  landlord_id: string
  address: string
  unit?: string
  city: string
  province: string
  monthly_rent: number
  bedrooms?: number
  bathrooms?: number
  available_date?: string
  slug: string
  is_active: boolean
  created_at: string
}

export interface Application {
  id: string
  listing_id: string
  first_name: string
  last_name: string
  email: string
  phone?: string
  date_of_birth?: string
  current_address?: string
  employment_status?: string
  employer_name?: string
  job_title?: string
  monthly_income?: number
  employment_start_date?: string
  employer_phone?: string
  employer_email?: string
  prev_landlord_name?: string
  prev_landlord_phone?: string
  prev_address?: string
  prev_rent?: number
  prev_move_in?: string
  prev_move_out?: string
  reason_for_leaving?: string
  num_occupants: number
  has_pets: boolean
  pet_details?: string
  is_smoker: boolean
  move_in_date?: string
  additional_notes?: string
  consent_screening: boolean
  consent_credit_check: boolean
  ai_score?: number
  ai_summary?: string
  ai_income_score?: number
  ai_employment_score?: number
  ai_rental_history_score?: number
  ai_ltb_score?: number
  ai_reference_score?: number
  ltb_records_found: number
  ltb_records_json?: any
  status: ApplicationStatus
  created_at: string
  listing?: Listing
}
