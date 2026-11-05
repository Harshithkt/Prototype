import * as Radix from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

type Option = { value: string; label: string }

const ALL = '__all__'

export function Select({
  value,
  onChange,
  options,
  allLabel,
  label,
  className = 'min-w-[132px]',
}: {
  value: string | undefined
  onChange: (value: string | undefined) => void
  options: Option[]
  allLabel?: string
  label: string
  className?: string
}) {
  const items = allLabel ? [{ value: ALL, label: allLabel }, ...options] : options
  return (
    <Radix.Root
      value={value ?? (allLabel ? ALL : undefined)}
      onValueChange={(next) => onChange(next === ALL ? undefined : next)}
    >
      <Radix.Trigger
        aria-label={label}
        className={`inline-flex h-9 items-center justify-between gap-2 rounded-lg border border-line-2 bg-surface px-3 text-[13.5px] font-medium shadow-card transition-colors hover:bg-surface-2 ${className}`}
      >
        <Radix.Value />
        <Radix.Icon>
          <ChevronDown className="size-3.5 text-ink-3" />
        </Radix.Icon>
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          position="popper"
          sideOffset={6}
          className="animate-rise z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-float"
        >
          <Radix.Viewport>
            {items.map((item) => (
              <Radix.Item
                key={item.value}
                value={item.value}
                className="relative flex h-8.5 cursor-pointer items-center rounded-md pr-8 pl-2.5 text-[13.5px] outline-none data-[highlighted]:bg-surface-2"
              >
                <Radix.ItemText>{item.label}</Radix.ItemText>
                <Radix.ItemIndicator className="absolute right-2">
                  <Check className="size-4" strokeWidth={2.5} />
                </Radix.ItemIndicator>
              </Radix.Item>
            ))}
          </Radix.Viewport>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
