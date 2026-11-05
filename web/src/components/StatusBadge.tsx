import { Check, CircleDashed, Rocket, type LucideIcon } from 'lucide-react'
import type { RecommendationStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

const STATUS: Record<RecommendationStatus, { label: string; icon: LucideIcon; className: string }> = {
  draft: { label: 'Draft', icon: CircleDashed, className: 'bg-surface-2 text-ink-2' },
  approved: { label: 'Approved', icon: Check, className: 'bg-accent-wash text-accent' },
  shipped: { label: 'Shipped', icon: Rocket, className: 'bg-good-wash text-good-ink' },
}

export function StatusBadge({ status }: { status: RecommendationStatus }) {
  const { label, icon: Icon, className } = STATUS[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-semibold',
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} />
      {label}
    </span>
  )
}
