import { CheckCircle2, Copy, ExternalLink, Send, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { formatDateTime, mailtoLink } from '../../lib/format'
import { outreachService } from '../../services/outreach-service'
import type { OutreachDraft } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { TextArea, TextField } from '../ui/Field'
import { useToast } from '../ui/useToast'

interface DraftEditorDialogProps {
  draft: OutreachDraft | null
  onClose: () => void
  onSaved: (draft: OutreachDraft) => void
  onSent: (draft: OutreachDraft) => void
  onDelete: (draft: OutreachDraft) => void
}

export function DraftEditorDialog({ draft, onClose, onSaved, onSent, onDelete }: DraftEditorDialogProps) {
  return draft ? <DraftEditor key={draft.id} draft={draft} onClose={onClose} onSaved={onSaved} onSent={onSent} onDelete={onDelete} /> : null
}

function DraftEditor({ draft, onClose, onSaved, onSent, onDelete }: { draft: OutreachDraft } & Omit<DraftEditorDialogProps, 'draft'>) {
  const toast = useToast()
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sent = draft.sent_at !== null
  const dirty = subject !== draft.subject || body !== draft.body
  const subjectError = subject.trim() ? null : 'A subject is required.'
  const bodyError = body.trim() ? null : 'A message is required.'

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (subjectError || bodyError) return
    setSaving(true)
    setError(null)
    try {
      onSaved(await outreachService.updateDraft(draft.id, subject, body))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The draft could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      const result = await outreachService.send([draft.id])
      onSent(result.drafts[0])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The email could not be sent.')
    } finally {
      setSending(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      toast.success('Draft copied to the clipboard.')
    } catch {
      toast.error('Copying is blocked by the browser. Select the text and copy it manually.')
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={sent ? `Email to ${draft.company_name}` : `Draft for ${draft.company_name}`}
      description={
        <>
          To <span className="font-medium text-slate-700">{draft.to_email}</span>
          {draft.owner_name && ` · ${draft.owner_name}`} · from “{draft.snapshot_name}”
        </>
      }
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-red-700 hover:bg-red-50 hover:text-red-800" icon={<Trash2 className="size-3.5" aria-hidden />} onClick={() => onDelete(draft)}>
            Delete
          </Button>
          <Button icon={<Copy className="size-3.5" aria-hidden />} onClick={copy}>
            Copy
          </Button>
          {sent ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
              <CheckCircle2 className="size-4" aria-hidden />
              Sent {formatDateTime(draft.sent_at ?? '')}
            </span>
          ) : (
            <>
              <a
                href={mailtoLink(draft.to_email, subject, body)}
                title="Opens this draft in your own email app."
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Open in mail app
              </a>
              <Button type="submit" form="draft-editor" loading={saving} disabled={!dirty || Boolean(subjectError || bodyError)}>
                Save draft
              </Button>
              <Button
                variant="primary"
                loading={sending}
                disabled={dirty || Boolean(subjectError || bodyError)}
                title={dirty ? 'Save your changes before sending.' : 'Demo send: the draft is marked as sent. No email is delivered.'}
                icon={<Send className="size-3.5" aria-hidden />}
                onClick={send}
              >
                Send
              </Button>
            </>
          )}
        </>
      }
    >
      <form id="draft-editor" onSubmit={save} className="space-y-3" noValidate>
        <TextField label="Subject" value={subject} maxLength={300} readOnly={sent} error={subjectError} onChange={(event) => setSubject(event.target.value)} />
        <TextArea label="Message" rows={12} value={body} maxLength={10000} readOnly={sent} error={bodyError ?? error} onChange={(event) => setBody(event.target.value)} />
        <p className="text-xs text-slate-500">{sent ? 'This email has been sent and can no longer be edited.' : 'Review the draft, then press Send.'}</p>
      </form>
    </Dialog>
  )
}
