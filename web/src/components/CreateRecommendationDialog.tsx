import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { api, type Insight } from '@/lib/api'
import { useFilters } from '@/lib/filters'

export const fieldClass =
  'mt-1 w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-[14px] outline-none focus:border-ink-3'

export function CreateRecommendationDialog({
  insight,
  onClose,
}: {
  insight: Insight | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const { range } = useFilters()
  const features = useQuery({
    queryKey: ['features', range],
    queryFn: () => api.features(range),
    enabled: insight !== null,
  })
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [featureKey, setFeatureKey] = useState('reports')

  useEffect(() => {
    if (!insight) return
    setTitle(insight.suggestion?.title ?? '')
    setDetail(insight.suggestion?.detail ?? '')
    setFeatureKey(insight.suggestion?.feature ?? 'reports')
  }, [insight])

  const create = useMutation({
    mutationFn: () => {
      const feature = features.data?.features.find((f) => f.key === featureKey)
      return api.createRecommendation({
        insightId: insight!.id,
        featureId: feature!.id,
        title,
        detail: detail || undefined,
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recommendations'] })
      onClose()
      navigate('/recommendations')
    },
  })

  return (
    <Dialog
      open={insight !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Create recommendation"
      description="It starts as a draft. Nothing ships until someone approves it."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <label className="block text-[13px] font-medium text-ink-2">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            minLength={3}
            className={fieldClass}
          />
        </label>
        <label className="block text-[13px] font-medium text-ink-2">
          Detail
          <textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={3}
            className={`${fieldClass} resize-none`}
          />
        </label>
        <div className="text-[13px] font-medium text-ink-2">
          <div className="mb-1">Feature</div>
          <Select
            label="Feature"
            value={featureKey}
            onChange={(value) => value && setFeatureKey(value)}
            className="w-full"
            options={(features.data?.features ?? []).map((f) => ({ value: f.key, label: f.name }))}
          />
        </div>
        {create.isError && <p className="text-[13px] text-bad-ink">{create.error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={create.isPending || !features.data}>
            Create draft
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
