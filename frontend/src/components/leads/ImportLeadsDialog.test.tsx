import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { leadService } from '../../services/lead-service'
import { ImportLeadsDialog } from './ImportLeadsDialog'

vi.mock('../../services/lead-service', () => ({ leadService: { importFile: vi.fn() } }))
const importFile = vi.mocked(leadService.importFile)

const xlsx = new File(['data'], 'leads.xlsx')

function setup() {
  const handlers = { onClose: vi.fn(), onImported: vi.fn() }
  render(<ImportLeadsDialog open {...handlers} />)
  return { ...handlers, input: screen.getByLabelText('Excel or CSV file'), submit: screen.getByRole('button', { name: 'Import' }) }
}

describe('ImportLeadsDialog', () => {
  beforeEach(() => {
    importFile.mockReset()
  })

  it('cannot import until a file is chosen', () => {
    expect(setup().submit).toBeDisabled()
  })

  it('rejects other file types before uploading', async () => {
    const { input, submit } = setup()
    // applyAccept: false lets the test pick a file the picker would normally hide.
    await userEvent.setup({ applyAccept: false }).upload(input, new File(['x'], 'leads.pdf'))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an Excel (.xlsx) or CSV (.csv) file.')
    expect(submit).toBeDisabled()
    expect(importFile).not.toHaveBeenCalled()
  })

  it('uploads the file and reports new, merged and skipped rows', async () => {
    importFile.mockResolvedValue({
      filename: 'leads.xlsx',
      rows_read: 6,
      inserted: 3,
      duplicates_merged: 2,
      skipped: [{ row: 4, reason: 'Company name is missing' }],
    })
    const { input, submit, onImported, onClose } = setup()
    await userEvent.upload(input, xlsx)
    await userEvent.click(submit)

    expect(importFile).toHaveBeenCalledWith(xlsx)
    expect(await screen.findByText('3 new companies added from 6 rows')).toBeInTheDocument()
    expect(screen.getByText(/2 rows matched a company already in the list/)).toBeInTheDocument()
    expect(screen.getByText(/1 row skipped/)).toBeInTheDocument()
    expect(screen.getByText('Company name is missing')).toBeInTheDocument()
    expect(onImported).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the server message when the file cannot be read', async () => {
    importFile.mockRejectedValue(new Error('No “Company name” column found.'))
    const { input, submit, onImported } = setup()
    await userEvent.upload(input, xlsx)
    await userEvent.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent('No “Company name” column found.')
    expect(onImported).not.toHaveBeenCalled()
  })
})
