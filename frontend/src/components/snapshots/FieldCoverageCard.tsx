import { CheckCircle2 } from 'lucide-react'
import { fieldCoverage } from '../../lib/coverage'
import type { DataQuality } from '../../types'
import { Card } from '../ui/States'

/** What is still missing in a snapshot, field by field, and what enrichment has filled. */
export function FieldCoverageCard({ quality, atCapture }: { quality: DataQuality; atCapture: DataQuality }) {
  const fields = fieldCoverage(quality, atCapture)
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-ink">Missing information</h2>
        <p className="tabular text-xs text-slate-500">
          {quality.incomplete_key_info} of {quality.total} leads are missing at least one field
        </p>
      </div>
      <dl className="grid grid-cols-2 border-t border-slate-200 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-slate-100">
        {fields.map((field) => (
          <div key={field.key} className="px-4 py-3">
            <dt className="text-xs text-slate-500">{field.label}</dt>
            <dd className="mt-0.5">
              {field.missing === 0 ? (
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-emerald-700">
                  <CheckCircle2 className="size-4" aria-hidden />
                  Complete
                </span>
              ) : (
                <span className="tabular text-lg font-semibold text-amber-700">
                  {field.missing} <span className="text-xs font-normal text-slate-500">missing</span>
                </span>
              )}
            </dd>
            <dd className="tabular text-xs text-emerald-700">{field.filled > 0 ? `${field.filled} filled by enrichment` : ' '}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-slate-100 px-4 py-2 text-xs leading-snug text-slate-500">
        An email that fails the format check counts as missing. Emails are format-checked only; nothing here is
        verified against an external source.
      </p>
    </Card>
  )
}
