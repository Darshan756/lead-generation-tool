import { useEffect, useRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean
  label: string
  /** Show the label next to the box instead of only to screen readers. */
  showLabel?: boolean
}

export function Checkbox({ indeterminate = false, label, showLabel = false, className, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  const box = (
    <input
      ref={ref}
      type="checkbox"
      aria-label={showLabel ? undefined : label}
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded border-slate-300 accent-indigo-700 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  )
  if (!showLabel) return box
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
      {box}
      <span>{label}</span>
    </label>
  )
}
