import type { LeadFilters } from '../types'
import { EMPTY_FILTERS, activeFilterChips, describeCriteria, revenueLabel, suggestSnapshotName, toCriteria, toSearchParams } from './filters'

const FILTERS: LeadFilters = {
  q: '  acme ',
  industries: ['Software Development', 'Manufacturing'],
  states: ['CA'],
  revenue_min: 1_000_000,
  revenue_max: null,
  priorities: ['high'],
  confidences: ['low', 'medium'],
  contact_statuses: ['needs_enrichment'],
}

describe('toSearchParams', () => {
  it('sends only sort and paging when no filter is set', () => {
    const params = toSearchParams(EMPTY_FILTERS, { by: 'score', dir: 'desc' }, 1, 25)
    expect(params.toString()).toBe('sort_by=score&sort_dir=desc&page=1&page_size=25')
  })

  it('repeats multi-value filters and trims the search text', () => {
    const params = toSearchParams(FILTERS, { by: 'company_name', dir: 'asc' }, 2, 25)
    expect(params.get('q')).toBe('acme')
    expect(params.getAll('industries')).toEqual(['Software Development', 'Manufacturing'])
    expect(params.getAll('confidences')).toEqual(['low', 'medium'])
    expect(params.get('revenue_min')).toBe('1000000')
    expect(params.has('revenue_max')).toBe(false)
    expect(params.get('page')).toBe('2')
  })
})

describe('toCriteria', () => {
  it('keeps only the filters that are applied', () => {
    expect(toCriteria(EMPTY_FILTERS)).toEqual({})
    expect(toCriteria({ ...EMPTY_FILTERS, q: '   ' })).toEqual({})
    expect(toCriteria(FILTERS)).toEqual({
      q: 'acme',
      industries: ['Software Development', 'Manufacturing'],
      states: ['CA'],
      revenue_min: 1_000_000,
      priorities: ['high'],
      confidences: ['low', 'medium'],
      contact_statuses: ['needs_enrichment'],
    })
  })
})

describe('activeFilterChips', () => {
  it('is empty when nothing is filtered', () => {
    expect(activeFilterChips(EMPTY_FILTERS)).toEqual([])
  })

  it('creates one chip per applied value', () => {
    const labels = activeFilterChips(FILTERS).map((chip) => chip.label)
    expect(labels).toEqual([
      'Search: “acme”',
      'Software Development',
      'Manufacturing',
      'State: CA',
      'Revenue: $1M or more',
      'Priority: High',
      'Confidence: Low',
      'Confidence: Medium',
      'Needs email',
    ])
  })

  it('removes exactly the chip that was clicked', () => {
    const chips = activeFilterChips(FILTERS)
    const manufacturing = chips.find((chip) => chip.label === 'Manufacturing')!
    expect(manufacturing.remove(FILTERS).industries).toEqual(['Software Development'])
    const revenue = chips.find((chip) => chip.key === 'revenue')!
    expect(revenue.remove({ ...FILTERS, revenue_max: 5_000_000 })).toMatchObject({ revenue_min: null, revenue_max: null })
    // Removing every chip gets back to no active filters.
    const cleared = chips.reduce((filters, chip) => chip.remove(filters), FILTERS)
    expect(activeFilterChips(cleared)).toEqual([])
  })
})

describe('revenueLabel', () => {
  it('describes open and closed ranges', () => {
    expect(revenueLabel(null, null)).toBeNull()
    expect(revenueLabel(500_000, 2_000_000)).toBe('$500K – $2M')
    expect(revenueLabel(null, 10_000_000)).toBe('Up to $10M')
    expect(revenueLabel(0, null)).toBe('$0 or more')
  })
})

describe('describeCriteria', () => {
  it('describes stored snapshot criteria in plain language', () => {
    expect(describeCriteria({})).toEqual([])
    expect(describeCriteria(toCriteria(FILTERS))).toEqual([
      'Search: “acme”',
      'Category: Software Development, Manufacturing',
      'State: CA',
      'Revenue: $1M or more',
      'Priority: High',
      'Confidence: Low, Medium',
      'Contact: Needs email',
    ])
  })
})

describe('suggestSnapshotName', () => {
  const october = new Date(2026, 9, 12)

  it('builds a name from the filters', () => {
    expect(suggestSnapshotName({ ...EMPTY_FILTERS, states: ['CA'], industries: ['Healthcare'] }, october)).toBe(
      'CA Healthcare leads — October 2026',
    )
    expect(suggestSnapshotName({ ...EMPTY_FILTERS, q: 'dental' }, october)).toBe('“dental” leads — October 2026')
  })

  it('falls back to a generic name', () => {
    expect(suggestSnapshotName(EMPTY_FILTERS, october)).toBe('Selected leads — October 2026')
  })
})
