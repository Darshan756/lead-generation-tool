import type { DataQuality } from '../types'

export interface FieldCoverage {
  key: string
  label: string
  /** Leads that still lack a usable value for this field. */
  missing: number
  /** How many were missing at capture and have since been filled. */
  filled: number
}

/**
 * Per-field gaps in a snapshot, compared with when it was captured.
 * For email, an address that fails the format check counts as missing,
 * because it cannot be used.
 */
export function fieldCoverage(now: DataQuality, atCapture: DataQuality): FieldCoverage[] {
  const row = (key: string, label: string, pick: (quality: DataQuality) => number): FieldCoverage => ({
    key,
    label,
    missing: pick(now),
    filled: Math.max(0, pick(atCapture) - pick(now)),
  })
  return [
    row('email', 'Email', (q) => q.total - q.email_format_valid),
    row('phone', 'Phone', (q) => q.phone_missing),
    row('website', 'Website', (q) => q.website_missing),
    row('owner_name', 'Contact name', (q) => q.owner_missing),
    row('revenue_usd', 'Revenue', (q) => q.revenue_missing),
    row('employee_count', 'Company size', (q) => q.employees_missing),
  ]
}
