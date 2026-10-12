import { Camera, Download, SearchX, Target, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreateSnapshotDialog } from '../components/leads/CreateSnapshotDialog'
import { DataQualitySummary } from '../components/leads/DataQualitySummary'
import { LeadDrawer } from '../components/leads/LeadDrawer'
import { LeadFiltersBar } from '../components/leads/LeadFiltersBar'
import { LeadTable } from '../components/leads/LeadTable'
import { TargetProfileDialog } from '../components/leads/TargetProfileDialog'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/Pagination'
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui/States'
import { useToast } from '../components/ui/useToast'
import { useAsync, useDebounced } from '../hooks/useAsync'
import { cn } from '../lib/cn'
import { EMPTY_FILTERS, activeFilterChips } from '../lib/filters'
import { plural } from '../lib/format'
import { leadService } from '../services/lead-service'
import type { Lead, LeadFilters, LeadSort } from '../types'

const PAGE_SIZE = 25

export function FindLeadsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<LeadSort>({ by: 'score', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [picked, setSelected] = useState<Set<number>>(new Set())
  const [openLead, setOpenLead] = useState<Lead | null>(null)
  const [snapshotIds, setSnapshotIds] = useState<number[] | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Typing in the search box should not fire a request per keystroke.
  const debouncedQ = useDebounced(filters.q, 250)
  // Keyed by value, so a keystroke only triggers a request once it has settled.
  const queryKey = JSON.stringify({ ...filters, q: debouncedQ })
  const query = useMemo(() => JSON.parse(queryKey) as LeadFilters, [queryKey])

  const leads = useAsync(() => leadService.search(query, sort, page, PAGE_SIZE), [queryKey, sort.by, sort.dir, page])
  const facets = useAsync(() => leadService.facets(), [])
  const quality = useAsync(() => leadService.dataQuality(), [])
  const profile = useAsync(() => leadService.getTargetProfile(), [])

  const data = leads.data
  const matchingIds = data?.matching_ids

  // Only leads that still match the filters count as selected, so "N selected"
  // never refers to rows the user cannot reach.
  const selected = useMemo(() => {
    if (!matchingIds) return picked
    const allowed = new Set(matchingIds)
    return new Set([...picked].filter((id) => allowed.has(id)))
  }, [picked, matchingIds])

  const updateFilters = (next: LeadFilters) => {
    setFilters(next)
    setPage(1)
  }
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const togglePage = (select: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const lead of data?.items ?? []) {
        if (select) next.add(lead.id)
        else next.delete(lead.id)
      }
      return next
    })

  const exportLeads = async (ids: number[]) => {
    setExporting(true)
    try {
      const filename = await leadService.exportCsv(ids)
      toast.success(`Exported ${plural(ids.length, 'lead')} to ${filename}.`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'The export failed.')
    } finally {
      setExporting(false)
    }
  }

  const hasFilters = activeFilterChips(filters).length > 0
  const total = data?.total ?? 0
  const selectedCount = selected.size
  // With nothing selected, the snapshot covers everything that matches.
  const snapshotAll = selectedCount === 0

  return (
    <>
      <PageHeader
        title="Find Leads"
        description="Search one or more business categories, narrow the results, then save them as a snapshot to enrich and contact."
        actions={
          <>
            <Badge tone="warning" title="Every company and contact in this workspace is fictional.">
              Synthetic demo data
            </Badge>
            <Button icon={<Target className="size-3.5" aria-hidden />} onClick={() => setProfileOpen(true)}>
              Target profile
            </Button>
            <Button
              variant="primary"
              icon={<Camera className="size-3.5" aria-hidden />}
              disabled={!matchingIds?.length}
              onClick={() => setSnapshotIds(snapshotAll ? (matchingIds ?? []) : [...selected])}
            >
              {snapshotAll ? `Save ${hasFilters ? 'results' : 'all'} as snapshot` : `Save ${selectedCount} as snapshot`}
            </Button>
          </>
        }
      />

      {quality.data && (
        <DataQualitySummary quality={quality.data} title="Data quality across all companies" defaultOpen={false} />
      )}

      {data && !data.profile_configured && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[13px] text-amber-900">
            <span className="font-semibold">Leads are not scored.</span> Set a target profile to see which companies fit
            and why.
          </p>
          <Button size="sm" onClick={() => setProfileOpen(true)}>
            Set target profile
          </Button>
        </div>
      )}

      <Card>
        <LeadFiltersBar filters={filters} facets={facets.data} onChange={updateFilters} onReset={() => updateFilters(EMPTY_FILTERS)} />

        {/* Result count, or the bulk-action bar once something is selected. */}
        <div
          className={cn(
            'flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-1.5',
            selectedCount > 0 && 'bg-accent-soft',
          )}
        >
          {selectedCount === 0 ? (
            <p className="tabular text-[13px] text-slate-600" aria-live="polite">
              {data ? (
                <>
                  <span className="font-semibold text-ink">{plural(total, 'company', 'companies')}</span>
                  {hasFilters ? ' match your filters' : ' in this workspace'}
                </>
              ) : (
                'Loading…'
              )}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="tabular font-semibold text-indigo-900">{selectedCount} selected</span>
                {matchingIds && selectedCount < matchingIds.length && (
                  <button type="button" onClick={() => setSelected(new Set(matchingIds))} className="font-medium text-accent hover:underline">
                    Select all {matchingIds.length} matching
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="primary" icon={<Camera className="size-3.5" aria-hidden />} onClick={() => setSnapshotIds([...selected])}>
                  Save as snapshot
                </Button>
                <Button size="sm" loading={exporting} icon={<Download className="size-3.5" aria-hidden />} onClick={() => exportLeads([...selected])}>
                  Export CSV
                </Button>
                <Button size="sm" variant="ghost" icon={<X className="size-3.5" aria-hidden />} onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </div>
            </>
          )}
        </div>

        {leads.error ? (
          <ErrorState message={leads.error} onRetry={leads.reload} />
        ) : !data ? (
          <LoadingState label="Loading leads…" />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-5" />}
            title="No leads match these filters"
            action={hasFilters && <Button onClick={() => updateFilters(EMPTY_FILTERS)}>Reset filters</Button>}
          >
            Try removing a filter or searching for a different category.
          </EmptyState>
        ) : (
          <div className={cn('transition-opacity', leads.loading && 'opacity-60')} aria-busy={leads.loading}>
            <LeadTable
              leads={data.items}
              selected={selected}
              sort={sort}
              activeId={openLead?.id ?? null}
              onSort={(next) => {
                setSort(next)
                setPage(1)
              }}
              onToggle={toggle}
              onTogglePage={togglePage}
              onOpen={setOpenLead}
              onExport={(lead) => exportLeads([lead.id])}
            />
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </div>
        )}
      </Card>

      <LeadDrawer
        lead={openLead}
        onClose={() => setOpenLead(null)}
        footer={
          openLead && (
            <Button
              variant={selected.has(openLead.id) ? 'secondary' : 'primary'}
              onClick={() => toggle(openLead.id)}
            >
              {selected.has(openLead.id) ? 'Remove from selection' : 'Add to selection'}
            </Button>
          )
        }
        note={
          openLead && openLead.merged_duplicates > 0 ? (
            <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {plural(openLead.merged_duplicates, 'duplicate record')} with the same domain{' '}
              {openLead.merged_duplicates === 1 ? 'was' : 'were'} merged into this company on import.
            </p>
          ) : undefined
        }
      />

      <CreateSnapshotDialog
        open={snapshotIds !== null}
        leadIds={snapshotIds ?? []}
        filters={filters}
        allMatching={snapshotAll}
        onClose={() => setSnapshotIds(null)}
        onCreated={(snapshot) => {
          setSnapshotIds(null)
          setSelected(new Set())
          toast.success(`Saved “${snapshot.name}” with ${plural(snapshot.lead_count, 'lead')}. Next: enrich it.`)
          navigate(`/enrichment/${snapshot.id}`)
        }}
      />

      <TargetProfileDialog
        open={profileOpen}
        profile={profile.data}
        facets={facets.data}
        onClose={() => setProfileOpen(false)}
        onSaved={(saved) => {
          profile.setData(saved)
          setProfileOpen(false)
          leads.reload()
          toast.success(saved.configured ? 'Target profile saved. Leads rescored.' : 'Target profile cleared. Leads are no longer scored.')
        }}
      />
    </>
  )
}
