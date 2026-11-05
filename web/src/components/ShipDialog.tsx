import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fieldClass } from '@/components/CreateRecommendationDialog'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { api, type Recommendation } from '@/lib/api'
import { useMeta } from '@/lib/filters'
import { titleCase } from '@/lib/utils'

export function ShipDialog({
  recommendation,
  onClose,
}: {
  recommendation: Recommendation | null
  onClose: () => void
}) {
  const meta = useMeta()
  const client = useQueryClient()
  const [shippedOn, setShippedOn] = useState(meta.shipDate)
  const [treatedPlan, setTreatedPlan] = useState('pro')

  useEffect(() => {
    if (recommendation) setShippedOn(meta.shipDate)
  }, [recommendation, meta.shipDate])

  const ship = useMutation({
    mutationFn: () => api.ship(recommendation!.id, { shippedOn, treatedPlan }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recommendations'] })
      onClose()
    },
  })

  return (
    <Dialog
      open={recommendation !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Ship recommendation"
      description="Record when it went live and which plan received it first. Everyone else is the control group."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          ship.mutate()
        }}
      >
        <label className="block text-[13px] font-medium text-ink-2">
          Ship date
          <input
            type="date"
            value={shippedOn}
            min={meta.dataStart}
            max={meta.dataEnd}
            required
            onChange={(event) => setShippedOn(event.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="text-[13px] font-medium text-ink-2">
          <div className="mb-1">Treated plan</div>
          <Select
            label="Treated plan"
            value={treatedPlan}
            onChange={(value) => value && setTreatedPlan(value)}
            className="w-full"
            options={meta.plans.map((plan) => ({ value: plan, label: titleCase(plan) }))}
          />
        </div>
        {ship.isError && <p className="text-[13px] text-bad-ink">{ship.error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={ship.isPending}>
            Ship
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
