export type Priority = 'high' | 'medium' | 'low' | 'unscored'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type ContactStatus = 'email_ready' | 'invalid_email' | 'needs_enrichment'
export type SignalStatus = 'matched' | 'not_matched' | 'missing' | 'not_configured'
export type SnapshotStage = 'raw' | 'enriched' | 'drafted'
export type FieldSource = 'simulated' | 'manual'

export interface Signal {
  key: string
  label: string
  status: SignalStatus
  points: number
  max_points: number
  detail: string
}

export interface Qualification {
  score: number | null
  priority: Priority
  signals: Signal[]
  positives: string[]
  negatives: string[]
  review_items: string[]
  next_action: string
}

export interface Confidence {
  level: ConfidenceLevel
  percent: number
  missing_fields: string[]
}

export interface LeadData {
  company_name: string
  industry: string | null
  city: string | null
  state: string | null
  website: string | null
  domain: string | null
  email: string | null
  phone: string | null
  revenue_usd: number | null
  employee_count: number | null
  owner_name: string | null
  owner_title: string | null
  founded_year: number | null
}

/** Everything the UI needs to show a company, whether live or in a snapshot. */
export interface EvaluatedLead extends LeadData {
  id: number
  contact_status: ContactStatus
  confidence: Confidence
  qualification: Qualification
}

export interface Lead extends EvaluatedLead {
  merged_duplicates: number
  source: string
}

export interface LeadFilters {
  q: string
  industries: string[]
  states: string[]
  revenue_min: number | null
  revenue_max: number | null
  priorities: Priority[]
  confidences: ConfidenceLevel[]
  contact_statuses: ContactStatus[]
}

export type SortField =
  | 'score'
  | 'company_name'
  | 'industry'
  | 'state'
  | 'revenue_usd'
  | 'employee_count'
  | 'confidence'

export interface LeadSort {
  by: SortField
  dir: 'asc' | 'desc'
}

export interface LeadPage {
  items: Lead[]
  total: number
  page: number
  page_size: number
  matching_ids: number[]
  profile_configured: boolean
}

export interface FacetValue {
  value: string
  count: number
}

export interface LeadFacets {
  industries: FacetValue[]
  states: FacetValue[]
  revenue_min: number | null
  revenue_max: number | null
}

export interface ImportResult {
  filename: string
  rows_read: number
  inserted: number
  duplicates_merged: number
  skipped: { row: number; reason: string }[]
}

export interface TargetProfileInput {
  industries: string[]
  states: string[]
  revenue_min: number | null
  revenue_max: number | null
}

export interface TargetProfile extends TargetProfileInput {
  configured: boolean
  weights: Record<string, number>
  high_threshold: number
  medium_threshold: number
}

export interface DataQuality {
  total: number
  email_format_valid: number
  email_invalid_format: number
  email_missing: number
  website_missing: number
  phone_missing: number
  revenue_missing: number
  employees_missing: number
  owner_missing: number
  incomplete_key_info: number
  needs_manual_review: number
  duplicates_merged: number
  verified: number
}

/** Stored snapshot criteria: only the filters that were actually applied. */
export type SnapshotCriteria = Partial<LeadFilters>

export interface SnapshotSummary {
  id: number
  name: string
  description: string | null
  criteria: SnapshotCriteria
  profile: TargetProfileInput
  created_at: string
  enriched_at: string | null
  stage: SnapshotStage
  lead_count: number
  email_ready: number
  email_ready_at_creation: number
  invalid_email: number
  needs_enrichment: number
  incomplete_count: number
  enriched_lead_count: number
  draft_count: number
}

export interface SnapshotLead extends EvaluatedLead {
  snapshot_id: number
  snapshot_name: string
  lead_id: number | null
  field_sources: Record<string, FieldSource>
  enriched_at: string | null
  original: {
    contact_status: ContactStatus
    email: string | null
    score: number | null
    confidence_percent: number
  }
  has_draft: boolean
}

export interface SnapshotDetail extends SnapshotSummary {
  leads: SnapshotLead[]
  quality: DataQuality
  quality_at_creation: DataQuality
}

export interface SnapshotCreateInput {
  name: string
  description: string
  lead_ids: number[]
  criteria: SnapshotCriteria
}

export interface NamedItem {
  snapshot_lead_id: number
  company_name: string
  reason: string
}

export interface EnrichResult {
  processed: number
  enriched: number
  already_complete: number
  emails_added: number
  fields_filled: Record<string, number>
  no_match: NamedItem[]
  snapshot: SnapshotDetail
}

export interface SnapshotLeadUpdate {
  website?: string | null
  email?: string | null
  phone?: string | null
  owner_name?: string | null
  owner_title?: string | null
  revenue_usd?: number | null
  employee_count?: number | null
}

export interface OutreachTemplate {
  id: number
  name: string
  subject: string
  body: string
}

export interface TemplateVariable {
  name: string
  description: string
  fallback: string
}

export interface DraftPreview {
  to_email: string | null
  subject: string
  body: string
  fallbacks_used: string[]
  unknown_variables: string[]
}

export interface OutreachDraft {
  id: number
  snapshot_id: number
  snapshot_name: string
  snapshot_lead_id: number
  company_name: string
  industry: string | null
  owner_name: string | null
  to_email: string
  subject: string
  body: string
  created_at: string
  updated_at: string
}

export interface GenerateInput {
  snapshot_lead_ids: number[]
  subject: string
  body: string
  template_id: number | null
  overwrite: boolean
}

export interface GenerateResult {
  requested: number
  created: number
  updated: number
  skipped: NamedItem[]
  unknown_variables: string[]
  drafts: OutreachDraft[]
}
