import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Repeat } from 'lucide-react'
import { FilterBar } from '@/components/FilterBar'
import { KpiCard } from '@/components/KpiCard'
import { PageHeader } from '@/components/Layout'
import { QueryPopover } from '@/components/QueryPopover'
import { EmptyState, ErrorState, Loading, Refetching } from '@/components/States'
import { Card, CardHeader } from '@/components/ui/card'
import { api, type Retention as RetentionData } from '@/lib/api'
import { useFilters } from '@/lib/filters'
import { formatCount, formatDay, formatPct } from '@/lib/utils'

// One hue, kept light enough that body text stays readable on every step in both themes.
const MAX_MIX = 65
const shade = (pct: number) =>
  `color-mix(in srgb, var(--series-1) ${(pct * MAX_MIX) / 100}%, var(--surface))`

function Cell({ pct, title }: { pct: number | null | undefined; title?: string }) {
  if (pct === null || pct === undefined) return <td />
  return (
    <td title={title} className="p-0.5">
      <div
        className="flex h-9 items-center justify-center rounded-md text-[12.5px] font-medium tabular-nums"
        style={{ background: shade(pct) }}
      >
        {Math.round(pct)}%
      </div>
    </td>
  )
}

function Grid({ data }: { data: RetentionData }) {
  const weeks = Array.from({ length: data.weeks - 1 }, (_, index) => index + 1)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="text-[12.5px] text-ink-3">
            <th className="py-2 pr-4 text-left font-medium">Started</th>
            <th className="py-2 pr-4 text-right font-medium">Users</th>
            {weeks.map((week) => (
              <th key={week} className="py-2 text-center font-medium">
                Week {week}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1 pr-4 text-[13.5px] font-semibold">All cohorts</td>
            <td className="py-1 pr-4 text-right text-[13.5px] font-semibold tabular-nums">
              {formatCount(data.cohorts.reduce((sum, cohort) => sum + cohort.size, 0))}
            </td>
            {weeks.map((week) => (
              <Cell key={week} pct={data.averages.find((a) => a.weeksLater === week)?.pct} />
            ))}
          </tr>
          {data.cohorts.map((cohort) => (
            <tr key={cohort.cohort}>
              <td className="py-1 pr-4 text-[13.5px] whitespace-nowrap">{formatDay(cohort.start)}</td>
              <td className="py-1 pr-4 text-right text-[13.5px] tabular-nums">{formatCount(cohort.size)}</td>
              {weeks.map((week) => {
                const cell = cohort.cells.find((c) => c.weeksLater === week)
                const open = cohort.cohort + week < data.weeks
                return (
                  <Cell
                    key={week}
                    pct={open ? (cell?.pct ?? 0) : null}
                    title={open ? `${cell?.users ?? 0} of ${cohort.size} users` : undefined}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Retention() {
  const { plan, platform } = useFilters()
  const query = useQuery({
    queryKey: ['retention', plan, platform],
    queryFn: () => api.retention({ plan, platform }),
    placeholderData: keepPreviousData,
  })
  const data = query.data
  const average = (week: number) => data?.averages.find((a) => a.weeksLater === week)?.pct ?? null
  const last = data ? data.weeks - 1 : 0

  return (
    <>
      <PageHeader title="Retention" description="Of the people who started each week, how many kept coming back.">
        <FilterBar dates={false} />
      </PageHeader>
      {query.isPending && (
        <Card>
          <Loading />
        </Card>
      )}
      {query.isError && (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      )}
      {data?.cohorts.length === 0 && (
        <Card>
          <EmptyState icon={Repeat} title="No users match these filters">
            Try another plan or platform.
          </EmptyState>
        </Card>
      )}
      {data && data.cohorts.length > 0 && (
        <Refetching active={query.isPlaceholderData}>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Back after 1 week" value={formatPct(average(1))} hint="All cohorts" queries={data.queries} />
            <KpiCard label="Back after 4 weeks" value={formatPct(average(4))} hint="All cohorts" queries={data.queries} />
            <KpiCard label={`Back after ${last} weeks`} value={formatPct(average(last))} hint="Oldest cohort" queries={data.queries} />
          </div>
          <Card className="mt-4">
            <CardHeader
              title="Weekly cohorts"
              description="Human users with a qualifying event in each week after they started"
              action={<QueryPopover queries={data.queries} className="-mr-1.5" />}
            />
            <div className="px-5 pt-2 pb-4">
              <Grid data={data} />
            </div>
          </Card>
        </Refetching>
      )}
    </>
  )
}
