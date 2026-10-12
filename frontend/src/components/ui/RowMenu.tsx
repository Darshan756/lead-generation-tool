import { MoreHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import { cn } from '../../lib/cn'
import { IconButton } from './Button'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/** "More actions" menu for a table row. Positioned with fixed coordinates so
 * a scrolling table container cannot clip it. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setPosition(null), [])
  useDismiss(ref, position !== null, close)

  useEffect(() => {
    if (!position) return
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [position, close])

  const toggle = () => {
    if (position) return close()
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }

  return (
    <div ref={ref} className="inline-block" onClick={(event) => event.stopPropagation()}>
      <IconButton label={label} aria-haspopup="menu" aria-expanded={position !== null} onClick={toggle}>
        <MoreHorizontal className="size-4" />
      </IconButton>
      {position && (
        <div role="menu" style={position} className="fixed z-50 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close()
                item.onSelect()
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] disabled:cursor-not-allowed disabled:text-slate-300',
                item.danger ? 'text-red-700 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
