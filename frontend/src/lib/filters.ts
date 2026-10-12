import type { ConfidenceLevel, ContactStatus, LeadFilters, LeadSort, Priority, SnapshotCriteria } from '../types'
import { CONFIDENCE_LABELS, CONTACT_LABELS, PRIORITY_LABELS, formatMoney } from './format'

export const EMPTY_FILTERS: LeadFilters = {
  q: '',
  industries: [],
  states: [],
  revenue_min: null,
  revenue_max: null,
  priorities: [],
  confidences: [],
  contact_statuses: [],
}

export const REVENUE_STEPS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000]

/** Query string for GET /leads. Empty filters are simply left out. */
export function toSearchParams(filters: LeadFilters, sort: LeadSort, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams()
  const q = filters.q.trim()
  if (q) params.set('q', q)
  filters.industries.forEach((value) => params.append('industries', value))
  filters.states.forEach((value) => params.append('states', value))
  if (filters.revenue_min !== null) params.set('revenue_min', String(filters.revenue_min))
  if (filters.revenue_max !== null) params.set('revenue_max', String(filters.revenue_max))
  filters.priorities.forEach((value) => params.append('priorities', value))
  filters.confidences.forEach((value) => params.append('confidences', value))
  filters.contact_statuses.forEach((value) => params.append('contact_statuses', value))
  params.set('sort_by', sort.by)
  params.set('sort_dir', sort.dir)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  return params
}

/** The filters that are actually applied, in the shape a lead list stores. */
export function toCriteria(filters: LeadFilters): SnapshotCriteria {
  const criteria: SnapshotCriteria = {}
  const q = filters.q.trim()
  if (q) criteria.q = q
  if (filters.industries.length) criteria.industries = filters.industries
  if (filters.states.length) criteria.states = filters.states
  if (filters.revenue_min !== null) criteria.revenue_min = filters.revenue_min
  if (filters.revenue_max !== null) criteria.revenue_max = filters.revenue_max
  if (filters.priorities.length) criteria.priorities = filters.priorities
  if (filters.confidences.length) criteria.confidences = filters.confidences
  if (filters.contact_statuses.length) criteria.contact_statuses = filters.contact_statuses
  return criteria
}

export function revenueLabel(min: number | null | undefined, max: number | null | undefined): string | null {
  const hasMin = min !== null && min !== undefined
  const hasMax = max !== null && max !== undefined
  if (hasMin && hasMax) return `${formatMoney(min)} – ${formatMoney(max)}`
  if (hasMin) return `${formatMoney(min)} or more`
  if (hasMax) return `Up to ${formatMoney(max)}`
  return null
}

export interface FilterChip {
  key: string
  label: string
  /** Returns the filters with this one chip removed. */
  remove: (filters: LeadFilters) => LeadFilters
}

export function activeFilterChips(filters: LeadFilters): FilterChip[] {
  const chips: FilterChip[] = []
  const q = filters.q.trim()
  if (q) chips.push({ key: 'q', label: `Search: “${q}”`, remove: (f) => ({ ...f, q: '' }) })
  for (const value of filters.industries) {
    chips.push({
      key: `industry:${value}`,
      label: value,
      remove: (f) => ({ ...f, industries: f.industries.filter((v) => v !== value) }),
    })
  }
  for (const value of filters.states) {
    chips.push({
      key: `state:${value}`,
      label: `State: ${value}`,
      remove: (f) => ({ ...f, states: f.states.filter((v) => v !== value) }),
    })
  }
  const revenue = revenueLabel(filters.revenue_min, filters.revenue_max)
  if (revenue) {
    chips.push({
      key: 'revenue',
      label: `Revenue: ${revenue}`,
      remove: (f) => ({ ...f, revenue_min: null, revenue_max: null }),
    })
  }
  for (const value of filters.priorities) {
    chips.push({
      key: `priority:${value}`,
      label: `Priority: ${PRIORITY_LABELS[value]}`,
      remove: (f) => ({ ...f, priorities: f.priorities.filter((v) => v !== value) }),
    })
  }
  for (const value of filters.confidences) {
    chips.push({
      key: `confidence:${value}`,
      label: `Confidence: ${CONFIDENCE_LABELS[value]}`,
      remove: (f) => ({ ...f, confidences: f.confidences.filter((v) => v !== value) }),
    })
  }
  for (const value of filters.contact_statuses) {
    chips.push({
      key: `contact:${value}`,
      label: CONTACT_LABELS[value].short,
      remove: (f) => ({ ...f, contact_statuses: f.contact_statuses.filter((v) => v !== value) }),
    })
  }
  return chips
}

/** Human-readable lines describing stored lead list criteria. */
export function describeCriteria(criteria: SnapshotCriteria): string[] {
  const lines: string[] = []
  if (criteria.q) lines.push(`Search: “${criteria.q}”`)
  if (criteria.industries?.length) lines.push(`Category: ${criteria.industries.join(', ')}`)
  if (criteria.states?.length) lines.push(`State: ${criteria.states.join(', ')}`)
  const revenue = revenueLabel(criteria.revenue_min, criteria.revenue_max)
  if (revenue) lines.push(`Revenue: ${revenue}`)
  if (criteria.priorities?.length) {
    lines.push(`Priority: ${criteria.priorities.map((p: Priority) => PRIORITY_LABELS[p]).join(', ')}`)
  }
  if (criteria.confidences?.length) {
    lines.push(`Confidence: ${criteria.confidences.map((c: ConfidenceLevel) => CONFIDENCE_LABELS[c]).join(', ')}`)
  }
  if (criteria.contact_statuses?.length) {
    lines.push(`Contact: ${criteria.contact_statuses.map((c: ContactStatus) => CONTACT_LABELS[c].short).join(', ')}`)
  }
  return lines
}

/** A sensible default lead list name built from the applied filters. */
export function suggestSnapshotName(filters: LeadFilters, now = new Date()): string {
  const month = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const parts: string[] = []
  if (filters.states.length && filters.states.length <= 2) parts.push(filters.states.join(' & '))
  if (filters.industries.length && filters.industries.length <= 2) parts.push(filters.industries.join(' & '))
  if (!parts.length && filters.q.trim()) parts.push(`“${filters.q.trim()}”`)
  return `${parts.length ? parts.join(' ') : 'Selected'} leads — ${month}`
}
