import type {
  DraftPreview,
  GenerateInput,
  GenerateResult,
  OutreachDraft,
  OutreachTemplate,
  SendResult,
  TemplateVariable,
} from '../types'
import { del, download, get, patch, post, put } from './api'

type TemplateInput = Omit<OutreachTemplate, 'id'>

export const outreachService = {
  variables: () => get<TemplateVariable[]>('/outreach/variables'),
  templates: () => get<OutreachTemplate[]>('/outreach/templates'),
  createTemplate: (input: TemplateInput) => post<OutreachTemplate>('/outreach/templates', input),
  updateTemplate: (id: number, input: TemplateInput) => put<OutreachTemplate>(`/outreach/templates/${id}`, input),
  preview: (snapshotLeadId: number, subject: string, body: string) =>
    post<DraftPreview>('/outreach/preview', { snapshot_lead_id: snapshotLeadId, subject, body }),
  generate: (input: GenerateInput) => post<GenerateResult>('/outreach/drafts/generate', input),
  drafts: (snapshotId?: number) =>
    get<OutreachDraft[]>(`/outreach/drafts${snapshotId === undefined ? '' : `?snapshot_id=${snapshotId}`}`),
  updateDraft: (id: number, subject: string, body: string) =>
    patch<OutreachDraft>(`/outreach/drafts/${id}`, { subject, body }),
  /** Simulated send: marks the drafts as sent. No email is delivered. */
  send: (draftIds: number[]) => post<SendResult>('/outreach/drafts/send', { draft_ids: draftIds }),
  removeDraft: (id: number) => del(`/outreach/drafts/${id}`),
  exportCsv: (draftIds: number[]) => {
    const params = new URLSearchParams()
    draftIds.forEach((id) => params.append('ids', String(id)))
    return download(`/outreach/drafts/export?${params}`)
  },
}
