import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatLocation, formatMoney, formatNumber } from '../../lib/format'
import type { EvaluatedLead, FieldSource } from '../../types'
import { Badge } from '../ui/Badge'
import { Drawer } from '../ui/Dialog'
import { ConfidenceCell, ContactBadge, PriorityBadge, ScoreBreakdown } from './indicators'

interface LeadDrawerProps {
  lead: EvaluatedLead | null
  onClose: () => void
  /** Present for leads in a lead list: which fields enrichment changed. */
  fieldSources?: Record<string, FieldSource>
  footer?: ReactNode
  note?: ReactNode
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, source, children }: { label: string; source?: FieldSource; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-[13px] text-slate-500">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-right text-[13px] text-ink">
        <span className="min-w-0 break-words">{children}</span>
        {source && (
          <Badge tone="accent" title={source === 'manual' ? 'Entered manually during enrichment.' : 'Filled by simulated enrichment (synthetic lookup).'}>
            {source === 'manual' ? 'Manual' : 'Enriched'}
          </Badge>
        )}
      </dd>
    </div>
  )
}

const missing = <span className="text-slate-400">Not available</span>

export function LeadDrawer({ lead, onClose, fieldSources = {}, footer, note }: LeadDrawerProps) {
  if (!lead) return null
  const q = lead.qualification
  return (
    <Drawer
      open
      onClose={onClose}
      title={lead.company_name}
      description={[lead.industry, formatLocation(lead)].filter((part) => part && part !== '—').join(' · ') || 'Details unknown'}
      footer={footer}
    >
      {note}

      <div className="mb-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Qualification score</p>
            <p className="tabular text-2xl font-semibold text-ink">
              {q.score === null ? '—' : q.score}
              {q.score !== null && <span className="text-sm font-normal text-slate-400"> / 100</span>}
            </p>
          </div>
          <PriorityBadge priority={q.priority} />
        </div>
        <div className="mt-3 flex items-start gap-2 border-t border-slate-200 pt-3">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="text-xs text-slate-500">Recommended next step</p>
            <p className="text-[13px] font-medium text-ink">{q.next_action}</p>
          </div>
        </div>
      </div>

      <Section title="Why this score">
        <ScoreBreakdown qualification={q} />
        {q.score !== null && (
          <p className="mt-2 text-xs leading-snug text-slate-500">
            Points earned ÷ points available, scaled to 100. Missing information earns nothing but is listed for
            review rather than counted against the company. Weights are illustrative.
          </p>
        )}
      </Section>

      <Section title="Contact">
        <dl className="divide-y divide-slate-100">
          <Row label="Readiness">
            <ContactBadge status={lead.contact_status} />
          </Row>
          <Row label="Email" source={fieldSources.email}>
            {lead.email ?? missing}
          </Row>
          <Row label="Phone" source={fieldSources.phone}>
            {lead.phone ?? missing}
          </Row>
          <Row label="Contact" source={fieldSources.owner_name}>
            {lead.owner_name ? `${lead.owner_name}${lead.owner_title ? `, ${lead.owner_title}` : ''}` : missing}
          </Row>
          <Row label="Website" source={fieldSources.website}>
            {lead.website ? (
              <span title="Synthetic .example domain — it does not resolve.">{lead.domain ?? lead.website}</span>
            ) : (
              missing
            )}
          </Row>
        </dl>
        {lead.contact_status === 'email_ready' && (
          <p className="mt-1 text-xs text-slate-500">Email format is valid. Deliverability has not been verified.</p>
        )}
      </Section>

      <Section title="Company">
        <dl className="divide-y divide-slate-100">
          <Row label="Industry">{lead.industry ?? missing}</Row>
          <Row label="Location">{formatLocation(lead) === '—' ? missing : formatLocation(lead)}</Row>
          <Row label="Est. revenue" source={fieldSources.revenue_usd}>
            {lead.revenue_usd === null ? missing : formatMoney(lead.revenue_usd)}
          </Row>
          <Row label="Employees" source={fieldSources.employee_count}>
            {lead.employee_count === null ? missing : formatNumber(lead.employee_count)}
          </Row>
          <Row label="Founded">{lead.founded_year ?? missing}</Row>
        </dl>
      </Section>

      <Section title="Data confidence">
        <div className="flex items-center justify-between">
          <ConfidenceCell confidence={lead.confidence} />
          <span className="tabular text-xs text-slate-500">{lead.confidence.percent}% of key fields present</span>
        </div>
        {lead.confidence.missing_fields.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {lead.confidence.missing_fields.map((field) => (
              <Badge key={field} tone="warning">
                Missing: {field}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">All key fields are present.</p>
        )}
        <p className="mt-2 text-xs leading-snug text-slate-500">
          Confidence measures how complete the record is. It is separate from the qualification score.
        </p>
      </Section>
    </Drawer>
  )
}

