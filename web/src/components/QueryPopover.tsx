import * as Popover from '@radix-ui/react-popover'
import { Check, Code2, Copy } from 'lucide-react'
import { useState } from 'react'
import type { QueryInfo } from '@/lib/api'
import { cn } from '@/lib/utils'

function QueryBlock({ query }: { query: QueryInfo }) {
  const [copied, setCopied] = useState(false)
  const title = query.function ?? query.name
  const copy = async () => {
    await navigator.clipboard.writeText(query.sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-semibold">{title}</span>
        <button
          onClick={copy}
          aria-label="Copy SQL"
          className="rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11.5px] leading-[1.6] text-ink-2">
        {query.sql}
      </pre>
      <p className="mt-1.5 font-mono text-[11px] break-all text-ink-3">
        params {JSON.stringify(query.params)}
      </p>
    </div>
  )
}

export function QueryPopover({
  queries,
  label = 'View query',
  className,
}: {
  queries: QueryInfo[]
  label?: string
  className?: string
}) {
  if (queries.length === 0) return null
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2 data-[state=open]:text-ink',
          className,
        )}
      >
        <Code2 className="size-3.5" />
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="animate-rise z-50 max-h-[70vh] w-[min(560px,calc(100vw-32px))] space-y-4 overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-float"
        >
          {queries.map((query, index) => (
            <QueryBlock key={query.id ?? `${query.name}-${index}`} query={query} />
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
