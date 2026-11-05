import type { ReactNode } from 'react'
import { QueryPopover } from '@/components/QueryPopover'
import { Card } from '@/components/ui/card'
import type { QueryInfo } from '@/lib/api'

export function KpiCard({
  label,
  value,
  hint,
  queries,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  queries: QueryInfo[]
}) {
  return (
    <Card className="px-5 pt-4 pb-4.5">
      <div className="flex h-6 items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        <QueryPopover queries={queries} label="Query" className="-mr-1.5" />
      </div>
      <div className="mt-2 text-[34px] leading-none font-semibold tracking-[-0.03em]">{value}</div>
      {hint && <div className="mt-2.5 min-h-5 text-[13px] text-ink-3">{hint}</div>}
    </Card>
  )
}
