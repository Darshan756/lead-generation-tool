import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { outreachService } from '../../services/outreach-service'
import type { OutreachDraft } from '../../types'
import { ToastProvider } from '../ui/Toast'
import { DraftEditorDialog } from './DraftEditorDialog'

vi.mock('../../services/outreach-service', () => ({ outreachService: { updateDraft: vi.fn() } }))
const updateDraft = vi.mocked(outreachService.updateDraft)

const DRAFT: OutreachDraft = {
  id: 5,
  snapshot_id: 7,
  snapshot_name: 'CA Software',
  snapshot_lead_id: 42,
  company_name: 'Alpha Software',
  industry: 'Software Development',
  owner_name: 'Avery Whitlock',
  to_email: 'hello@alpha.example',
  subject: 'Quick question',
  body: 'Hi Avery,\n\nHello.',
  created_at: '2026-10-12T09:00:00Z',
  updated_at: '2026-10-12T09:00:00Z',
}

function setup() {
  const handlers = { onClose: vi.fn(), onSaved: vi.fn(), onDelete: vi.fn() }
  render(
    <ToastProvider>
      <DraftEditorDialog draft={DRAFT} {...handlers} />
    </ToastProvider>,
  )
  return handlers
}

describe('DraftEditorDialog', () => {
  beforeEach(() => {
    updateDraft.mockReset()
  })

  it('saves edited subject and message', async () => {
    updateDraft.mockResolvedValue({ ...DRAFT, subject: 'Quick question!' })
    const { onSaved } = setup()
    const save = screen.getByRole('button', { name: 'Save draft' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Subject'), '!')
    await userEvent.click(save)
    expect(updateDraft).toHaveBeenCalledWith(5, 'Quick question!', DRAFT.body)
    expect(onSaved).toHaveBeenCalled()
  })

  it('does not allow an empty subject or message', async () => {
    setup()
    await userEvent.clear(screen.getByLabelText('Message'))
    expect(screen.getByText('A message is required.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
  })

  it('offers a mail-app link carrying the current text instead of sending', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Subject'), ' now')
    const link = screen.getByRole('link', { name: 'Open in mail app' })
    expect(link).toHaveAttribute(
      'href',
      'mailto:hello%40alpha.example?subject=Quick%20question%20now&body=Hi%20Avery%2C%0A%0AHello.',
    )
  })

  it('asks the parent to confirm deletion', async () => {
    const { onDelete } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith(DRAFT)
  })
})
