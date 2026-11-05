import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FileText, Gauge } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { DateRangePicker } from '@/components/DateRangePicker'
import { KpiCard } from '@/components/KpiCard'
import { Priorities } from '@/components/Priorities'
import { PageHeader } from '@/components/Layout'
import { QueryPopover } from '@/components/QueryPopover'
import { EmptyState, ErrorState, Loading, Refetching } from '@/components/States'
import { TrendChart } from '@/components/TrendChart'
import { buttonClass } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { useFilters } from '@/lib/filters'
import { formatCount, formatDay } from '@/lib/utils'

export function Overview() {
  const { range, params, update } = useFilters()
  const includeNonHuman = params.get('agents') === '1'

  const humans = useQuery({
    queryKey: ['active-users', range, false],
    queryFn: () => api.activeUsers(range, false),
    placeholderData: keepPreviousData,
  })
  const everyone = useQuery({
    queryKey: ['active-users', range, true],
    queryFn: () => api.activeUsers(range, true),
    enabled: includeNonHuman,
    placeholderData: keepPreviousData,
  })

  const shown = includeNonHuman ? everyone.data : humans.data
  const trend = useMemo(() => {
    const all = new Map(everyone.data?.series.map((point) => [point.day, point.dau]))
    return (humans.data?.series ?? []).map((point) => ({
      day: point.day,
      humans: point.dau,
      all: includeNonHuman ? all.get(point.day) : undefined,
    }))
  }, [humans.data, everyone.data, includeNonHuman])

  const compare = (value: number, human: number | undefined) =>
    includeNonHuman && human ? `+${formatCount(value - human)} over ${formatCount(human)} humans` : 'Humans only'

  return (
    <>
      <PageHeader title="Overview" description="Who is active, and how that is changing.">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DateRangePicker />
          <Switch
            checked={includeNonHuman}
            onCheckedChange={(checked) => update({ agents: checked ? '1' : undefined })}
            label="Include agent and bot traffic"
          />
          <Link
            to={`/assistant?ask=${encodeURIComponent("Give me this week's brief")}`}
            className={`${buttonClass({})} sm:ml-auto`}
          >
            <FileText />
            Weekly brief
          </Link>
        </div>
      </PageHeader>

      {humans.isError && (
        <Card>
          <ErrorState error={humans.error} onRetry={() => humans.refetch()} />
        </Card>
      )}
      {humans.isPending && (
        <Card>
          <Loading className="min-h-[420px]" />
        </Card>
      )}
      {shown && humans.data && (
        <Refetching active={humans.isPlaceholderData || (includeNonHuman && everyone.isFetching)}>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label={`Daily active users, ${formatDay(shown.asOf)}`}
              value={formatCount(shown.dau)}
              hint={compare(shown.dau, humans.data.dau)}
              queries={shown.queries.slice(0, 1)}
            />
            <KpiCard
              label="Weekly active users"
              value={formatCount(shown.wau)}
              hint={compare(shown.wau, humans.data.wau)}
              queries={shown.queries.slice(1, 2)}
            />
            <KpiCard
              label="Monthly active users"
              value={formatCount(shown.mau)}
              hint={compare(shown.mau, humans.data.mau)}
              queries={shown.queries.slice(2, 3)}
            />
          </div>
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader
              title="Daily active users"
              description={`${formatDay(range.from)} – ${formatDay(range.to)}`}
              action={<QueryPopover queries={shown.queries.slice(0, 1)} className="-mr-1.5" />}
            />
            <div className="px-3 pt-3 pb-4">
              {trend.length > 0 ? (
                <TrendChart data={trend} height={392} />
              ) : (
                <EmptyState icon={Gauge} title="No activity in this range">
                  Pick a wider date range.
                </EmptyState>
              )}
            </div>
          </Card>
          <Priorities range={range} />
          </div>
        </Refetching>
      )}
    </>
  )
}
