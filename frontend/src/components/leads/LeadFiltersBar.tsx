import { RotateCcw, Search, X } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import { REVENUE_STEPS, activeFilterChips, revenueLabel } from '../../lib/filters'
import { CONFIDENCE_LABELS, CONTACT_LABELS, PRIORITY_LABELS, formatMoney } from '../../lib/format'
import type { ConfidenceLevel, ContactStatus, LeadFacets, LeadFilters, Priority } from '../../types'
import { Button } from '../ui/Button'
import { FilterTrigger, MultiSelect, type Option } from '../ui/MultiSelect'

const PRIORITY_OPTIONS: Option<Priority>[] = (['high', 'medium', 'low'] as const).map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}))
const CONFIDENCE_OPTIONS: Option<ConfidenceLevel>[] = (['high', 'medium', 'low'] as const).map((value) => ({
  value,
  label: CONFIDENCE_LABELS[value],
}))
const CONTACT_OPTIONS: Option<ContactStatus>[] = (['email_ready', 'needs_enrichment', 'invalid_email'] as const).map(
  (value) => ({ value, label: CONTACT_LABELS[value].short }),
)

interface RevenueFilterProps {
  min: number | null
  max: number | null
  onChange: (min: number | null, max: number | null) => void
}

function RevenueFilter({ min, max, onChange }: RevenueFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useDismiss(ref, open, useCallback(() => setOpen(false), []))
  const parse = (value: string) => (value === '' ? null : Number(value))
  const active = revenueLabel(min, max)

  return (
    <div ref={ref} className="relative">
      <FilterTrigger label={active ? `Revenue: ${active}` : 'Revenue'} count={0} open={open} controls={panelId} onClick={() => setOpen(!open)} />
      {open && (
        <div id={panelId} className="absolute left-0 z-30 mt-1 w-64 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Minimum
              <select
                value={min ?? ''}
                onChange={(event) => onChange(parse(event.target.value), max)}
                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] font-normal"
              >
                <option value="">No minimum</option>
                {REVENUE_STEPS.map((step) => (
                  <option key={step} value={step} disabled={max !== null && step > max}>
                    {formatMoney(step)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Maximum
              <select
                value={max ?? ''}
                onChange={(event) => onChange(min, parse(event.target.value))}
                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] font-normal"
              >
                <option value="">No maximum</option>
                {REVENUE_STEPS.map((step) => (
                  <option key={step} value={step} disabled={min !== null && step < min}>
                    {formatMoney(step)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs leading-snug text-slate-500">
            Companies with unknown revenue are hidden while a revenue filter is on.
          </p>
          {active && (
            <button type="button" onClick={() => onChange(null, null)} className="mt-2 text-xs font-medium text-accent hover:underline">
              Clear revenue
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface LeadFiltersBarProps {
  filters: LeadFilters
  facets: LeadFacets | undefined
  onChange: (filters: LeadFilters) => void
  onReset: () => void
}

export function LeadFiltersBar({ filters, facets, onChange, onReset }: LeadFiltersBarProps) {
  const chips = activeFilterChips(filters)
  const set = <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => onChange({ ...filters, [key]: value })
  const facetOptions = (values: LeadFacets['industries'] | undefined): Option<string>[] =>
    (values ?? []).map((facet) => ({ value: facet.value, label: facet.value, count: facet.count }))

  return (
    <div className="space-y-2.5 border-b border-slate-200 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-slate-400" aria-hidden />
          <input
            type="search"
            aria-label="Search leads"
            placeholder="Search company, industry, domain, city…"
            value={filters.q}
            maxLength={100}
            onChange={(event) => set('q', event.target.value)}
            className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-[13px] shadow-sm placeholder:text-slate-400 hover:border-slate-400 focus:border-accent"
          />
        </div>
        <MultiSelect label="Category" options={facetOptions(facets?.industries)} selected={filters.industries} onChange={(v) => set('industries', v)} />
        <MultiSelect label="State" options={facetOptions(facets?.states)} selected={filters.states} onChange={(v) => set('states', v)} />
        <RevenueFilter
          min={filters.revenue_min}
          max={filters.revenue_max}
          onChange={(min, max) => onChange({ ...filters, revenue_min: min, revenue_max: max })}
        />
        <MultiSelect label="Priority" options={PRIORITY_OPTIONS} selected={filters.priorities} onChange={(v) => set('priorities', v)} />
        <MultiSelect label="Confidence" options={CONFIDENCE_OPTIONS} selected={filters.confidences} onChange={(v) => set('confidences', v)} />
        <MultiSelect label="Contact" options={CONTACT_OPTIONS} selected={filters.contact_statuses} onChange={(v) => set('contact_statuses', v)} align="right" />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1 rounded bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-700">
              {chip.label}
              <button
                type="button"
                aria-label={`Remove filter ${chip.label}`}
                onClick={() => onChange(chip.remove(filters))}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3" aria-hidden />} onClick={onReset}>
            Reset filters
          </Button>
        </div>
      )}
    </div>
  )
}
