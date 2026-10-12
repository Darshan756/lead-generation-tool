import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const CONTROL =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-ink shadow-sm placeholder:text-slate-400 hover:border-slate-400 focus:border-accent disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

interface FieldShellProps {
  label: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode
}

function FieldShell({ label, hint, error, optional, children }: FieldShellProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-baseline justify-between text-xs font-medium text-slate-700">
        <span>{label}</span>
        {optional && <span className="font-normal text-slate-400">Optional</span>}
      </label>
      {children({ id, describedBy })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

type Shared = { label: string; hint?: ReactNode; error?: string | null; optional?: boolean }

export function TextField({ label, hint, error, optional, className, ...rest }: Shared & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL, 'h-8', error && 'border-red-500', className)}
          {...rest}
        />
      )}
    </FieldShell>
  )
}

export function TextArea({ label, hint, error, optional, className, ref, ...rest }: Shared & TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy }) => (
        <textarea
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL, 'py-2 leading-relaxed', error && 'border-red-500', className)}
          {...rest}
        />
      )}
    </FieldShell>
  )
}

export function SelectField({ label, hint, error, optional, className, children, ...rest }: Shared & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy }) => (
        <select id={id} aria-describedby={describedBy} className={cn(CONTROL, 'h-8 pr-7', className)} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  )
}
