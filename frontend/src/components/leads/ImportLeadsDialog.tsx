import { CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { plural } from '../../lib/format'
import { leadService } from '../../services/lead-service'
import type { ImportResult } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

interface ImportLeadsDialogProps {
  open: boolean
  onClose: () => void
  /** Called after a successful import so the page can refresh its data. */
  onImported: (result: ImportResult) => void
}

const COLUMNS = 'Company name (required), Industry, City, State, Website, Email, Phone, Revenue (USD), Employees, Owner name, Owner title, Founded'
const MAX_BYTES = 5 * 1024 * 1024

/** Mounted only while open, so it always starts with no file chosen. */
export function ImportLeadsDialog(props: ImportLeadsDialogProps) {
  return props.open ? <ImportLeadsForm {...props} /> : null
}

function ImportLeadsForm({ onClose, onImported }: ImportLeadsDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const choose = (chosen: File | null) => {
    setFile(chosen)
    setError(
      !chosen
        ? null
        : !/\.(xlsx|csv)$/i.test(chosen.name)
          ? 'Choose an Excel (.xlsx) or CSV (.csv) file.'
          : chosen.size > MAX_BYTES
            ? 'The file is larger than 5 MB. Split it into smaller files.'
            : null,
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!file || error) return
    setUploading(true)
    try {
      const outcome = await leadService.importFile(file)
      setResult(outcome)
      onImported(outcome)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The file could not be imported.')
    } finally {
      setUploading(false)
    }
  }

  if (result) {
    return (
      <Dialog
        open
        onClose={onClose}
        title="Import finished"
        description={result.filename}
        footer={
          <Button variant="primary" onClick={onClose} data-autofocus>
            Done
          </Button>
        }
      >
        <div className="flex items-start gap-2.5" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          <div className="text-[13px] leading-relaxed text-slate-700">
            <p className="font-semibold text-ink">
              {plural(result.inserted, 'new company', 'new companies')} added from {plural(result.rows_read, 'row')}
            </p>
            {result.duplicates_merged > 0 && (
              <p>
                {plural(result.duplicates_merged, 'row')} matched a company already in the list (same domain, or same
                name and state) and {result.duplicates_merged === 1 ? 'was' : 'were'} merged instead of duplicated.
              </p>
            )}
            {result.inserted === 0 && result.duplicates_merged === 0 && result.skipped.length === 0 && (
              <p>The file had a header row but no data rows.</p>
            )}
          </div>
        </div>
        {result.skipped.length > 0 && (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2.5 ring-1 ring-inset ring-amber-200">
            <p className="text-[13px] font-semibold text-amber-900">
              {plural(result.skipped.length, 'row')} skipped — fix {result.skipped.length === 1 ? 'it' : 'them'} in the
              file and import again
            </p>
            <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-xs text-amber-900">
              {result.skipped.map((item) => (
                <li key={item.row}>
                  <span className="tabular font-medium">Row {item.row}:</span> {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Import leads"
      description="Add companies from a spreadsheet. They are saved to the lead database and become searchable."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="import-leads" loading={uploading} disabled={!file || Boolean(error)}>
            Import
          </Button>
        </>
      }
    >
      <form id="import-leads" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="import-file" className="mb-1 block text-xs font-medium text-slate-700">
            Excel or CSV file
          </label>
          <input
            id="import-file"
            type="file"
            accept=".xlsx,.csv"
            aria-describedby={error ? 'import-error' : 'import-hint'}
            aria-invalid={error ? true : undefined}
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-md border border-slate-300 bg-white text-[13px] text-slate-700 shadow-sm file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-slate-300 file:bg-slate-50 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-slate-700 hover:border-slate-400"
          />
          {error ? (
            <p id="import-error" role="alert" className="mt-1 text-xs text-red-700">
              {error}
            </p>
          ) : (
            <p id="import-hint" className="mt-1 text-xs text-slate-500">
              Up to 5 MB and 5,000 rows. The first row must be column headers.
            </p>
          )}
        </div>
        <div className="flex items-start gap-2.5 rounded-md bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <div>
            <p className="font-medium text-slate-700">Columns</p>
            <p>{COLUMNS}.</p>
            <p className="mt-1">
              Only the company name is required. Blank cells are kept as missing data, rows that match an existing
              company are merged, and rows with problems are listed so you can fix them.
            </p>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
