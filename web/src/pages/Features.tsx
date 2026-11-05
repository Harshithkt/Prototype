import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { DateRangePicker } from '@/components/DateRangePicker'
import { FeatureTable } from '@/components/FeatureTable'
import { PageHeader } from '@/components/Layout'
import { EmptyState, ErrorState, Loading, Refetching } from '@/components/States'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useFilters } from '@/lib/filters'

export function Features() {
  const { range } = useFilters()
  const query = useQuery({
    queryKey: ['features', range],
    queryFn: () => api.features(range),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <PageHeader title="Features" description="Which features get used, and how often.">
        <DateRangePicker />
      </PageHeader>
      <Card>
        {query.isPending && <Loading />}
        {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        {query.data?.features.length === 0 && (
          <EmptyState icon={BarChart3} title="No features yet">
            Run npm run seed to load the demo project.
          </EmptyState>
        )}
        {query.data && query.data.features.length > 0 && (
          <Refetching active={query.isPlaceholderData}>
            <FeatureTable features={query.data.features} />
          </Refetching>
        )}
      </Card>
      <p className="mt-3 px-1 text-[13px] text-ink-3">
        Adoption is the share of active human users who used the feature in the period.
      </p>
    </>
  )
}
