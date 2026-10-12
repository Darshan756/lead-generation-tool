import type { DataQuality } from '../types'
import { fieldCoverage } from './coverage'

const AT_CAPTURE: DataQuality = {
  total: 30,
  email_format_valid: 13,
  email_invalid_format: 5,
  email_missing: 12,
  website_missing: 2,
  phone_missing: 11,
  revenue_missing: 4,
  employees_missing: 6,
  owner_missing: 18,
  incomplete_key_info: 29,
  needs_manual_review: 5,
  duplicates_merged: 0,
  verified: 0,
}

describe('fieldCoverage', () => {
  it('reports every key field, not only email', () => {
    expect(fieldCoverage(AT_CAPTURE, AT_CAPTURE).map((field) => [field.label, field.missing, field.filled])).toEqual([
      ['Email', 17, 0], // 12 missing + 5 that fail the format check
      ['Phone', 11, 0],
      ['Website', 2, 0],
      ['Contact name', 18, 0],
      ['Revenue', 4, 0],
      ['Company size', 6, 0],
    ])
  })

  it('shows how many gaps enrichment filled', () => {
    const now = { ...AT_CAPTURE, email_format_valid: 23, email_invalid_format: 1, email_missing: 6, phone_missing: 0, owner_missing: 8 }
    const byKey = Object.fromEntries(fieldCoverage(now, AT_CAPTURE).map((field) => [field.key, field]))
    expect(byKey.email).toMatchObject({ missing: 7, filled: 10 })
    expect(byKey.phone).toMatchObject({ missing: 0, filled: 11 })
    expect(byKey.owner_name).toMatchObject({ missing: 8, filled: 10 })
    expect(byKey.website).toMatchObject({ missing: 2, filled: 0 })
  })

  it('never reports a negative fill when a value was cleared by hand', () => {
    const now = { ...AT_CAPTURE, phone_missing: 12 }
    expect(fieldCoverage(now, AT_CAPTURE).find((field) => field.key === 'phone')).toMatchObject({ missing: 12, filled: 0 })
  })
})
