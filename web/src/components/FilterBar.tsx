import { DateRangePicker } from '@/components/DateRangePicker'
import { Select } from '@/components/ui/select'
import { useFilters, useMeta } from '@/lib/filters'
import { titleCase } from '@/lib/utils'

export function FilterBar({ dates = true }: { dates?: boolean }) {
  const meta = useMeta()
  const { plan, platform, update } = useFilters()
  const options = (values: string[]) => values.map((value) => ({ value, label: titleCase(value) }))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {dates && <DateRangePicker />}
      <Select
        label="Plan"
        allLabel="All plans"
        value={plan}
        options={options(meta.plans)}
        onChange={(value) => update({ plan: value })}
      />
      <Select
        label="Platform"
        allLabel="All platforms"
        value={platform}
        options={options(meta.platforms)}
        onChange={(value) => update({ platform: value })}
      />
    </div>
  )
}
