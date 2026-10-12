import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NO_EMAIL, makeLead } from '../../test/fixtures'
import type { Lead } from '../../types'
import { LeadTable } from './LeadTable'

const LEADS: Lead[] = [
  makeLead(),
  makeLead({
    id: 2,
    company_name: 'Bravo Labs',
    domain: null,
    revenue_usd: null,
    ...NO_EMAIL,
    qualification: { ...makeLead().qualification, score: null, priority: 'unscored' },
  }),
]

function setup(selected: number[] = []) {
  const handlers = {
    onSort: vi.fn(),
    onToggle: vi.fn(),
    onTogglePage: vi.fn(),
    onOpen: vi.fn(),
    onExport: vi.fn(),
  }
  render(<LeadTable leads={LEADS} selected={new Set(selected)} sort={{ by: 'score', dir: 'desc' }} activeId={null} {...handlers} />)
  return handlers
}

describe('LeadTable', () => {
  it('shows status as text, including missing values', () => {
    setup()
    const bravo = screen.getByRole('row', { name: /Bravo Labs/ })
    expect(within(bravo).getByText('Needs email')).toBeInTheDocument()
    expect(within(bravo).getByText('Not scored')).toBeInTheDocument()
    expect(within(bravo).getByText('No website on record')).toBeInTheDocument()
    const alpha = screen.getByRole('row', { name: /Alpha Software/ })
    expect(within(alpha).getByText('Email ready')).toBeInTheDocument()
    expect(within(alpha).getByText('$5M')).toBeInTheDocument()
    expect(within(alpha).getByText('100')).toBeInTheDocument()
  })

  it('selects a single lead without opening its details', async () => {
    const handlers = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Bravo Labs' }))
    expect(handlers.onToggle).toHaveBeenCalledWith(2)
    expect(handlers.onOpen).not.toHaveBeenCalled()
  })

  it('select-all reflects none, some and all selected', async () => {
    const none = setup()
    const selectAll = screen.getByRole('checkbox', { name: 'Select all leads on this page' }) as HTMLInputElement
    expect(selectAll.checked).toBe(false)
    expect(selectAll.indeterminate).toBe(false)
    await userEvent.click(selectAll)
    expect(none.onTogglePage).toHaveBeenCalledWith(true)
  })

  it('select-all is indeterminate when only some rows are selected', () => {
    setup([1])
    const selectAll = screen.getByRole('checkbox', { name: 'Select all leads on this page' }) as HTMLInputElement
    expect(selectAll.indeterminate).toBe(true)
  })

  it('select-all deselects the page when everything is selected', async () => {
    const handlers = setup([1, 2])
    const selectAll = screen.getByRole('checkbox', { name: 'Select all leads on this page' }) as HTMLInputElement
    expect(selectAll.checked).toBe(true)
    await userEvent.click(selectAll)
    expect(handlers.onTogglePage).toHaveBeenCalledWith(false)
  })

  it('toggles sort direction on the active column and starts text columns A to Z', async () => {
    const handlers = setup()
    expect(screen.getByRole('columnheader', { name: /Score/ })).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(screen.getByRole('button', { name: /Score/ }))
    expect(handlers.onSort).toHaveBeenLastCalledWith({ by: 'score', dir: 'asc' })
    await userEvent.click(screen.getByRole('button', { name: /^Company/ }))
    expect(handlers.onSort).toHaveBeenLastCalledWith({ by: 'company_name', dir: 'asc' })
  })

  it('opens details from the company name and exports from the row menu', async () => {
    const handlers = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Alpha Software' }))
    expect(handlers.onOpen).toHaveBeenCalledWith(LEADS[0])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Alpha Software' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export as CSV' }))
    expect(handlers.onExport).toHaveBeenCalledWith(LEADS[0])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
