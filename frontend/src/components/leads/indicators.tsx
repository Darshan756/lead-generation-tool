import { AlertTriangle, CheckCircle2, CircleDashed, MailCheck, MailQuestion, MailX, Minus, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { CONFIDENCE_LABELS, CONTACT_LABELS, PRIORITY_LABELS, STAGE_LABELS } from '../../lib/format'
import type { Confidence, ContactStatus, Priority, Qualification, SnapshotStage } from '../../types'
import { Badge, type Tone } from '../ui/Badge'

const PRIORITY_TONE: Record<Priority, Tone> = { high: 'positive', medium: 'warning', low: 'neutral', unscored: 'neutral' }

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'unscored') {
    return (
      <Badge title="No target profile is set, so leads are not scored.">
        <Minus className="size-3" aria-hidden />
        {PRIORITY_LABELS.unscored}
      </Badge>
    )
  }
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABELS[priority]}</Badge>
}

const BAR: Record<Priority, string> = {
  high: 'bg-emerald-600',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
  unscored: 'bg-slate-300',
}

/** Score as a number with a thin bar. The number carries the meaning. */
export function ScoreCell({ qualification }: { qualification: Pick<Qualification, 'score' | 'priority'> }) {
  const { score, priority } = qualification
  if (score === null) {
    return (
      <span className="text-slate-400" title="No target profile is set, so leads are not scored.">
        —
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2" title={`Qualification score ${score} out of 100`}>
      <span className="tabular w-6 text-right font-semibold text-ink">{score}</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <span className={cn('block h-full rounded-full', BAR[priority])} style={{ width: `${score}%` }} />
      </span>
    </div>
  )
}

const CONTACT: Record<ContactStatus, { tone: Tone; Icon: typeof MailCheck }> = {
  email_ready: { tone: 'positive', Icon: MailCheck },
  invalid_email: { tone: 'danger', Icon: MailX },
  needs_enrichment: { tone: 'warning', Icon: MailQuestion },
}

export function ContactBadge({ status }: { status: ContactStatus }) {
  const { tone, Icon } = CONTACT[status]
  return (
    <Badge tone={tone} title={CONTACT_LABELS[status].help} icon={<Icon className="size-3" aria-hidden />}>
      {CONTACT_LABELS[status].short}
    </Badge>
  )
}

const CONFIDENCE_BAR = { high: 'bg-emerald-600', medium: 'bg-amber-500', low: 'bg-red-500' } as const

export function ConfidenceCell({ confidence }: { confidence: Confidence }) {
  const missing = confidence.missing_fields
  const title = missing.length
    ? `${confidence.percent}% of key fields present. Missing: ${missing.join(', ')}.`
    : 'All key fields are present.'
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((index) => {
          const filled = index < { low: 1, medium: 2, high: 3 }[confidence.level]
          return <span key={index} className={cn('h-3 w-1 rounded-sm', filled ? CONFIDENCE_BAR[confidence.level] : 'bg-slate-200')} />
        })}
      </span>
      <span className="text-slate-700">{CONFIDENCE_LABELS[confidence.level]}</span>
    </div>
  )
}

const STAGE_TONE: Record<SnapshotStage, Tone> = { raw: 'neutral', enriched: 'accent', drafted: 'positive' }

export function StageBadge({ stage }: { stage: SnapshotStage }) {
  return (
    <Badge tone={STAGE_TONE[stage]} title={STAGE_LABELS[stage].help}>
      {STAGE_LABELS[stage].label}
    </Badge>
  )
}

const SIGNAL_ICON = {
  matched: <CheckCircle2 className="size-4 text-emerald-600" aria-label="Matched" />,
  not_matched: <XCircle className="size-4 text-red-500" aria-label="Does not match" />,
  missing: <AlertTriangle className="size-4 text-amber-500" aria-label="Missing information" />,
  not_configured: <CircleDashed className="size-4 text-slate-300" aria-label="Not part of the target profile" />,
}

/** Per-signal explanation of a qualification score. */
export function ScoreBreakdown({ qualification }: { qualification: Qualification }) {
  if (qualification.score === null) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-600">
        This lead is not scored because no target profile is set. Set one in Find Leads to see how well each company
        fits.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
      {qualification.signals.map((signal) => (
        <li key={signal.key} className="flex items-start gap-2.5 px-3 py-2">
          <span className="mt-0.5">{SIGNAL_ICON[signal.status]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">{signal.label}</p>
            <p className="text-xs leading-snug text-slate-500">{signal.detail}</p>
          </div>
          <span className="tabular whitespace-nowrap text-xs text-slate-500">
            {signal.status === 'not_configured' ? '—' : `${signal.points} / ${signal.max_points}`}
          </span>
        </li>
      ))}
    </ul>
  )
}
