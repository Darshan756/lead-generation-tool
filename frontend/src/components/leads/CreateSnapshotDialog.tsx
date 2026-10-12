import { useState, type FormEvent } from 'react'
import { describeCriteria, suggestSnapshotName, toCriteria } from '../../lib/filters'
import { plural } from '../../lib/format'
import { snapshotService } from '../../services/snapshot-service'
import type { LeadFilters, SnapshotDetail } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { TextArea, TextField } from '../ui/Field'

interface CreateSnapshotDialogProps {
  open: boolean
  leadIds: number[]
  filters: LeadFilters
  /** True when the ids are "everything matching the filters" rather than a hand-picked selection. */
  allMatching: boolean
  onClose: () => void
  onCreated: (snapshot: SnapshotDetail) => void
}

/** Mounted only while open, so the form always starts from fresh values. */
export function CreateSnapshotDialog(props: CreateSnapshotDialogProps) {
  return props.open ? <CreateSnapshotForm {...props} /> : null
}

function CreateSnapshotForm({ open, leadIds, filters, allMatching, onClose, onCreated }: CreateSnapshotDialogProps) {
  const [name, setName] = useState(() => suggestSnapshotName(filters))
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const criteria = toCriteria(filters)
  const criteriaLines = describeCriteria(criteria)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Give the lead list a name.')
    setSaving(true)
    setError(null)
    try {
      onCreated(await snapshotService.create({ name: name.trim(), description: description.trim(), lead_ids: leadIds, criteria }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The lead list could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save lead list"
      description={`${plural(leadIds.length, 'lead')} ${allMatching ? 'matching your current filters' : 'you selected'}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-snapshot" loading={saving}>
            Save list
          </Button>
        </>
      }
    >
      <form id="create-snapshot" onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} error={error} required />
        <TextArea
          label="Description"
          optional
          rows={2}
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is this list for?"
        />
        <div>
          <p className="text-xs font-medium text-slate-700">Search criteria saved with it</p>
          {criteriaLines.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {criteriaLines.map((line) => (
                <li key={line} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No filters were applied.</p>
          )}
        </div>
        <p className="rounded-md bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          A lead list is a copy of these leads as they are right now. It carries through enrichment and outreach, and
          later changes to the lead list will not alter it. Leads without an email are included and flagged for
          enrichment.
        </p>
      </form>
    </Dialog>
  )
}
