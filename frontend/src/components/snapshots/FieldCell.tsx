import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { FieldSource } from '../../types'

interface FieldCellProps {
  /** The formatted value, or null when the field is missing. */
  value: ReactNode | null
  source?: FieldSource
  /** Present but unusable, e.g. an email that fails the format check. */
  problem?: string
  className?: string
}

const SOURCE_TITLE: Record<FieldSource, string> = {
  simulated: 'Filled by simulated enrichment (synthetic lookup).',
  manual: 'Entered manually during enrichment.',
}

/** One enrichable field in the snapshot table: missing, present, or filled by enrichment. */
export function FieldCell({ value, source, problem, className }: FieldCellProps) {
  if (value === null || value === '') {
    return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">Missing</span>
  }
  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)} title={problem ?? (source ? SOURCE_TITLE[source] : undefined)}>
      {source && <Sparkles className="size-3 shrink-0 text-accent" aria-label={source === 'manual' ? 'Entered manually' : 'Filled by enrichment'} />}
      <span className={cn('truncate', problem ? 'text-red-700' : source ? 'font-medium text-indigo-900' : 'text-slate-700')}>{value}</span>
      {problem && <span className="shrink-0 text-xs text-red-700">({problem})</span>}
    </span>
  )
}
