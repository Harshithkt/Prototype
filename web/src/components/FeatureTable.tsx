import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { QueryPopover } from '@/components/QueryPopover'
import type { Feature } from '@/lib/api'
import { useFilters } from '@/lib/filters'
import { cn, formatCount, formatPct } from '@/lib/utils'

type SortKey = 'name' | 'adoptionPct' | 'usersUsed' | 'frequency'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Feature' },
  { key: 'adoptionPct', label: 'Adoption' },
  { key: 'usersUsed', label: 'Users', numeric: true },
  { key: 'frequency', label: 'Frequency (events)', numeric: true },
]

export function FeatureTable({ features }: { features: Feature[] }) {
  const navigate = useNavigate()
  const { params, update } = useFilters()
  const sort = (params.get('sort') ?? 'adoptionPct') as SortKey
  const direction = params.get('dir') === 'asc' ? 'asc' : 'desc'

  const sorted = useMemo(() => {
    const factor = direction === 'asc' ? 1 : -1
    return [...features].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name) * factor
      return ((a[sort] ?? -1) - (b[sort] ?? -1)) * factor
    })
  }, [features, sort, direction])

  const toggle = (key: SortKey) =>
    update({
      sort: key,
      dir: key === sort ? (direction === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc',
    })

  const search = params.toString()

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                aria-sort={
                  sort === column.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className={cn('px-5 py-2.5 font-medium', column.numeric && 'text-right')}
              >
                <button
                  onClick={() => toggle(column.key)}
                  className={cn(
                    'inline-flex items-center gap-1 text-[12.5px] transition-colors hover:text-ink',
                    sort === column.key ? 'text-ink' : 'text-ink-3',
                  )}
                >
                  {column.label}
                  {sort === column.key &&
                    (direction === 'asc' ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    ))}
                </button>
              </th>
            ))}
            <th className="w-32" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((feature) => (
            <tr
              key={feature.id}
              onClick={() => navigate({ pathname: `/features/${feature.id}`, search })}
              className="group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2/60"
            >
              <td className="px-5 py-3.5 text-[14px] font-medium">{feature.name}</td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-12 text-[13.5px] font-medium tabular-nums">
                    {formatPct(feature.adoptionPct)}
                  </span>
                  <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full bg-[var(--series-1)]"
                      style={{ width: `${feature.adoptionPct ?? 0}%` }}
                    />
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right text-[13.5px] tabular-nums">
                {formatCount(feature.usersUsed)}
                <span className="text-ink-3"> of {formatCount(feature.usersActive)}</span>
              </td>
              <td className="px-5 py-3.5 text-right text-[13.5px] tabular-nums">
                {formatCount(feature.frequency)}
              </td>
              <td className="pr-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <QueryPopover queries={feature.queries} label="Query" />
                <ChevronRight className="ml-1 inline size-4 text-ink-3 transition-transform group-hover:translate-x-0.5" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
