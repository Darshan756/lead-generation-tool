import { toSearchParams } from '../lib/filters'
import type { DataQuality, ImportResult, LeadFacets, LeadFilters, LeadPage, LeadSort, TargetProfile, TargetProfileInput } from '../types'
import { download, get, put, upload } from './api'

export const leadService = {
  search: (filters: LeadFilters, sort: LeadSort, page: number, pageSize: number) =>
    get<LeadPage>(`/leads?${toSearchParams(filters, sort, page, pageSize)}`),
  facets: () => get<LeadFacets>('/leads/facets'),
  dataQuality: () => get<DataQuality>('/data-quality'),
  getTargetProfile: () => get<TargetProfile>('/target-profile'),
  saveTargetProfile: (profile: TargetProfileInput) => put<TargetProfile>('/target-profile', profile),
  /** Add leads from an Excel (.xlsx) or CSV file. */
  importFile: (file: File) => upload<ImportResult>('/leads/import', file),
  exportCsv: (leadIds: number[]) =>
    download('/leads/export', { method: 'POST', body: JSON.stringify({ lead_ids: leadIds }) }),
}
