import type { ConfidenceLevel, ContactStatus, LeadData, Priority, SnapshotStage } from '../types'

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unscored: 'Not scored',
}

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const CONTACT_LABELS: Record<ContactStatus, { short: string; help: string }> = {
  email_ready: {
    short: 'Email ready',
    help: 'An email is on record and its format is valid. Deliverability has not been verified.',
  },
  invalid_email: {
    short: 'Email invalid',
    help: 'The email on record fails the format check and needs correcting.',
  },
  needs_enrichment: {
    short: 'Needs email',
    help: 'No email on record. The lead can still be saved and enriched later.',
  },
}

export const STAGE_LABELS: Record<SnapshotStage, { label: string; help: string }> = {
  raw: { label: 'Captured', help: 'Saved from Find Leads. Not enriched yet.' },
  enriched: { label: 'Enriched', help: 'At least one lead has been enriched.' },
  drafted: { label: 'Drafts ready', help: 'Outreach drafts exist for this list.' },
}

export const FIELD_LABELS: Record<string, string> = {
  website: 'Website',
  email: 'Email',
  phone: 'Phone',
  revenue_usd: 'Revenue',
  employee_count: 'Company size',
  owner_name: 'Contact name',
  owner_title: 'Contact title',
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${value}`
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-US')
}

export function formatLocation(lead: Pick<LeadData, 'city' | 'state'>): string {
  return [lead.city, lead.state].filter(Boolean).join(', ') || '—'
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? singular : pluralForm}`
}

export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
