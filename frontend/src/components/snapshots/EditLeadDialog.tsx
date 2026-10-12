import { useState, type FormEvent } from 'react'
import { snapshotService } from '../../services/snapshot-service'
import type { SnapshotLead, SnapshotLeadUpdate } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { TextField } from '../ui/Field'

interface EditLeadDialogProps {
  lead: SnapshotLead | null
  onClose: () => void
  onSaved: (lead: SnapshotLead) => void
}

type TextKey = 'email' | 'phone' | 'website' | 'owner_name' | 'owner_title'
type NumberKey = 'revenue_usd' | 'employee_count'
type FormState = Record<TextKey | NumberKey, string>

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

/** Manual enrichment. Mounted per lead so the form starts from its values. */
export function EditLeadDialog({ lead, onClose, onSaved }: EditLeadDialogProps) {
  return lead ? <EditLeadForm key={lead.id} lead={lead} onClose={onClose} onSaved={onSaved} /> : null
}

function EditLeadForm({ lead, onClose, onSaved }: { lead: SnapshotLead } & Omit<EditLeadDialogProps, 'lead'>) {
  const initial: FormState = {
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    website: lead.website ?? '',
    owner_name: lead.owner_name ?? '',
    owner_title: lead.owner_title ?? '',
    revenue_usd: lead.revenue_usd?.toString() ?? '',
    employee_count: lead.employee_count?.toString() ?? '',
  }
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value }),
  })

  const email = form.email.trim()
  const emailError = email && !EMAIL_SHAPE.test(email) ? 'Enter an address like name@company.com.' : null
  const numberError = (key: NumberKey) =>
    form[key].trim() && !/^\d+$/.test(form[key].trim()) ? 'Enter a whole number, without symbols.' : null

  // Send only what actually changed.
  const changes: SnapshotLeadUpdate = {}
  for (const key of ['email', 'phone', 'website', 'owner_name', 'owner_title'] as const) {
    if (form[key].trim() !== initial[key]) changes[key] = form[key].trim() || null
  }
  for (const key of ['revenue_usd', 'employee_count'] as const) {
    if (form[key].trim() !== initial[key]) changes[key] = form[key].trim() ? Number(form[key].trim()) : null
  }
  const hasChanges = Object.keys(changes).length > 0
  const invalid = Boolean(emailError || numberError('revenue_usd') || numberError('employee_count'))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!hasChanges || invalid) return
    setSaving(true)
    setError(null)
    try {
      onSaved(await snapshotService.updateLead(lead.snapshot_id, lead.id, changes))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The changes could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit ${lead.company_name}`}
      description="Add what you found through your own research. Changes are saved to this list only."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-lead" loading={saving} disabled={!hasChanges || invalid}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-lead" onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <TextField label="Business email" type="email" placeholder="name@company.com" error={emailError} hint="Format is checked. Deliverability is not verified." {...field('email')} />
        </div>
        <TextField label="Contact name" {...field('owner_name')} />
        <TextField label="Contact title" {...field('owner_title')} />
        <TextField label="Phone" {...field('phone')} />
        <TextField label="Website" placeholder="https://" {...field('website')} />
        <TextField label="Estimated revenue (USD)" inputMode="numeric" error={numberError('revenue_usd')} {...field('revenue_usd')} />
        <TextField label="Employees" inputMode="numeric" error={numberError('employee_count')} {...field('employee_count')} />
        {error && (
          <p role="alert" className="text-xs text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
