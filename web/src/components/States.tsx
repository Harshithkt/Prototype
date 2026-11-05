import { AlertTriangle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Loading({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      className={cn('flex min-h-[200px] items-center justify-center gap-1.5', className)}
    >
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-ink-3"
          style={{ animation: `pulse-dot 1.1s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangle className="size-5 text-bad-ink" />
      <p className="max-w-sm text-[13.5px] text-ink-2">
        {error instanceof Error ? error.message : 'Something went wrong.'}
      </p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-1.5 px-6 py-10 text-center">
      <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
        <Icon className="size-5" />
      </span>
      <p className="text-[14px] font-semibold">{title}</p>
      {children && <p className="max-w-sm text-[13.5px] text-ink-2">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/** Holds the previous render while new data loads, with no layout jump. */
export function Refetching({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className={cn('transition-opacity', active && 'opacity-50')}>{children}</div>
}
