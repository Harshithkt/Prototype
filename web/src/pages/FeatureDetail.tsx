import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ScatterChart } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { DotPlot, PLAN_COLORS } from '@/components/DotPlot'
import { FilterBar } from '@/components/FilterBar'
import { FunnelChart } from '@/components/FunnelChart'
import { KpiCard } from '@/components/KpiCard'
import { TrendChart } from '@/components/TrendChart'
import { PageHeader } from '@/components/Layout'
import { QueryPopover } from '@/components/QueryPopover'
import { EmptyState, ErrorState, Loading, Refetching } from '@/components/States'
import { Card, CardHeader } from '@/components/ui/card'
import { UserTimelineDrawer } from '@/components/UserTimelineDrawer'
import { api } from '@/lib/api'
import { useFilters, useMeta } from '@/lib/filters'
import { formatCount, formatDay, formatPct, titleCase } from '@/lib/utils'

const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1

export function FeatureDetail() {
  const meta = useMeta()
  const id = Number(useParams().id)
  const { range, plan, platform, params, update } = useFilters()
  const filters = { ...range, plan, platform }
  const selectedUser = params.get('user') ? Number(params.get('user')) : undefined

  const features = useQuery({
    queryKey: ['features', filters],
    queryFn: () => api.features(filters),
    placeholderData: keepPreviousData,
  })
  const feature = features.data?.features.find((f) => f.id === id)
  const isReports = feature?.key === 'reports'

  const funnel = useQuery({
    queryKey: ['funnel', filters],
    queryFn: () => api.funnel(filters),
    enabled: isReports,
    placeholderData: keepPreviousData,
  })
  const trend = useQuery({
    queryKey: ['feature-trend', id, filters],
    queryFn: () => api.featureTrend(id, filters),
    placeholderData: keepPreviousData,
  })
  const dots = useQuery({
    queryKey: ['dotplot', id, filters],
    queryFn: () => api.dotPlot(id, filters),
    placeholderData: keepPreviousData,
  })

  const search = new URLSearchParams(params)
  search.delete('user')

  if (features.isPending) return <Loading className="min-h-[60vh]" />
  if (features.isError) return <ErrorState error={features.error} onRetry={() => features.refetch()} />
  if (!feature) {
    return (
      <EmptyState icon={ScatterChart} title="Feature not found">
        <Link to="/features" className="underline">
          Back to Features
        </Link>
      </EmptyState>
    )
  }

  return (
    <>
      <PageHeader
        title={feature.name}
        back={
          <Link
            to={{ pathname: '/features', search: search.toString() }}
            className="mb-2 -ml-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            Features
          </Link>
        }
      >
        <FilterBar />
      </PageHeader>

      <Refetching active={features.isPlaceholderData}>
        <div className={isReports ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.15fr)]' : 'grid gap-4 sm:grid-cols-2'}>
          <div className={isReports ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-1' : 'contents'}>
            <KpiCard
              label="Adoption"
              value={formatPct(feature.adoptionPct)}
              hint={`${formatCount(feature.usersUsed)} of ${formatCount(feature.usersActive)} active users`}
              queries={feature.queries}
            />
            <KpiCard
              label="Frequency"
              value={formatCount(feature.frequency)}
              hint="events in this period"
              queries={feature.queries}
            />
          </div>
          {isReports &&
            (funnel.data ? (
              <FunnelChart funnel={funnel.data} />
            ) : (
              <Card>
                {funnel.isError ? (
                  <ErrorState error={funnel.error} onRetry={() => funnel.refetch()} />
                ) : (
                  <Loading />
                )}
              </Card>
            ))}
        </div>
      </Refetching>

      <Card className="mt-4">
        <CardHeader
          title="Daily users"
          description={
            trend.data?.anomalies[0]
              ? `${titleCase(trend.data.anomalies[0].direction)} on ${trend.data.anomalies[0].platform}: ${trend.data.anomalies[0].users} users against a usual ${trend.data.anomalies[0].baseline}, compared with the same weekdays before.`
              : `${formatDay(range.from)} – ${formatDay(range.to)}`
          }
          action={trend.data && <QueryPopover queries={trend.data.queries} className="-mr-1.5" />}
        />
        <div className="px-3 pt-3 pb-4">
          {trend.isPending && <Loading className="min-h-[220px]" />}
          {trend.isError && <ErrorState error={trend.error} onRetry={() => trend.refetch()} />}
          {trend.data?.series.length === 0 && (
            <EmptyState icon={ScatterChart} title="No usage in this range">
              Try a wider date range or remove a filter.
            </EmptyState>
          )}
          {trend.data && trend.data.series.length > 0 && (
            <Refetching active={trend.isPlaceholderData}>
              <TrendChart
                height={220}
                seriesLabel="Users"
                data={trend.data.series.map((point) => ({ day: point.day, humans: point.users }))}
                highlights={trend.data.anomalies.map((a) => ({
                  from: a.from,
                  to: a.to,
                  label: `${a.direction === 'drop' ? 'Down' : 'Up'} ${Math.abs(a.changePct)}% on ${a.platform}`,
                }))}
              />
            </Refetching>
          )}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Who uses it, and who stopped"
          description={
            dots.data
              ? `One dot per user. Showing ${formatCount(dots.data.dots.length)} of ${formatCount(dots.data.total)}. Click a dot to read their timeline.`
              : 'One dot per user'
          }
          action={dots.data && <QueryPopover queries={dots.data.queries} className="-mr-1.5" />}
        />
        <div className="flex flex-wrap gap-4 px-5 pt-3">
          {meta.plans.map((value) => (
            <span key={value} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <span className="size-2.5 rounded-full" style={{ background: PLAN_COLORS[value] }} />
              {titleCase(value)}
            </span>
          ))}
        </div>
        <div className="px-4 pt-1 pb-3">
          {dots.isPending && <Loading className="min-h-[420px]" />}
          {dots.isError && <ErrorState error={dots.error} onRetry={() => dots.refetch()} />}
          {dots.data?.dots.length === 0 && (
            <EmptyState icon={ScatterChart} title="No users match these filters">
              Try a wider date range or remove a filter.
            </EmptyState>
          )}
          {dots.data && dots.data.dots.length > 0 && (
            <Refetching active={dots.isPlaceholderData}>
              <DotPlot
                dots={dots.data.dots}
                rangeDays={dayCount(range.from, range.to)}
                selectedUser={selectedUser}
                onSelect={(user) => update({ user: String(user) })}
              />
            </Refetching>
          )}
        </div>
      </Card>

      <UserTimelineDrawer userId={selectedUser} onClose={() => update({ user: undefined })} />
    </>
  )
}
