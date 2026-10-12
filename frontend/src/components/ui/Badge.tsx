import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type Tone = 'neutral' | 'accent' | 'positive' | 'warning' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  accent: 'bg-accent-soft text-indigo-800 ring-indigo-200',
  positive: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
}

interface BadgeProps {
  tone?: Tone
  icon?: ReactNode
  title?: string
  className?: string
  children: ReactNode
}

/** Status is always carried by the text (and usually an icon), never colour alone. */
export function Badge({ tone = 'neutral', icon, title, className, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        title && 'cursor-help',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
