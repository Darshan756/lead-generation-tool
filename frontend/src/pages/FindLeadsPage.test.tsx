import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../components/ui/Toast'
import { leadService } from '../services/lead-service'
import { makeLead } from '../test/fixtures'
import type { LeadPage } from '../types'
import { FindLeadsPage } from './FindLeadsPage'

vi.mock('../services/lead-service', () => ({
  leadService: {
    search: vi.fn(),
    facets: vi.fn(),
    dataQuality: vi.fn(),
    getTargetProfile: vi.fn(),
  },
}))
const search = vi.mocked(leadService.search)

const PAGE: LeadPage = {
  items: [makeLead()],
  total: 1,
  page: 1,
  page_size: 25,
  matching_ids: [1],
  profile_configured: true,
}

function setup() {
  render(
    <ToastProvider>
      <MemoryRouter>
        <FindLeadsPage />
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('FindLeadsPage', () => {
  beforeEach(() => {
    search.mockReset()
    search.mockResolvedValue(PAGE)
    vi.mocked(leadService.facets).mockResolvedValue({ industries: [], states: [], revenue_min: null, revenue_max: null })
    // Never resolves: the summary and profile are not part of what is tested here.
    vi.mocked(leadService.dataQuality).mockReturnValue(new Promise(() => {}))
    vi.mocked(leadService.getTargetProfile).mockReturnValue(new Promise(() => {}))
  })

  it('starts empty and asks the user to search, without loading any leads', async () => {
    setup()
    expect(await screen.findByText('Search to load leads')).toBeInTheDocument()
    expect(screen.getByText('No leads loaded yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save all as list/ })).toBeDisabled()
    expect(search).not.toHaveBeenCalled()
  })

  it('loads matching leads once the user types a search', async () => {
    setup()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search leads' }), 'alpha')
    expect(await screen.findByRole('button', { name: 'Alpha Software' })).toBeInTheDocument()
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'alpha' }), { by: 'score', dir: 'desc' }, 1, 25)
    expect(screen.queryByText('Search to load leads')).not.toBeInTheDocument()
  })

  it('returns to the empty prompt when the search is cleared', async () => {
    setup()
    const box = screen.getByRole('searchbox', { name: 'Search leads' })
    await userEvent.type(box, 'alpha')
    await screen.findByRole('button', { name: 'Alpha Software' })
    await userEvent.clear(box)
    expect(await screen.findByText('Search to load leads')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('"Show all leads" loads everything without a filter', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Show all leads' }))
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ q: '', industries: [] }), expect.anything(), 1, 25)
    expect(await screen.findByText('1 company')).toBeInTheDocument()
  })
})
