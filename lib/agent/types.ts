// Stayloop V5.3 — Agent spine types
// Source of truth: /tenant/agent execution spec §9–§10.
// Shared by all three roles (tenant · landlord · agent).

export type AgentRole = 'tenant' | 'landlord' | 'agent'

export type AgentStatus =
  | 'idle'
  | 'understanding'
  | 'working'
  | 'result'
  | 'approval'

export type PendingActionType =
  | 'share_passport_summary'
  | 'submit_application'
  | 'send_message'
  | 'schedule_viewing'
  | 'sign_lease'
  | 'payment_authorization'
  | 'send_renewal_letter'
  | 'rent_reminder'
  | string

export type PendingAction = {
  id: string
  user_id: string
  workflow_id?: string | null
  role: AgentRole
  action_type: PendingActionType
  title: string
  summary: string
  recipient_label?: string | null
  data_scope: string[]
  excluded_data: string[]
  risk_level: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  requires_approval: boolean
  created_at: string
  expires_at?: string | null
  metadata: Record<string, unknown>
}

export type AgentConfig = {
  id: string
  user_id: string
  agent_name: string
  role: AgentRole
  tone: string
  model_tier: string
  automation_level: 'approval_required' | string
  memory_enabled: boolean
}

export type AgentSession = {
  id: string
  user_id: string
  agent_config_id: string
  role: AgentRole
  status: 'active' | 'ended' | 'error'
  started_at: string
}

export type WorkflowState = {
  workflow_type: string
  workflow_id: string | null
  current_stage: string
  completed_steps: string[]
  status: 'active' | 'paused' | 'completed' | 'archived'
}

export type MemoryItem = {
  key: string
  label: string
  value: unknown
  confidence: number
  memory_type: string
}

export type AgentResult = {
  title: string
  body: string
  kind: 'summary' | 'recommendation' | 'warning' | 'approval_prompt'
}

export type ListingCard = {
  id: string
  source: 'stayloop' | 'realtor'
  title: string
  address: string
  neighborhood?: string
  city?: string
  price: number
  beds: number
  baths?: number
  sqft?: number
  tier?: number
  image?: string
  tags?: string[]
  url?: string
  note?: string
}

export type DraftListing = {
  title?: string
  address: string
  unit?: string
  city?: string
  neighborhood?: string
  monthly_rent: number
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  available_date?: string
  description?: string
  parking?: string
  pet_policy?: string
  amenities?: string[]
  has_den?: boolean
  property_type?: string
  images?: string[]
  // Realtor.ca / CREA DDF-aligned fields (see 20260707_listings_ddf_alignment.sql)
  ownership_title?: string
  bedrooms_above_grade?: number
  bedrooms_below_grade?: number
  bathrooms_half?: number
  sqft_max?: number
  storeys?: number
  land_size?: string
  heating_type?: string
  heating_fuel?: string
  cooling?: string
  basement_type?: string
  exterior_finish?: string
  appliances?: string[]
  building_features?: string[]
  pets_allowed?: string
  parking_spaces?: number
  maintenance_fee?: number
  management_company?: string
  cross_streets?: string
  furnished?: boolean
  deposit?: number
  lease_term?: string
  virtual_tour_url?: string
  year_built?: number
  mls_number?: string
  source_url?: string
}

export type ChatAttachment = {
  name: string
  mediaType: string
  dataUrl: string // data:<mime>;base64,<...>
  isImage: boolean
}

// Real market context computed server-side from actual listing prices
// (Realtor.ca parse) — never hallucinated by the model.
export type MarketInsight = {
  area: string
  beds?: number | null
  sample: number
  min: number
  median: number
  max: number
  budget?: number | null
  // Official benchmark from the TRREB quarterly Rental Market Report
  // (average LEASED rent, TRREB-wide, cached in trreb_rent_stats).
  trreb?: {
    period: string
    avg: number
    prev_avg?: number | null
    leased?: number | null
  }
}

// A clarifying question the agent proactively asks, with tap-to-answer chips.
export type FollowUp = {
  question: string
  options: string[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'agent'
  text: string
  attachments?: ChatAttachment[]
  listings?: ListingCard[]
  listingsSource?: 'stayloop' | 'realtor'
  market?: MarketInsight
  followups?: FollowUp[]
  draftListing?: DraftListing
}

export type Recommendation = {
  id: string
  title: string
  description: string
  href?: string
  badge?: string
}

export type AgentSessionResponse = {
  session: AgentSession
  agent: AgentConfig
  workflow: WorkflowState
  status: AgentStatus
  memories: MemoryItem[]
  pendingActions: PendingAction[]
  latestResult?: AgentResult
  recommendations: Recommendation[]
}

// The control principles that must hold for every role (handbook §03/§07).
export const CONTROL_RULES = {
  keyActionsRequireApproval: true,
  sensitiveDataScoped: true,
  suggestionIsNotExecution: true,
  dualWriteAudit: true,
} as const
