import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { snapshotService } from '../../services/snapshot-service'
import { makeSnapshotLead } from '../../test/fixtures'
import { EditLeadDialog } from './EditLeadDialog'

vi.mock('../../services/snapshot-service', () => ({ snapshotService: { updateLead: vi.fn() } }))
const updateLead = vi.mocked(snapshotService.updateLead)

const LEAD = makeSnapshotLead({ id: 42, email: null, owner_name: null, contact_status: 'needs_enrichment' })

function setup() {
  const onSaved = vi.fn()
  render(<EditLeadDialog lead={LEAD} onClose={vi.fn()} onSaved={onSaved} />)
  return { onSaved, save: screen.getByRole('button', { name: 'Save changes' }) }
}

describe('EditLeadDialog', () => {
  // Braces matter: a function returned from beforeEach is run as a teardown.
  beforeEach(() => {
    updateLead.mockReset()
  })

  it('cannot be saved until something changes', () => {
    expect(setup().save).toBeDisabled()
  })

  it('sends only the fields that changed', async () => {
    const saved = { ...LEAD, email: 'owner@alpha.example' }
    updateLead.mockResolvedValue(saved)
    const { onSaved, save } = setup()
    await userEvent.type(screen.getByLabelText('Business email'), ' owner@alpha.example ')
    await userEvent.type(screen.getByLabelText('Contact name'), 'Sage Jessup')
    await userEvent.click(save)
    expect(updateLead).toHaveBeenCalledWith(7, 42, { email: 'owner@alpha.example', owner_name: 'Sage Jessup' })
    expect(onSaved).toHaveBeenCalledWith(saved)
  })

  it('clearing a field sends null', async () => {
    updateLead.mockResolvedValue(LEAD)
    const { save } = setup()
    await userEvent.clear(screen.getByLabelText('Phone'))
    await userEvent.click(save)
    expect(updateLead).toHaveBeenCalledWith(7, 42, { phone: null })
  })

  it('blocks a malformed email and a non-numeric revenue', async () => {
    const { save } = setup()
    await userEvent.type(screen.getByLabelText('Business email'), 'not-an-email')
    expect(screen.getByText('Enter an address like name@company.com.')).toBeInTheDocument()
    expect(save).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Business email'))
    await userEvent.clear(screen.getByLabelText('Estimated revenue (USD)'))
    await userEvent.type(screen.getByLabelText('Estimated revenue (USD)'), '$5M')
    expect(screen.getByText('Enter a whole number, without symbols.')).toBeInTheDocument()
    expect(save).toBeDisabled()
    expect(updateLead).not.toHaveBeenCalled()
  })

  it('shows the server error and stays open when saving fails', async () => {
    updateLead.mockRejectedValue(new Error('email: is not a valid email format'))
    const { onSaved, save } = setup()
    await userEvent.type(screen.getByLabelText('Phone'), '9')
    await userEvent.click(save)
    expect(await screen.findByText('email: is not a valid email format')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
