import { FlaskConical, Layers, Mail, Menu, Search, Sparkles, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../../lib/cn'

interface NavItem {
  to: string
  label: string
  step?: number
  icon: ReactNode
}

// The first three items are the pipeline, in the order a user works through it.
const NAV: NavItem[] = [
  { to: '/leads', label: 'Find Leads', step: 1, icon: <Search className="size-4" aria-hidden /> },
  { to: '/enrichment', label: 'Enrichment', step: 2, icon: <Sparkles className="size-4" aria-hidden /> },
  { to: '/outreach', label: 'Outreach', step: 3, icon: <Mail className="size-4" aria-hidden /> },
]
const LIBRARY: NavItem[] = [{ to: '/snapshots', label: 'Snapshots', icon: <Layers className="size-4" aria-hidden /> }]

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )
            }
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.step && <span className="tabular text-[11px] text-slate-500">{item.step}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-md bg-indigo-500 text-sm font-bold text-white" aria-hidden>
        B
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">Boosta</p>
        <p className="text-[11px] text-slate-400">Lead intelligence</p>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
        <div>
          <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">Workflow</p>
          <NavList items={NAV} onNavigate={onNavigate} />
        </div>
        <div>
          <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">Library</p>
          <NavList items={LIBRARY} onNavigate={onNavigate} />
        </div>
      </nav>
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-start gap-2 rounded-md bg-white/5 px-2.5 py-2 text-[11px] leading-snug text-slate-300">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden />
          <p>
            <span className="font-semibold text-white">Demo workspace.</span> All companies and contacts are synthetic.
            Nothing is verified and no email is sent.
          </p>
        </div>
      </div>
    </>
  )
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-52 shrink-0 flex-col bg-slate-900 md:flex">
        <div className="px-4 py-4">
          <Brand />
        </div>
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-2.5 md:hidden">
        <Brand />
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-md p-1.5 text-slate-200 hover:bg-white/10"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      {menuOpen && (
        <div className="flex flex-col bg-slate-900 md:hidden">
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </div>
      )}

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
