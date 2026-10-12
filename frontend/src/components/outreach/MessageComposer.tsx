import { useEffect, useRef, useState } from 'react'
import { useDebounced } from '../../hooks/useAsync'
import { outreachService } from '../../services/outreach-service'
import type { DraftPreview, OutreachTemplate, SnapshotLead, TemplateVariable } from '../../types'
import { Button } from '../ui/Button'
import { SelectField, TextArea, TextField } from '../ui/Field'
import { useToast } from '../ui/useToast'

export interface Message {
  templateId: number | null
  subject: string
  body: string
}

interface MessageComposerProps {
  templates: OutreachTemplate[]
  variables: TemplateVariable[]
  message: Message
  /** The lead used for the live preview. */
  previewLead: SnapshotLead | null
  onChange: (message: Message) => void
  onTemplateSaved: (template: OutreachTemplate) => void
}

export function MessageComposer({ templates, variables, message, previewLead, onChange, onTemplateSaved }: MessageComposerProps) {
  const toast = useToast()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState<DraftPreview | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)

  const template = templates.find((t) => t.id === message.templateId) ?? null
  const edited = template !== null && (template.subject !== message.subject || template.body !== message.body)

  // The server renders the preview, so it is exactly what a draft will contain.
  const debounced = useDebounced(JSON.stringify([previewLead?.id ?? null, message.subject, message.body]), 300)
  useEffect(() => {
    const [leadId, subject, body] = JSON.parse(debounced) as [number | null, string, string]
    if (leadId === null) return
    let current = true
    outreachService.preview(leadId, subject, body).then(
      (result) => current && setPreview(result),
      () => current && setPreview(null),
    )
    return () => {
      current = false
    }
  }, [debounced])

  const insertVariable = (name: string) => {
    const token = `{{${name}}}`
    const area = bodyRef.current
    const start = area?.selectionStart ?? message.body.length
    const end = area?.selectionEnd ?? message.body.length
    onChange({ ...message, body: message.body.slice(0, start) + token + message.body.slice(end) })
    requestAnimationFrame(() => {
      area?.focus()
      area?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const saveTemplate = async () => {
    if (!template) return
    setSavingTemplate(true)
    try {
      const saved = await outreachService.updateTemplate(template.id, { name: template.name, subject: message.subject, body: message.body })
      onTemplateSaved(saved)
      toast.success(`Template “${saved.name}” updated.`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'The template could not be saved.')
    } finally {
      setSavingTemplate(false)
    }
  }

  const shown = previewLead ? preview : null

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <SelectField
          label="Template"
          value={message.templateId ?? ''}
          onChange={(event) => {
            const next = templates.find((t) => t.id === Number(event.target.value))
            if (next) onChange({ templateId: next.id, subject: next.subject, body: next.body })
          }}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Subject"
          value={message.subject}
          maxLength={300}
          error={message.subject.trim() ? null : 'A subject is required.'}
          onChange={(event) => onChange({ ...message, subject: event.target.value })}
        />
        <TextArea
          ref={bodyRef}
          label="Message"
          rows={11}
          value={message.body}
          maxLength={10000}
          error={message.body.trim() ? null : 'A message is required.'}
          onChange={(event) => onChange({ ...message, body: event.target.value })}
        />
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-700">Insert a column from the lead list</p>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((variable) => (
              <button
                key={variable.name}
                type="button"
                title={`${variable.description}. If missing, “${variable.fallback}” is used.`}
                onClick={() => insertVariable(variable.name)}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 hover:border-accent hover:text-accent"
              >
                {`{{${variable.name}}}`}
              </button>
            ))}
          </div>
        </div>
        {edited && (
          <Button size="sm" loading={savingTemplate} onClick={saveTemplate}>
            Save these edits to the template
          </Button>
        )}
      </div>

      <div className="flex flex-col rounded-md border border-slate-200 bg-slate-50">
        <p className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
          Preview{previewLead && <span className="font-normal text-slate-500"> — {previewLead.company_name}</span>}
        </p>
        {!previewLead ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">Select a recipient to preview the message.</p>
        ) : !shown ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">Preparing preview…</p>
        ) : (
          <div className="flex-1 space-y-2 px-3 py-3 text-[13px]">
            <p className="text-xs text-slate-500">
              To: <span className="text-slate-700">{shown.to_email ?? 'no usable email'}</span>
            </p>
            <p className="font-semibold text-ink">{shown.subject || '(empty subject)'}</p>
            <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{shown.body || '(empty message)'}</p>
            {shown.fallbacks_used.length > 0 && (
              <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
                This record has no value for {shown.fallbacks_used.map((name) => `{{${name}}}`).join(', ')}, so neutral
                wording was used instead of inventing one.
              </p>
            )}
            {shown.unknown_variables.length > 0 && (
              <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-800 ring-1 ring-inset ring-red-200">
                Unknown variable {shown.unknown_variables.map((name) => `{{${name}}}`).join(', ')} was removed. Check
                the spelling.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
