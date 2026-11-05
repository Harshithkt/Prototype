import * as Radix from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}

const Overlay = () => <Radix.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]" />

export function Dialog({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Portal>
        <Overlay />
        <Radix.Content
          className="animate-rise fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-float"
        >
          <Radix.Title className="text-[16px] font-semibold tracking-[-0.015em]">{title}</Radix.Title>
          {description ? (
            <Radix.Description className="mt-1 text-[13.5px] text-ink-2">{description}</Radix.Description>
          ) : (
            <Radix.Description className="sr-only">{title}</Radix.Description>
          )}
          <div className="mt-5">{children}</div>
          <CloseButton className="absolute top-4 right-4" />
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}

function CloseButton({ className }: { className?: string }) {
  return (
    <Radix.Close
      aria-label="Close"
      className={cn(
        'rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      <X className="size-4" />
    </Radix.Close>
  )
}

export function Sheet({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Portal>
        <Overlay />
        <Radix.Content className="animate-sheet fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-float">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div className="min-w-0">
              <Radix.Title className="text-[16px] font-semibold tracking-[-0.015em]">{title}</Radix.Title>
              {description ? (
                <Radix.Description asChild>
                  <div className="mt-1 text-[13px] text-ink-2">{description}</div>
                </Radix.Description>
              ) : (
                <Radix.Description className="sr-only">{title}</Radix.Description>
              )}
            </div>
            <CloseButton className="-mt-0.5 -mr-1" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
