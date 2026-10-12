import { Download, Layers, Mail, Search, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { StageBadge } from '../components/leads/indicators'
import { CriteriaChips } from '../components/snapshots/CriteriaChips'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { RowMenu } from '../components/ui/RowMenu'
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui/States'
import { useToast } from '../components/ui/useToast'
import { useAsync } from '../hooks/useAsync'
import { formatDate, plural } from '../lib/format'
import { snapshotService } from '../services/snapshot-service'
import type { SnapshotSummary } from '../types'

const TH = 'px-4 py-2 text-left text-xs font-medium text-slate-500'

export function SnapshotsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const snapshots = useAsync(() => snapshotService.list(), [])
  const [toDelete, setToDelete] = useState<SnapshotSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const exportCsv = async (snapshot: SnapshotSummary) => {
    try {
      toast.success(`Exported “${snapshot.name}” to ${await snapshotService.exportCsv(snapshot.id)}.`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'The export failed.')
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await snapshotService.remove(toDelete.id)
      toast.success(`Deleted “${toDelete.name}”.`)
      setToDelete(null)
      snapshots.reload()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'The snapshot could not be deleted.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Snapshots"
        description="Saved lead lists. Each one is a point-in-time copy that you carry through enrichment and outreach."
        actions={
          <Button variant="primary" icon={<Search className="size-3.5" aria-hidden />} onClick={() => navigate('/leads')}>
            Find leads
          </Button>
        }
      />
      <Card>
        {snapshots.error ? (
          <ErrorState message={snapshots.error} onRetry={snapshots.reload} />
        ) : !snapshots.data ? (
          <LoadingState label="Loading snapshots…" />
        ) : snapshots.data.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-5" />}
            title="No snapshots yet"
            action={
              <Button variant="primary" onClick={() => navigate('/leads')}>
                Go to Find Leads
              </Button>
            }
          >
            In Find Leads, filter to the companies you want and choose “Save as snapshot”. The list will appear here.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th scope="col" className={TH}>Snapshot</th>
                  <th scope="col" className={TH}>Stage</th>
                  <th scope="col" className={TH}>Leads</th>
                  <th scope="col" className={TH}>Email ready</th>
                  <th scope="col" className={TH}>Drafts</th>
                  <th scope="col" className={TH}>Created</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-slate-500">Next step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshots.data.map((snapshot) => {
                  const added = snapshot.email_ready - snapshot.email_ready_at_creation
                  const needsWork = snapshot.needs_enrichment + snapshot.invalid_email
                  return (
                    <tr key={snapshot.id} className="align-top hover:bg-slate-50">
                      <td className="max-w-sm px-4 py-3">
                        <Link to={`/enrichment/${snapshot.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                          {snapshot.name}
                        </Link>
                        {snapshot.description && <p className="mt-0.5 text-xs text-slate-500">{snapshot.description}</p>}
                        <div className="mt-1.5">
                          <CriteriaChips criteria={snapshot.criteria} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StageBadge stage={snapshot.stage} />
                      </td>
                      <td className="tabular px-4 py-3 text-slate-700">{snapshot.lead_count}</td>
                      <td className="tabular px-4 py-3 text-slate-700">
                        {snapshot.email_ready} of {snapshot.lead_count}
                        {added > 0 && <span className="block text-xs text-emerald-700">+{added} from enrichment</span>}
                      </td>
                      <td className="tabular px-4 py-3 text-slate-700">{snapshot.draft_count}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(snapshot.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {needsWork > 0 && snapshot.stage === 'raw' ? (
                            <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" aria-hidden />} onClick={() => navigate(`/enrichment/${snapshot.id}`)}>
                              Enrich
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={snapshot.email_ready === 0}
                              title={snapshot.email_ready === 0 ? 'No lead in this snapshot has a usable email yet.' : undefined}
                              icon={<Mail className="size-3.5" aria-hidden />}
                              onClick={() => navigate(`/outreach?snapshot=${snapshot.id}`)}
                            >
                              Outreach
                            </Button>
                          )}
                          <RowMenu
                            label={`Actions for ${snapshot.name}`}
                            items={[
                              { label: 'Open and enrich', icon: <Sparkles className="size-3.5" aria-hidden />, onSelect: () => navigate(`/enrichment/${snapshot.id}`) },
                              {
                                label: 'Prepare outreach',
                                icon: <Mail className="size-3.5" aria-hidden />,
                                disabled: snapshot.email_ready === 0,
                                onSelect: () => navigate(`/outreach?snapshot=${snapshot.id}`),
                              },
                              { label: 'Export CSV', icon: <Download className="size-3.5" aria-hidden />, onSelect: () => exportCsv(snapshot) },
                              { label: 'Delete', icon: <Trash2 className="size-3.5" aria-hidden />, danger: true, onSelect: () => setToDelete(snapshot) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete snapshot?"
        confirmLabel="Delete snapshot"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
        message={
          toDelete && (
            <>
              “{toDelete.name}” and its {plural(toDelete.lead_count, 'lead')}
              {toDelete.draft_count > 0 && ` and ${plural(toDelete.draft_count, 'outreach draft')}`} will be permanently
              deleted, including any enrichment. The companies stay in Find Leads.
            </>
          )
        }
      />
    </>
  )
}
