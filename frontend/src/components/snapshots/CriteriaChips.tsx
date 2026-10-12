import { describeCriteria } from '../../lib/filters'
import type { SnapshotCriteria } from '../../types'

/** The search criteria a lead list was captured with. */
export function CriteriaChips({ criteria }: { criteria: SnapshotCriteria }) {
  const lines = describeCriteria(criteria)
  if (!lines.length) return <span className="text-xs text-slate-500">No filters applied</span>
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Search criteria">
      {lines.map((line) => (
        <li key={line} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {line}
        </li>
      ))}
    </ul>
  )
}
