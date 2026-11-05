import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ListChecks, Rocket } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BeforeAfterCard } from '@/components/BeforeAfterCard'
import { PageHeader } from '@/components/Layout'
import { ShipDialog } from '@/components/ShipDialog'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { Button, buttonClass } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, type Recommendation } from '@/lib/api'
import { formatDate, titleCase } from '@/lib/utils'

const META_ITEM = 'text-[12.5px] text-ink-3'

function RecommendationRow({
  recommendation: rec,
  onShip,
}: {
  recommendation: Recommendation
  onShip: () => void
}) {
  const client = useQueryClient()
  const approve = useMutation({
    mutationFn: () => api.approve(rec.id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['recommendations'] }),
  })

  return (
    <Card className="animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={rec.status} />
            {rec.feature_name && <span className={META_ITEM}>{rec.feature_name}</span>}
          </div>
          <h2 className="mt-2.5 text-[16px] font-semibold tracking-[-0.015em]">{rec.title}</h2>
          {rec.detail && <p className="mt-1 max-w-2xl text-[14px] text-ink-2">{rec.detail}</p>}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-0.5">
            {rec.question && <span className={META_ITEM}>From “{rec.question}”</span>}
            {rec.shipped_at && (
              <span className={META_ITEM}>
                Shipped {formatDate(rec.shipped_at)} to {titleCase(rec.treated_plan ?? '')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rec.status === 'draft' && (
            <Button variant="primary" onClick={() => approve.mutate()} disabled={approve.isPending}>
              <Check />
              Approve
            </Button>
          )}
          {rec.status === 'approved' && (
            <Button variant="primary" onClick={onShip}>
              <Rocket />
              Ship
            </Button>
          )}
        </div>
      </div>
      {approve.isError && <p className="px-5 pb-4 text-[13px] text-bad-ink">{approve.error.message}</p>}
      {rec.status === 'shipped' && (
        <div className="border-t border-line p-5">
          <BeforeAfterCard id={rec.id} />
        </div>
      )}
    </Card>
  )
}

export function Recommendations() {
  const query = useQuery({ queryKey: ['recommendations'], queryFn: api.recommendations })
  const [shipping, setShipping] = useState<Recommendation | null>(null)

  return (
    <>
      <PageHeader
        title="Recommendations"
        description="Approve a change, ship it, and see whether it helped."
      />
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
      {query.data?.recommendations.length === 0 && (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No recommendations yet"
            action={
              <Link to="/assistant" className={buttonClass({ variant: 'primary' })}>
                Ask the assistant
              </Link>
            }
          >
            Ask the assistant a question, then turn its answer into a recommendation.
          </EmptyState>
        </Card>
      )}
      <div className="space-y-4">
        {query.data?.recommendations.map((recommendation) => (
          <RecommendationRow
            key={recommendation.id}
            recommendation={recommendation}
            onShip={() => setShipping(recommendation)}
          />
        ))}
      </div>
      <ShipDialog recommendation={shipping} onClose={() => setShipping(null)} />
    </>
  )
}
