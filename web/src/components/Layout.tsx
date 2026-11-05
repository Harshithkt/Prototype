import {
  BarChart3,
  Building2,
  Compass,
  Gauge,
  ListChecks,
  MessageSquareText,
  Moon,
  Repeat,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { DemoGuide } from '@/components/DemoGuide'
import { useMeta } from '@/lib/filters'
import { cn, formatDate } from '@/lib/utils'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: Gauge, end: true },
  { to: '/features', label: 'Features', icon: BarChart3 },
  { to: '/retention', label: 'Retention', icon: Repeat },
  { to: '/accounts', label: 'Accounts', icon: Building2 },
  { to: '/assistant', label: 'Assistant', icon: MessageSquareText },
  { to: '/recommendations', label: 'Recommendations', icon: ListChecks },
]

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--primary)" />
        <circle cx="10" cy="21" r="3" fill="var(--primary-ink)" />
        <circle cx="16.5" cy="14" r="3" fill="var(--primary-ink)" />
        <circle cx="23" cy="10" r="3" fill="#6da7ec" />
      </svg>
      <span className="text-[14.5px] font-semibold tracking-[-0.015em]">Behavior Analytics</span>
    </span>
  )
}

function useTheme() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'light')
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    if (next === 'dark') document.documentElement.dataset.theme = 'dark'
    else delete document.documentElement.dataset.theme
    try {
      localStorage.setItem('theme', next)
    } catch {
      // Theme still applies for this visit.
    }
    setTheme(next)
  }
  return { theme, toggle }
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors',
    isActive ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  )

export function Layout() {
  const meta = useMeta()
  const { theme, toggle } = useTheme()
  const [guideOpen, setGuideOpen] = useState(false)
  const ThemeIcon = theme === 'dark' ? Sun : Moon

  return (
    <div className="min-h-screen md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <div className="px-2.5 pt-0.5 pb-5">
          <Logo />
        </div>
        <nav className="space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <button
            onClick={() => setGuideOpen(true)}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Compass className="size-4" />
            Demo script
          </button>
          <div className="rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="flex items-center justify-between text-[12.5px] font-semibold">
              Synthetic demo data
              <button
                onClick={toggle}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                className="rounded p-0.5 text-ink-3 transition-colors hover:text-ink"
              >
                <ThemeIcon className="size-3.5" />
              </button>
            </p>
            <p className="mt-0.5 text-[12px] text-ink-3">Through {formatDate(meta.dataEnd)}</p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-line bg-surface md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <Logo />
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold">Synthetic data</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-w-0">
        <div className="mx-auto max-w-[1160px] px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </div>
      </main>
      <DemoGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  )
}

export function PageHeader({
  title,
  description,
  children,
  back,
}: {
  title: string
  description?: string
  children?: ReactNode
  back?: ReactNode
}) {
  return (
    <div className="mb-6">
      {back}
      <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.025em]">{title}</h1>
      {description && <p className="mt-1 text-[14.5px] text-ink-2">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
