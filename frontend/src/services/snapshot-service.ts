import type {
  EnrichResult,
  SnapshotCreateInput,
  SnapshotDetail,
  SnapshotLead,
  SnapshotLeadUpdate,
  SnapshotSummary,
} from '../types'
import { del, download, get, patch, post } from './api'

export const snapshotService = {
  list: () => get<SnapshotSummary[]>('/snapshots'),
  get: (id: number) => get<SnapshotDetail>(`/snapshots/${id}`),
  create: (input: SnapshotCreateInput) => post<SnapshotDetail>('/snapshots', input),
  remove: (id: number) => del(`/snapshots/${id}`),
  exportCsv: (id: number) => download(`/snapshots/${id}/export`),
  /** Simulated enrichment. Omit ids to enrich every lead in the snapshot. */
  enrich: (id: number, snapshotLeadIds?: number[]) =>
    post<EnrichResult>(`/snapshots/${id}/enrich`, snapshotLeadIds ? { snapshot_lead_ids: snapshotLeadIds } : undefined),
  updateLead: (id: number, snapshotLeadId: number, changes: SnapshotLeadUpdate) =>
    patch<SnapshotLead>(`/snapshots/${id}/leads/${snapshotLeadId}`, changes),
}
