import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Eye, SquareCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { formatLocation, formatMoney } from '../../lib/format'
import type { Lead, LeadSort, SortField } from '../../types'
import { Checkbox } from '../ui/Checkbox'
import { RowMenu } from '../ui/RowMenu'
import { ConfidenceCell, ContactBadge, PriorityBadge, ScoreCell } from './indicators'

interface LeadTableProps {
  leads: Lead[]
  selected: Set<number>
  sort: LeadSort
  activeId: number | null
  onSort: (sort: LeadSort) => void
  onToggle: (id: number) => void
  onTogglePage: (select: boolean) => void
  onOpen: (lead: Lead) => void
  onExport: (lead: Lead) => void
}

interface HeaderProps {
  field: SortField
  sort: LeadSort
  onSort: (sort: LeadSort) => void
  className?: string
  children: ReactNode
}

function SortHeader({ field, sort, onSort, className, children }: HeaderProps) {
  const active = sort.by === field
  // Text columns start A→Z; numeric columns start with the largest first.
  const firstDir = field === 'company_name' || field === 'industry' || field === 'state' ? 'asc' : 'desc'
  const next: LeadSort = active ? { by: field, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { by: field, dir: firstDir }
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-2 text-left', className)}>
      <button
        type="button"
        onClick={() => onSort(next)}
        className={cn('inline-flex items-center gap-1 rounded text-xs font-medium hover:text-ink', active ? 'text-ink' : 'text-slate-500')}
      >
        {children}
        <Icon className={cn('size-3', !active && 'opacity-50')} aria-hidden />
      </button>
    </th>
  )
}

const TH = 'px-3 py-2 text-left text-xs font-medium text-slate-500'

export function LeadTable({ leads, selected, sort, activeId, onSort, onToggle, onTogglePage, onOpen, onExport }: LeadTableProps) {
  const selectedOnPage = leads.filter((lead) => selected.has(lead.id)).length
  const allSelected = leads.length > 0 && selectedOnPage === leads.length

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th scope="col" className="w-10 px-3 py-2">
              <Checkbox
                label="Select all leads on this page"
                checked={allSelected}
                indeterminate={selectedOnPage > 0 && !allSelected}
                onChange={() => onTogglePage(!allSelected)}
              />
            </th>
            <SortHeader field="company_name" sort={sort} onSort={onSort}>Company</SortHeader>
            <SortHeader field="industry" sort={sort} onSort={onSort}>Category</SortHeader>
            <SortHeader field="state" sort={sort} onSort={onSort} className="hidden lg:table-cell">Location</SortHeader>
            <SortHeader field="revenue_usd" sort={sort} onSort={onSort}>Est. revenue</SortHeader>
            <th scope="col" className={TH}>Contact</th>
            <SortHeader field="score" sort={sort} onSort={onSort}>Score</SortHeader>
            <th scope="col" className={TH}>Priority</th>
            <SortHeader field="confidence" sort={sort} onSort={onSort} className="hidden xl:table-cell">Confidence</SortHeader>
            <th scope="col" className={cn(TH, 'hidden 2xl:table-cell')}>Next step</th>
            <th scope="col" className="w-10 px-2 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => {
            const isSelected = selected.has(lead.id)
            return (
              <tr
                key={lead.id}
                onClick={() => onOpen(lead)}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected ? 'bg-accent-soft/60 hover:bg-accent-soft' : 'hover:bg-slate-50',
                  activeId === lead.id && 'shadow-[inset_2px_0_0_var(--color-accent)]',
                )}
              >
                <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                  <Checkbox label={`Select ${lead.company_name}`} checked={isSelected} onChange={() => onToggle(lead.id)} />
                </td>
                <td className="max-w-[240px] px-3 py-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(lead)
                    }}
                    className="block max-w-full truncate rounded text-left font-medium text-ink hover:text-accent hover:underline"
                  >
                    {lead.company_name}
                  </button>
                  <span className="block truncate text-xs text-slate-500">{lead.domain ?? 'No website on record'}</span>
                </td>
                <td className="px-3 py-2 text-slate-700">{lead.industry ?? <span className="text-slate-400">Unknown</span>}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-slate-700 lg:table-cell">{formatLocation(lead)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-slate-700">{formatMoney(lead.revenue_usd)}</td>
                <td className="px-3 py-2">
                  <ContactBadge status={lead.contact_status} />
                </td>
                <td className="px-3 py-2">
                  <ScoreCell qualification={lead.qualification} />
                </td>
                <td className="px-3 py-2">
                  <PriorityBadge priority={lead.qualification.priority} />
                </td>
                <td className="hidden px-3 py-2 xl:table-cell">
                  <ConfidenceCell confidence={lead.confidence} />
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-slate-600 2xl:table-cell">{lead.qualification.next_action}</td>
                <td className="px-2 py-2 text-right">
                  <RowMenu
                    label={`Actions for ${lead.company_name}`}
                    items={[
                      { label: 'View details', icon: <Eye className="size-3.5" aria-hidden />, onSelect: () => onOpen(lead) },
                      {
                        label: isSelected ? 'Deselect' : 'Select',
                        icon: <SquareCheck className="size-3.5" aria-hidden />,
                        onSelect: () => onToggle(lead.id),
                      },
                      { label: 'Export as CSV', icon: <Download className="size-3.5" aria-hidden />, onSelect: () => onExport(lead) },
                    ]}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
