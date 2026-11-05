import * as Popover from '@radix-ui/react-popover'
import { Calendar, Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useFilters, useMeta } from '@/lib/filters'
import { addDays, formatDay } from '@/lib/utils'

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'All 60 days', days: 60 },
]

export function DateRangePicker() {
  const meta = useMeta()
  const { range, update } = useFilters()
  const [open, setOpen] = useState(false)

  const active = PRESETS.find(
    (preset) => range.to === meta.dataEnd && range.from === addDays(meta.dataEnd, 1 - preset.days),
  )
  const inputClass =
    'h-8.5 w-full rounded-md border border-line-2 bg-surface px-2 text-[13px] [color-scheme:inherit]'

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-2 bg-surface px-3 text-[13.5px] font-medium shadow-card transition-colors hover:bg-surface-2">
        <Calendar className="size-3.5 text-ink-3" />
        {active?.label ?? `${formatDay(range.from)} – ${formatDay(range.to)}`}
        <ChevronDown className="size-3.5 text-ink-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="animate-rise z-50 w-64 rounded-xl border border-line bg-surface p-1 shadow-float"
        >
          {PRESETS.map((preset) => (
            <button
              key={preset.days}
              onClick={() => {
                update({ from: addDays(meta.dataEnd, 1 - preset.days), to: meta.dataEnd })
                setOpen(false)
              }}
              className="flex h-8.5 w-full items-center justify-between rounded-md px-2.5 text-[13.5px] hover:bg-surface-2"
            >
              {preset.label}
              {active?.days === preset.days && <Check className="size-4" strokeWidth={2.5} />}
            </button>
          ))}
          <div className="mt-1 grid grid-cols-2 gap-2 border-t border-line p-2">
            <label className="text-[12px] text-ink-3">
              From
              <input
                type="date"
                className={inputClass}
                value={range.from}
                min={meta.dataStart}
                max={range.to}
                onChange={(e) => e.target.value && update({ from: e.target.value })}
              />
            </label>
            <label className="text-[12px] text-ink-3">
              To
              <input
                type="date"
                className={inputClass}
                value={range.to}
                min={range.from}
                max={meta.dataEnd}
                onChange={(e) => e.target.value && update({ to: e.target.value })}
              />
            </label>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
