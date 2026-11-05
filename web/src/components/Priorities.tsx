import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Filter,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { QueryPopover } from '@/components/QueryPopover'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Card, CardHeader } from '@/components/ui/card'
import { api, type Priority, type Range } from '@/lib/api'
import { cn } from '@/lib/utils'

const KINDS: Record<Priority['kind'], { label: string; icon: LucideIcon; className: string }> = {
  incident: { label: 'Usage drop', icon: AlertTriangle, className: 'bg-bad-wash text-bad-ink' },
  funnel: { label: 'Drop-off', icon: Filter, className: 'bg-surface-2 text-ink-2' },
  adoption: { label: 'Adoption gap', icon: Users, className: 'bg-surface-2 text-ink-2' },
  accounts: { label: 'Accounts', icon: Building2, className: 'bg-warn-wash text-warn-ink' },
}

function Item({ item, rank }: { item: Priority; rank: number }) {
  const { label, icon: Icon, className } = KINDS[item.kind]
  return (
    <li className="border-t border-line px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className={cn('inline-flex h-5.5 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-semibold', className)}>
          <Icon className="size-3" strokeWidth={2.5} />
          {label}
        </span>
        <span className="text-[12px] text-ink-3 tabular-nums">#{rank}</span>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-[1.4] font-semibold">{item.title}</p>
      <p className="mt-0.5 text-[13px] text-ink-3">{item.detail}</p>
      <div className="mt-1.5 -ml-1.5 flex flex-wrap items-center gap-x-1">
        <Link
          to={item.href}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Investigate
          <ArrowRight className="size-3" />
        </Link>
        <Link
          to={`/assistant?ask=${encodeURIComponent(item.question)}`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Sparkles className="size-3" />
          Ask
        </Link>
        <QueryPopover queries={item.queries} label="Query" />
      </div>
    </li>
  )
}

export function Priorities({ range }: { range: Range }) {
  const query = useQuery({ queryKey: ['priorities', range], queryFn: () => api.priorities(range) })
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="What to fix first"
        description="Live drops first, then by users affected"
      />
      <div className="mt-3">
        {query.isPending && <Loading className="min-h-[320px]" />}
        {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        {query.data?.items.length === 0 && (
          <EmptyState icon={CheckCircle2} title="Nothing stands out">
            No drops, drop-offs or at-risk accounts in this range.
          </EmptyState>
        )}
        {query.data && query.data.items.length > 0 && (
          <ol>
            {query.data.items.slice(0, 4).map((item, index) => (
              <Item key={item.id} item={item} rank={index + 1} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  )
}
