import { CheckCircle2, Download, FileText, Layers, Mail, PenLine, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DraftEditorDialog } from '../components/outreach/DraftEditorDialog'
import { MessageComposer, type Message } from '../components/outreach/MessageComposer'
import { ContactBadge } from '../components/leads/indicators'
import { Badge } from '../components/ui/Badge'
import { Button, IconButton } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui/States'
import { useToast } from '../components/ui/useToast'
import { useAsync } from '../hooks/useAsync'
import { cn } from '../lib/cn'
import { formatDateTime, plural } from '../lib/format'
import { outreachService } from '../services/outreach-service'
import { snapshotService } from '../services/snapshot-service'
import type { GenerateResult, OutreachDraft, SnapshotLead } from '../types'

const TH = 'px-3 py-2 text-left text-xs font-medium text-slate-500'

const INELIGIBLE_REASON = {
  needs_enrichment: 'No email — enrich first',
  invalid_email: 'Email fails format check',
} as const

function StepTitle({ step, children }: { step: number; children: string }) {
  return (
    <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
      <span className="tabular flex size-5 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white" aria-hidden>
        {step}
      </span>
      {children}
    </h2>
  )
}

function ResultBanner({ result, onDismiss, onView }: { result: GenerateResult; onDismiss: () => void; onView: () => void }) {
  const done = result.created + result.updated
  return (
    <div role="status" className="mb-4 rounded-lg border border-indigo-200 bg-accent-soft px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-semibold text-indigo-950">
              {plural(result.created, 'draft')} created
              {result.updated > 0 && `, ${result.updated} replaced`} · {result.skipped.length} skipped of {result.requested} selected
            </p>
            {done > 0 && (
              <button type="button" onClick={onView} className="mt-0.5 font-medium text-accent hover:underline">
                Review and edit drafts
              </button>
            )}
          </div>
        </div>
        <IconButton label="Dismiss result" onClick={onDismiss}>
          <X className="size-4" />
        </IconButton>
      </div>
      {result.skipped.length > 0 && (
        <details className="mt-2 pl-6 text-indigo-900" open={result.skipped.length <= 5}>
          <summary className="cursor-pointer font-medium">Why {plural(result.skipped.length, 'lead')} {result.skipped.length === 1 ? 'was' : 'were'} skipped</summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
            {result.skipped.map((item) => (
              <li key={item.snapshot_lead_id}>
                <span className="font-medium">{item.company_name}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function OutreachPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'compose' | 'drafts'>('compose')

  // Loaded lead lists live in the URL, so a link from another page preselects one.
  const loadedIds = useMemo(
    () => [...new Set(params.getAll('list').map(Number).filter((id) => Number.isInteger(id) && id > 0))],
    [params],
  )
  const loadedKey = loadedIds.join(',')

  const snapshots = useAsync(() => snapshotService.list(), [])
  const loaded = useAsync(() => Promise.all(loadedIds.map((id) => snapshotService.get(id))), [loadedKey])
  const templates = useAsync(() => outreachService.templates(), [])
  const variables = useAsync(() => outreachService.variables(), [])
  const drafts = useAsync(() => outreachService.drafts(), [])

  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [edited, setEdited] = useState<Message | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [editing, setEditing] = useState<OutreachDraft | null>(null)
  const [toDelete, setToDelete] = useState<OutreachDraft | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Until the user edits it, the message is simply the first template.
  const first = templates.data?.[0]
  const message: Message = edited ?? { templateId: first?.id ?? null, subject: first?.subject ?? '', body: first?.body ?? '' }

  const recipients: SnapshotLead[] = useMemo(() => (loaded.data ?? []).flatMap((snapshot) => snapshot.leads), [loaded.data])
  const eligible = useMemo(() => recipients.filter((lead) => lead.contact_status === 'email_ready'), [recipients])
  const selected = useMemo(() => eligible.filter((lead) => picked.has(lead.id)), [eligible, picked])
  const noEmail = recipients.filter((lead) => lead.contact_status === 'needs_enrichment').length
  const badEmail = recipients.filter((lead) => lead.contact_status === 'invalid_email').length
  const allSelected = eligible.length > 0 && selected.length === eligible.length
  const withDraft = selected.filter((lead) => lead.has_draft).length

  const toggleSnapshot = (id: number) => {
    const next = loadedIds.includes(id) ? loadedIds.filter((value) => value !== id) : [...loadedIds, id]
    setParams({ list: next.map(String) }, { replace: true })
    setResult(null)
  }
  const toggleLead = (id: number) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const generate = async (leads: SnapshotLead[], replace: boolean) => {
    setGenerating(true)
    try {
      const outcome = await outreachService.generate({
        snapshot_lead_ids: leads.map((lead) => lead.id),
        subject: message.subject,
        body: message.body,
        template_id: message.templateId,
        overwrite: replace,
      })
      setResult(outcome)
      setPicked(new Set())
      loaded.reload()
      drafts.reload()
      // Individual mailing: one lead goes straight to its editor.
      if (leads.length === 1 && outcome.drafts.length === 1) setEditing(outcome.drafts[0])
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Drafts could not be created.')
    } finally {
      setGenerating(false)
    }
  }

  const openDraftFor = (lead: SnapshotLead) => {
    const existing = drafts.data?.find((draft) => draft.snapshot_lead_id === lead.id)
    if (existing) setEditing(existing)
    else void generate([lead], false)
  }

  const exportDrafts = async () => {
    try {
      toast.success(`Exported ${plural(drafts.data?.length ?? 0, 'draft')} to ${await outreachService.exportCsv((drafts.data ?? []).map((d) => d.id))}.`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'The export failed.')
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await outreachService.removeDraft(toDelete.id)
      toast.success(`Deleted the draft for ${toDelete.company_name}.`)
      setToDelete(null)
      setEditing(null)
      drafts.reload()
      loaded.reload()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'The draft could not be deleted.')
    } finally {
      setDeleting(false)
    }
  }

  const messageValid = message.subject.trim() !== '' && message.body.trim() !== ''
  const draftCount = drafts.data?.length ?? 0

  return (
    <>
      <PageHeader
        title="Outreach"
        description="Load a lead list, pick the leads that have an email, and turn one template into a personalised draft for each. Nothing is sent from this app."
      />

      <div role="tablist" aria-label="Outreach" className="mb-4 flex gap-1 border-b border-slate-200">
        {(['compose', 'drafts'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-slate-500 hover:text-ink',
            )}
          >
            {key === 'compose' ? 'Compose' : `Drafts (${draftCount})`}
          </button>
        ))}
      </div>

      {tab === 'compose' ? (
        <div className="space-y-4">
          {result && <ResultBanner result={result} onDismiss={() => setResult(null)} onView={() => setTab('drafts')} />}

          <Card className="px-4 py-3">
            <StepTitle step={1}>Load lead lists</StepTitle>
            {snapshots.error ? (
              <ErrorState message={snapshots.error} onRetry={snapshots.reload} />
            ) : !snapshots.data ? (
              <LoadingState label="Loading lead lists…" />
            ) : snapshots.data.length === 0 ? (
              <EmptyState
                icon={<Layers className="size-5" />}
                title="No lead lists yet"
                action={
                  <Button variant="primary" onClick={() => navigate('/leads')}>
                    Go to Find Leads
                  </Button>
                }
              >
                Outreach starts from a saved lead list. Save one from Find Leads, then come back here.
              </EmptyState>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {snapshots.data.map((snapshot) => {
                  const isLoaded = loadedIds.includes(snapshot.id)
                  return (
                    <li key={snapshot.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors',
                          isLoaded ? 'border-indigo-300 bg-accent-soft' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-700"
                          checked={isLoaded}
                          onChange={() => toggleSnapshot(snapshot.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-ink">{snapshot.name}</span>
                          <span className="tabular block text-xs text-slate-500">
                            {snapshot.email_ready} of {plural(snapshot.lead_count, 'lead')} email-ready
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {loadedIds.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <StepTitle step={2}>Choose recipients</StepTitle>
                {loaded.data && (
                  <p className="tabular text-[13px] text-slate-600">
                    <span className="font-semibold text-emerald-700">
                      {eligible.length} of {recipients.length}
                    </span>{' '}
                    leads have a usable email
                    {noEmail + badEmail > 0 && (
                      <>
                        {' '}
                        · {noEmail > 0 && `${noEmail} without email`}
                        {noEmail > 0 && badEmail > 0 && ', '}
                        {badEmail > 0 && `${badEmail} failing the format check`}{' '}
                        <Link to={loadedIds.length === 1 ? `/enrichment/${loadedIds[0]}` : '/enrichment'} className="font-medium text-accent hover:underline">
                          Enrich them
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>
              {loaded.error ? (
                <ErrorState message={loaded.error} onRetry={loaded.reload} />
              ) : !loaded.data ? (
                <LoadingState label="Loading leads…" />
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[680px] text-[13px]">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th scope="col" className="w-10 px-3 py-2">
                          <Checkbox
                            label="Select all leads that have a usable email"
                            checked={allSelected}
                            indeterminate={selected.length > 0 && !allSelected}
                            disabled={eligible.length === 0}
                            onChange={() => setPicked(allSelected ? new Set() : new Set(eligible.map((lead) => lead.id)))}
                          />
                        </th>
                        <th scope="col" className={TH}>Company</th>
                        <th scope="col" className={TH}>Send to</th>
                        <th scope="col" className={TH}>Contact</th>
                        {loadedIds.length > 1 && <th scope="col" className={TH}>Lead list</th>}
                        <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-slate-500">Individual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recipients.map((lead) => {
                        const canEmail = lead.contact_status === 'email_ready'
                        return (
                          <tr key={lead.id} className={cn(!canEmail && 'bg-slate-50/60 text-slate-500', picked.has(lead.id) && canEmail && 'bg-accent-soft/60')}>
                            <td className="px-3 py-2">
                              <Checkbox
                                label={canEmail ? `Select ${lead.company_name}` : `${lead.company_name} cannot be emailed yet`}
                                checked={canEmail && picked.has(lead.id)}
                                disabled={!canEmail}
                                onChange={() => toggleLead(lead.id)}
                              />
                            </td>
                            <td className="max-w-[220px] px-3 py-2">
                              <span className={cn('block truncate font-medium', canEmail ? 'text-ink' : 'text-slate-500')}>{lead.company_name}</span>
                              <span className="block truncate text-xs text-slate-500">{lead.industry ?? 'Unknown category'}</span>
                            </td>
                            <td className="max-w-[260px] px-3 py-2">
                              {canEmail ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-slate-700">{lead.email}</span>
                                  {lead.has_draft && <Badge tone="accent">Draft exists</Badge>}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <ContactBadge status={lead.contact_status} />
                                  <span className="text-xs">{INELIGIBLE_REASON[lead.contact_status as keyof typeof INELIGIBLE_REASON]}</span>
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">{lead.owner_name ?? <span className="text-slate-400">Not available</span>}</td>
                            {loadedIds.length > 1 && <td className="max-w-[160px] truncate px-3 py-2 text-xs">{lead.snapshot_name}</td>}
                            <td className="px-3 py-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!canEmail || generating || !messageValid}
                                icon={<PenLine className="size-3.5" aria-hidden />}
                                onClick={() => openDraftFor(lead)}
                              >
                                {lead.has_draft ? 'Edit draft' : 'Draft'}
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {loadedIds.length > 0 && (
            <Card className="px-4 py-3">
              <StepTitle step={3}>Write the message</StepTitle>
              <div className="mt-3">
                {templates.error ? (
                  <ErrorState message={templates.error} onRetry={templates.reload} />
                ) : !templates.data || !variables.data ? (
                  <LoadingState label="Loading templates…" />
                ) : (
                  <MessageComposer
                    templates={templates.data}
                    variables={variables.data}
                    message={message}
                    previewLead={selected[0] ?? eligible[0] ?? null}
                    onChange={setEdited}
                    onTemplateSaved={(saved) => templates.setData((templates.data ?? []).map((t) => (t.id === saved.id ? saved : t)))}
                  />
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div className="text-[13px] text-slate-600">
                  {selected.length === 0 ? (
                    'Select recipients in step 2 to create drafts in bulk.'
                  ) : withDraft > 0 ? (
                    <Checkbox
                      showLabel
                      label={`Replace the ${plural(withDraft, 'existing draft')} (otherwise ${withDraft === 1 ? 'it is' : 'they are'} skipped)`}
                      checked={overwrite}
                      onChange={(event) => setOverwrite(event.target.checked)}
                    />
                  ) : (
                    `One draft will be created for each of the ${plural(selected.length, 'selected lead')}.`
                  )}
                </div>
                <Button
                  variant="primary"
                  loading={generating}
                  disabled={selected.length === 0 || !messageValid}
                  icon={<Mail className="size-3.5" aria-hidden />}
                  onClick={() => generate(selected, overwrite)}
                >
                  Create {selected.length > 0 ? plural(selected.length, 'draft') : 'drafts'}
                </Button>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
            <p className="tabular text-[13px] text-slate-600">
              <span className="font-semibold text-ink">{plural(draftCount, 'draft')}</span> saved · none sent
            </p>
            <Button size="sm" disabled={draftCount === 0} icon={<Download className="size-3.5" aria-hidden />} onClick={exportDrafts}>
              Export CSV
            </Button>
          </div>
          {drafts.error ? (
            <ErrorState message={drafts.error} onRetry={drafts.reload} />
          ) : !drafts.data ? (
            <LoadingState label="Loading drafts…" />
          ) : drafts.data.length === 0 ? (
            <EmptyState icon={<FileText className="size-5" />} title="No drafts yet" action={<Button onClick={() => setTab('compose')}>Compose drafts</Button>}>
              Load a lead list in Compose, select leads with an email, and create drafts. They will be saved here for
              editing.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-[13px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th scope="col" className={TH}>Company</th>
                    <th scope="col" className={TH}>To</th>
                    <th scope="col" className={TH}>Subject</th>
                    <th scope="col" className={TH}>Lead list</th>
                    <th scope="col" className={TH}>Last edited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drafts.data.map((draft) => (
                    <tr key={draft.id} onClick={() => setEditing(draft)} className="cursor-pointer hover:bg-slate-50">
                      <td className="max-w-[200px] px-4 py-2">
                        <button type="button" className="block max-w-full truncate rounded text-left font-medium text-ink hover:text-accent hover:underline">
                          {draft.company_name}
                        </button>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-slate-700">{draft.to_email}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-slate-700">{draft.subject}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-500">{draft.snapshot_name}</td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatDateTime(draft.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <DraftEditorDialog
        draft={editing}
        onClose={() => setEditing(null)}
        onDelete={setToDelete}
        onSaved={(saved) => {
          setEditing(null)
          toast.success(`Draft for ${saved.company_name} saved.`)
          drafts.reload()
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete draft?"
        confirmLabel="Delete draft"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
        message={toDelete && <>The draft for {toDelete.company_name} will be permanently deleted. The lead stays in its list.</>}
      />
    </>
  )
}
