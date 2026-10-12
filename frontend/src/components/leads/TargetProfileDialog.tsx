import { useState, type FormEvent } from 'react'
import { REVENUE_STEPS } from '../../lib/filters'
import { formatMoney } from '../../lib/format'
import { leadService } from '../../services/lead-service'
import type { LeadFacets, TargetProfile, TargetProfileInput } from '../../types'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Dialog } from '../ui/Dialog'
import { SelectField } from '../ui/Field'

interface TargetProfileDialogProps {
  open: boolean
  profile: TargetProfile | undefined
  facets: LeadFacets | undefined
  onClose: () => void
  onSaved: (profile: TargetProfile) => void
}

const EMPTY: TargetProfileInput = { industries: [], states: [], revenue_min: null, revenue_max: null }

const SIGNAL_NAMES: Record<string, string> = {
  industry: 'Target industry',
  location: 'Target location',
  revenue: 'Revenue fit',
  email: 'Business email',
  contact_channel: 'Website or phone',
}

/** Mounted only while open, so the form always starts from the saved profile. */
export function TargetProfileDialog(props: TargetProfileDialogProps) {
  return props.open ? <TargetProfileForm {...props} /> : null
}

function TargetProfileForm({ open, profile, facets, onClose, onSaved }: TargetProfileDialogProps) {
  const [draft, setDraft] = useState<TargetProfileInput>(() =>
    profile
      ? { industries: profile.industries, states: profile.states, revenue_min: profile.revenue_min, revenue_max: profile.revenue_max }
      : EMPTY,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (key: 'industries' | 'states', value: string) =>
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter((v) => v !== value) : [...current[key], value],
    }))
  const parse = (value: string) => (value === '' ? null : Number(value))
  const isEmpty = !draft.industries.length && !draft.states.length && draft.revenue_min === null && draft.revenue_max === null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(await leadService.saveTargetProfile(draft))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The target profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Target profile"
      description="Describe your ideal customer. Every lead is scored against it."
      footer={
        <>
          <Button variant="ghost" disabled={isEmpty} onClick={() => setDraft(EMPTY)} className="mr-auto">
            Clear all criteria
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="target-profile" loading={saving}>
            {isEmpty ? 'Save without scoring' : 'Save and rescore'}
          </Button>
        </>
      }
    >
      <form id="target-profile" onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-slate-700">Target industries</legend>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {(facets?.industries ?? []).map((facet) => (
              <Checkbox
                key={facet.value}
                label={facet.value}
                showLabel
                checked={draft.industries.includes(facet.value)}
                onChange={() => toggle('industries', facet.value)}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-slate-700">Target states</legend>
          <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 sm:grid-cols-6">
            {(facets?.states ?? []).map((facet) => (
              <Checkbox
                key={facet.value}
                label={facet.value}
                showLabel
                checked={draft.states.includes(facet.value)}
                onChange={() => toggle('states', facet.value)}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Minimum revenue" value={draft.revenue_min ?? ''} onChange={(event) => setDraft({ ...draft, revenue_min: parse(event.target.value) })}>
            <option value="">No minimum</option>
            {REVENUE_STEPS.map((step) => (
              <option key={step} value={step} disabled={draft.revenue_max !== null && step > draft.revenue_max}>
                {formatMoney(step)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Maximum revenue" value={draft.revenue_max ?? ''} onChange={(event) => setDraft({ ...draft, revenue_max: parse(event.target.value) })}>
            <option value="">No maximum</option>
            {REVENUE_STEPS.map((step) => (
              <option key={step} value={step} disabled={draft.revenue_min !== null && step < draft.revenue_min}>
                {formatMoney(step)}
              </option>
            ))}
          </SelectField>
        </div>

        {isEmpty && (
          <p className="rounded-md bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            With no criteria, leads are shown as “Not scored”. The app will not invent a score that looks personalised.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}

        {profile && (
          <div className="rounded-md bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
            <p className="font-medium text-slate-700">How the score is calculated</p>
            <p className="mt-1">
              {Object.entries(profile.weights)
                .map(([key, weight]) => `${SIGNAL_NAMES[key] ?? key} ${weight}`)
                .join(' · ')}
            </p>
            <p className="mt-1">
              Points earned are divided by the points available and scaled to 100. High priority is{' '}
              {profile.high_threshold}+, Medium is {profile.medium_threshold}–{profile.high_threshold - 1}, Low is below{' '}
              {profile.medium_threshold}. These weights are illustrative, not a validated sales model.
            </p>
          </div>
        )}
      </form>
    </Dialog>
  )
}
