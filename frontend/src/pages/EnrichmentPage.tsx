import { ArrowLeft, ArrowRight, CheckCircle2, Download, Layers, Pencil, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LeadDrawer } from '../components/leads/LeadDrawer'
import { ScoreCell, StageBadge } from '../components/leads/indicators'
import { CriteriaChips } from '../components/snapshots/CriteriaChips'
import { EditLeadDialog } from '../components/snapshots/EditLeadDialog'
import { FieldCell } from '../components/snapshots/FieldCell'
import { FieldCoverageCard } from '../components/snapshots/FieldCoverageCard'
import { Badge } from '../components/ui/Badge'
import { Button, IconButton } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui/States'
import { useToast } from '../components/ui/useToast'
import { useAsync } from '../hooks/useAsync'
import { cn } from '../lib/cn'
import { FIELD_LABELS, formatDate, formatMoney, formatNumber, plural } from '../lib/format'
import { snapshotService } from '../services/snapshot-service'
import type { EnrichResult, SnapshotLead } from '../types'

const TH = 'px-3 py-2 text-left text-xs font-medium text-slate-500'

type View = 'all' | 'incomplete' | 'complete' | 'enriched'

const isIncomplete = (lead: SnapshotLead) => lead.confidence.missing_fields.length > 0

/** Step 2 without a lead list chosen: pick one. */
function SnapshotPicker() {
  const navigate = useNavigate()
  const snapshots = useAsync(() => snapshotService.list(), [])
  return (
    <>
      <PageHeader title="Enrichment" description="Choose a lead list to fill in whatever is missing: emails, phone numbers, contacts, revenue and company size." />
      <Card>
        {snapshots.error ? (
          <ErrorState message={snapshots.error} onRetry={snapshots.reload} />
        ) : !snapshots.data ? (
          <LoadingState label="Loading lead lists…" />
        ) : snapshots.data.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-5" />}
            title="No lead lists to enrich yet"
            action={
              <Button variant="primary" onClick={() => navigate('/leads')}>
                Go to Find Leads
              </Button>
            }
          >
            Enrichment works on a saved lead list. Save one from Find Leads first.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {snapshots.data.map((snapshot) => {
              return (
                <li key={snapshot.id}>
                  <Link to={`/enrichment/${snapshot.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-ink">
                        <span className="truncate">{snapshot.name}</span>
                        <StageBadge stage={snapshot.stage} />
                      </p>
                      <p className="tabular mt-0.5 text-xs text-slate-500">
                        {plural(snapshot.lead_count, 'lead')} · saved {formatDate(snapshot.created_at)}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 text-[13px]">
                      {snapshot.incomplete_count > 0 ? (
                        <Badge tone="warning">{plural(snapshot.incomplete_count, 'lead')} with missing information</Badge>
                      ) : (
                        <Badge tone="positive">Every lead is complete</Badge>
                      )}
                      <ArrowRight className="size-4 text-slate-400" aria-hidden />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}

function ResultBanner({ result, onDismiss }: { result: EnrichResult; onDismiss: () => void }) {
  const entries = Object.entries(result.fields_filled)
  const totalFilled = entries.reduce((sum, [, count]) => sum + count, 0)
  const filled = entries.map(([field, count]) => `${(FIELD_LABELS[field] ?? field).toLowerCase()} ${count}`).join(' · ')
  return (
    <div role="status" className="mb-4 rounded-lg border border-indigo-200 bg-accent-soft px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-semibold text-indigo-950">
              Enriched {result.enriched} of {plural(result.processed, 'lead')} · {plural(totalFilled, 'missing field')} filled
            </p>
            <p className="mt-0.5 text-indigo-900">
              {filled ? `Filled — ${filled}.` : 'No new fields were filled.'}
              {result.already_complete > 0 && ` ${plural(result.already_complete, 'lead')} already complete.`}
            </p>
          </div>
        </div>
        <IconButton label="Dismiss result" onClick={onDismiss}>
          <X className="size-4" />
        </IconButton>
      </div>
      {result.no_match.length > 0 && (
        <details className="mt-2 pl-6 text-indigo-900">
          <summary className="cursor-pointer font-medium">
            {plural(result.no_match.length, 'lead')} had no enrichment data and need manual research
          </summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
            {result.no_match.map((item) => (
              <li key={item.snapshot_lead_id}>{item.company_name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function EnrichmentWorkspace({ snapshotId }: { snapshotId: number }) {
  const toast = useToast()
  const navigate = useNavigate()
  const snapshot = useAsync(() => snapshotService.get(snapshotId), [snapshotId])
  const [view, setView] = useState<View>('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [enriching, setEnriching] = useState(false)
  const [result, setResult] = useState<EnrichResult | null>(null)
  const [editing, setEditing] = useState<SnapshotLead | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const data = snapshot.data
  const leads = useMemo(() => data?.leads ?? [], [data])
  const counts = useMemo(
    () => ({
      all: leads.length,
      incomplete: leads.filter(isIncomplete).length,
      complete: leads.filter((lead) => !isIncomplete(lead)).length,
      enriched: leads.filter((lead) => lead.enriched_at).length,
    }),
    [leads],
  )
  const visible = useMemo(
    () =>
      leads.filter((lead) =>
        view === 'incomplete' ? isIncomplete(lead) : view === 'complete' ? !isIncomplete(lead) : view === 'enriched' ? Boolean(lead.enriched_at) : true,
      ),
    [leads, view],
  )

  if (snapshot.error) {
    return (
      <Card>
        <ErrorState message={snapshot.error} onRetry={snapshot.reload} />
      </Card>
    )
  }
  if (!data) return <LoadingState label="Loading lead list…" />

  const openLead = leads.find((lead) => lead.id === openId) ?? null
  const selectedVisible = visible.filter((lead) => selected.has(lead.id))
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const enrich = async () => {
    const ids = selectedVisible.length ? selectedVisible.map((lead) => lead.id) : undefined
    setEnriching(true)
    try {
      const outcome = await snapshotService.enrich(snapshotId, ids)
      setResult(outcome)
      snapshot.setData(outcome.snapshot)
      setSelected(new Set())
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Enrichment failed.')
    } finally {
      setEnriching(false)
    }
  }

  const exportCsv = async () => {
    try {
      toast.success(`Exported to ${await snapshotService.exportCsv(snapshotId)}.`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'The export failed.')
    }
  }

  const tabs: { key: View; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'incomplete', label: 'Incomplete' },
    { key: 'complete', label: 'Complete' },
    { key: 'enriched', label: 'Enriched' },
  ]

  return (
    <>
      <PageHeader
        back={
          <Link to="/enrichment" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden />
            All lists
          </Link>
        }
        title={data.name}
        description={
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StageBadge stage={data.stage} />
            <span>Saved {formatDate(data.created_at)}</span>
            <span aria-hidden>·</span>
            <CriteriaChips criteria={data.criteria} />
          </div>
        }
        actions={
          <>
            <Button icon={<Download className="size-3.5" aria-hidden />} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button
              variant="primary"
              disabled={data.email_ready === 0}
              title={data.email_ready === 0 ? 'No lead has a usable email yet. Enrich first.' : undefined}
              onClick={() => navigate(`/outreach?list=${data.id}`)}
            >
              Continue to outreach
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </>
        }
      />

      {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}

      <FieldCoverageCard quality={data.quality} atCapture={data.quality_at_creation} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
          <div role="tablist" aria-label="Filter leads" className="flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={view === tab.key}
                onClick={() => setView(tab.key)}
                className={cn(
                  'tabular rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
                  view === tab.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {tab.label} <span className={view === tab.key ? 'text-slate-300' : 'text-slate-400'}>{counts[tab.key]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-500 lg:inline" title="Values come from a synthetic lookup table. No external provider is contacted.">
              Simulated — no external provider is called
            </span>
            <Button
              variant="primary"
              loading={enriching}
              disabled={counts.incomplete === 0 && selectedVisible.length === 0}
              icon={<Sparkles className="size-3.5" aria-hidden />}
              onClick={enrich}
            >
              {selectedVisible.length ? `Enrich ${selectedVisible.length} selected` : 'Enrich all leads'}
            </Button>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={view === 'incomplete' ? 'Nothing left to enrich' : view === 'enriched' ? 'No leads enriched yet' : 'No leads in this view'}
            action={view !== 'all' && <Button onClick={() => setView('all')}>Show all leads</Button>}
          >
            {view === 'incomplete'
              ? 'Every lead in this list has all key fields.'
              : view === 'enriched'
                ? 'Run enrichment, or edit a lead, and it will appear here.'
                : 'Switch view to see the other leads in this list.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2">
                    <Checkbox
                      label="Select all leads in this view"
                      checked={allSelected}
                      indeterminate={selectedVisible.length > 0 && !allSelected}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current)
                          visible.forEach((lead) => (allSelected ? next.delete(lead.id) : next.add(lead.id)))
                          return next
                        })
                      }
                    />
                  </th>
                  <th scope="col" className={TH}>Company</th>
                  <th scope="col" className={TH}>Email</th>
                  <th scope="col" className={TH}>Phone</th>
                  <th scope="col" className={cn(TH, 'hidden 2xl:table-cell')}>Website</th>
                  <th scope="col" className={TH}>Contact name</th>
                  <th scope="col" className={TH}>Revenue</th>
                  <th scope="col" className={TH}>Employees</th>
                  <th scope="col" className={TH}>Score</th>
                  <th scope="col" className="w-10 px-2 py-2">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((lead) => {
                  const sources = lead.field_sources
                  const scoreChange = lead.qualification.score !== null && lead.original.score !== null ? lead.qualification.score - lead.original.score : 0
                  return (
                    <tr key={lead.id} onClick={() => setOpenId(lead.id)} className={cn('cursor-pointer', selected.has(lead.id) ? 'bg-accent-soft/60' : 'hover:bg-slate-50')}>
                      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                        <Checkbox label={`Select ${lead.company_name}`} checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} />
                      </td>
                      <td className="max-w-[190px] px-3 py-2">
                        <span className="block truncate font-medium text-ink">{lead.company_name}</span>
                        <span className="block truncate text-xs text-slate-500">{lead.industry ?? 'Unknown category'}</span>
                      </td>
                      <td className="max-w-[200px] px-3 py-2">
                        <FieldCell
                          value={lead.email}
                          source={sources.email}
                          problem={lead.contact_status === 'invalid_email' ? 'invalid format' : undefined}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <FieldCell value={lead.phone} source={sources.phone} />
                      </td>
                      <td className="hidden max-w-[150px] px-3 py-2 2xl:table-cell">
                        <FieldCell value={lead.domain ?? lead.website} source={sources.website} />
                      </td>
                      <td className="max-w-[170px] px-3 py-2">
                        <FieldCell value={lead.owner_name} source={sources.owner_name} />
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2">
                        <FieldCell value={lead.revenue_usd === null ? null : formatMoney(lead.revenue_usd)} source={sources.revenue_usd} />
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2">
                        <FieldCell value={lead.employee_count === null ? null : formatNumber(lead.employee_count)} source={sources.employee_count} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ScoreCell qualification={lead.qualification} />
                          {scoreChange > 0 && (
                            <span className="tabular text-xs font-medium text-emerald-700" title={`Was ${lead.original.score} when captured`}>
                              +{scoreChange}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
                        <IconButton label={`Edit ${lead.company_name}`} onClick={() => setEditing(lead)}>
                          <Pencil className="size-3.5" />
                        </IconButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LeadDrawer
        lead={openLead}
        fieldSources={openLead?.field_sources}
        onClose={() => setOpenId(null)}
        footer={
          openLead && (
            <Button
              variant="primary"
              icon={<Pencil className="size-3.5" aria-hidden />}
              onClick={() => {
                setEditing(openLead)
                setOpenId(null)
              }}
            >
              Edit details
            </Button>
          )
        }
      />

      <EditLeadDialog
        lead={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null)
          toast.success(`Saved changes to ${saved.company_name}.`)
          snapshot.reload()
        }}
      />
    </>
  )
}

export function EnrichmentPage() {
  const { snapshotId } = useParams()
  const id = Number(snapshotId)
  if (snapshotId === undefined) return <SnapshotPicker />
  if (!Number.isInteger(id) || id < 1) {
    return (
      <Card>
        <ErrorState message="That lead list link is not valid." />
      </Card>
    )
  }
  // Keyed so switching lead lists starts with a clean selection and result.
  return <EnrichmentWorkspace key={id} snapshotId={id} />
}
