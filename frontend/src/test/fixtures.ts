import type { Lead, SnapshotLead } from '../types'

export function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 1,
    company_name: 'Alpha Software',
    industry: 'Software Development',
    city: 'San Diego',
    state: 'CA',
    website: 'https://www.alpha.example',
    domain: 'alpha.example',
    email: 'hello@alpha.example',
    phone: '(619) 555-0101',
    revenue_usd: 5_000_000,
    employee_count: 30,
    owner_name: 'Avery Whitlock',
    owner_title: 'Founder',
    founded_year: 2011,
    merged_duplicates: 0,
    source: 'synthetic_demo',
    contact_status: 'email_ready',
    confidence: { level: 'high', percent: 100, missing_fields: [] },
    qualification: {
      score: 100,
      priority: 'high',
      signals: [
        { key: 'industry', label: 'Target industry', status: 'matched', points: 25, max_points: 25, detail: 'Software Development is a target industry.' },
      ],
      positives: ['Software Development is a target industry.'],
      negatives: [],
      review_items: [],
      next_action: 'Prepare outreach',
    },
    ...overrides,
  }
}

export function makeSnapshotLead(overrides: Partial<SnapshotLead> = {}): SnapshotLead {
  const { merged_duplicates: _merged, source: _source, ...lead } = makeLead()
  return {
    ...lead,
    snapshot_id: 7,
    snapshot_name: 'CA Software',
    lead_id: lead.id,
    field_sources: {},
    enriched_at: null,
    original: { contact_status: 'email_ready', email: lead.email, score: 100, confidence_percent: 100 },
    has_draft: false,
    ...overrides,
  }
}

export const NO_EMAIL: Partial<Lead> = {
  email: null,
  contact_status: 'needs_enrichment',
  confidence: { level: 'medium', percent: 63, missing_fields: ['Email'] },
}
