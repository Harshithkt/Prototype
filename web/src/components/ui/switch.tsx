import * as Radix from '@radix-ui/react-switch'

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="inline-flex h-9 cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-ink-2">
      <Radix.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="h-5 w-8.5 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent"
      >
        <Radix.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4" />
      </Radix.Root>
      {label}
    </label>
  )
}
