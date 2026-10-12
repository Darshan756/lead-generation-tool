import { ChevronDown, Info } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import type { DataQuality } from '../../types'
import { Card, Stat } from '../ui/States'

interface DataQualitySummaryProps {
  quality: DataQuality
  title: string
  /** Earlier figures to compare against (snapshot before enrichment). */
  before?: DataQuality
  defaultOpen?: boolean
}

function delta(now: number, before: number | undefined, goodWhenLower: boolean) {
  if (before === undefined || before === now) return undefined
  const change = now - before
  const improved = goodWhenLower ? change < 0 : change > 0
  return (
    <span className={improved ? 'text-emerald-700' : 'text-slate-500'}>
      {change > 0 ? '+' : '−'}
      {Math.abs(change)} since capture
    </span>
  )
}

/** Data-quality figures, all computed by the API from the records themselves. */
export function DataQualitySummary({ quality, title, before, defaultOpen = true }: DataQualitySummaryProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-left"
      >
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="flex items-center gap-3 text-xs text-slate-500">
          <span className="tabular hidden sm:inline">
            {quality.email_format_valid} of {quality.total} email-ready · {quality.incomplete_key_info} incomplete
          </span>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {open && (
        <>
          <dl className="grid grid-cols-2 divide-slate-100 border-t border-slate-200 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
            <Stat label="Companies" value={quality.total} hint={before ? undefined : `${quality.duplicates_merged} duplicates merged`} />
            <Stat
              label="Email, format valid"
              value={quality.email_format_valid}
              tone="positive"
              hint={delta(quality.email_format_valid, before?.email_format_valid, false) ?? 'Not verified'}
            />
            <Stat
              label="Missing email"
              value={quality.email_missing}
              tone={quality.email_missing ? 'warning' : undefined}
              hint={delta(quality.email_missing, before?.email_missing, true)}
            />
            <Stat
              label="Email fails format"
              value={quality.email_invalid_format}
              tone={quality.email_invalid_format ? 'warning' : undefined}
              hint={delta(quality.email_invalid_format, before?.email_invalid_format, true)}
            />
            <Stat
              label="Incomplete key info"
              value={quality.incomplete_key_info}
              hint={delta(quality.incomplete_key_info, before?.incomplete_key_info, true)}
            />
            <Stat
              label="Needs manual review"
              value={quality.needs_manual_review}
              hint={delta(quality.needs_manual_review, before?.needs_manual_review, true)}
            />
          </dl>
          <p className="flex items-start gap-1.5 border-t border-slate-100 px-4 py-2 text-xs leading-snug text-slate-500">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              “Format valid” means the address has a correct shape. It does not prove the mailbox exists.{' '}
              <strong className="font-medium text-slate-600">{quality.verified} records are verified</strong> — this
              prototype performs no external verification, and all data is synthetic.
            </span>
          </p>
        </>
      )}
    </Card>
  )
}
