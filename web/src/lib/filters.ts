import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type Meta } from './api'
import { addDays } from './utils'

export function useMeta() {
  const { data } = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity })
  return data as Meta // App holds rendering until this has loaded.
}

/** Filters live in the URL so any view can be shared as a link. */
export function useFilters() {
  const meta = useMeta()
  const [params, setParams] = useSearchParams()

  const to = params.get('to') ?? meta.dataEnd
  const from = params.get('from') ?? addDays(meta.dataEnd, -29)
  const plan = params.get('plan') ?? undefined
  const platform = params.get('platform') ?? undefined

  const update = useCallback(
    (changes: Record<string, string | undefined | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const range = useMemo(() => ({ from, to }), [from, to])
  return { range, plan, platform, params, update }
}
