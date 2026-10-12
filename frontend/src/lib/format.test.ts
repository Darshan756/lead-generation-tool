import { formatLocation, formatMoney, mailtoLink, plural } from './format'

describe('formatMoney', () => {
  it('abbreviates and marks missing values', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(750_000)).toBe('$750K')
    expect(formatMoney(1_000_000)).toBe('$1M')
    expect(formatMoney(12_500_000)).toBe('$12.5M')
  })
})

describe('formatLocation', () => {
  it('handles partial and missing locations', () => {
    expect(formatLocation({ city: 'Austin', state: 'TX' })).toBe('Austin, TX')
    expect(formatLocation({ city: null, state: 'TX' })).toBe('TX')
    expect(formatLocation({ city: null, state: null })).toBe('—')
  })
})

describe('plural', () => {
  it('picks the right form', () => {
    expect(plural(1, 'lead')).toBe('1 lead')
    expect(plural(0, 'lead')).toBe('0 leads')
    expect(plural(1200, 'company', 'companies')).toBe('1,200 companies')
  })
})

describe('mailtoLink', () => {
  it('encodes subject and multi-line body', () => {
    expect(mailtoLink('a@b.example', 'Hi & hello', 'Line 1\nLine 2')).toBe(
      'mailto:a%40b.example?subject=Hi%20%26%20hello&body=Line%201%0ALine%202',
    )
  })
})
