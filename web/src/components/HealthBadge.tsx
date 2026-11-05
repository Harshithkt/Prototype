import { AlertTriangle, CheckCircle2, Eye, type LucideIcon } from 'lucide-react'
import type { Health } from '@/lib/api'
import { cn } from '@/lib/utils'

export const HEALTH: Record<Health, { label: string; icon: LucideIcon; className: string }> = {
  at_risk: { label: 'At risk', icon: AlertTriangle, className: 'bg-bad-wash text-bad-ink' },
  watch: { label: 'Watch', icon: Eye, className: 'bg-warn-wash text-warn-ink' },
  healthy: { label: 'Healthy', icon: CheckCircle2, className: 'bg-good-wash text-good-ink' },
}

export function HealthBadge({ health }: { health: Health }) {
  const { label, icon: Icon, className } = HEALTH[health]
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-semibold', className)}>
      <Icon className="size-3.5" strokeWidth={2.25} />
      {label}
    </span>
  )
}
