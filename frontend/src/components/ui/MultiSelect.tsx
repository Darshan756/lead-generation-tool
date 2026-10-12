import { ChevronDown } from 'lucide-react'
import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import { cn } from '../../lib/cn'

export interface Option<T extends string> {
  value: T
  label: string
  count?: number
}

interface MultiSelectProps<T extends string> {
  label: string
  options: Option<T>[]
  selected: T[]
  onChange: (selected: T[]) => void
  align?: 'left' | 'right'
}

/** Filter dropdown with checkboxes. The trigger shows how many are selected. */
export function MultiSelect<T extends string>({ label, options, selected, onChange, align = 'left' }: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useDismiss(ref, open, useCallback(() => setOpen(false), []))

  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <div ref={ref} className="relative">
      <FilterTrigger label={label} count={selected.length} open={open} controls={panelId} onClick={() => setOpen(!open)} />
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className={cn(
            'absolute z-30 mt-1 max-h-72 w-60 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.length === 0 && <p className="px-2 py-2 text-xs text-slate-500">No options available.</p>}
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="size-4 rounded border-slate-300 accent-indigo-700"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span className="flex-1 truncate">{option.label}</span>
              {option.count !== undefined && <span className="tabular text-xs text-slate-400">{option.count}</span>}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded border-t border-slate-100 px-2 py-1.5 text-left text-xs font-medium text-accent hover:bg-slate-50"
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface FilterTriggerProps {
  label: string
  count: number
  open: boolean
  controls: string
  onClick: () => void
  children?: ReactNode
}

export function FilterTrigger({ label, count, open, controls, onClick }: FilterTriggerProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[13px] font-medium shadow-sm transition-colors',
        count > 0
          ? 'border-indigo-300 bg-accent-soft text-indigo-800 hover:border-indigo-400'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
      )}
    >
      {label}
      {count > 0 && (
        <span className="tabular rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-4 text-white">{count}</span>
      )}
      <ChevronDown className={cn('size-3.5 opacity-60 transition-transform', open && 'rotate-180')} aria-hidden />
    </button>
  )
}
