import { ArrowUp } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InsightCard } from '@/components/InsightCard'
import { CreateRecommendationDialog } from '@/components/CreateRecommendationDialog'
import { Loading } from '@/components/States'
import { useMeta } from '@/lib/filters'
import { useConversation, type Turn } from '@/lib/conversation'
import type { Insight } from '@/lib/api'
import { cn } from '@/lib/utils'

const DEMO_QUESTION = "Why aren't users exporting reports?"
const BRIEF_QUESTION = "Give me this week's brief"
const LIVE_SUGGESTIONS = [
  DEMO_QUESTION,
  BRIEF_QUESTION,
  'Which accounts are at risk?',
  'How is retention holding up?',
  'How did active users trend over the last 30 days?',
]

function TurnView({ turn, onCreate }: { turn: Turn; onCreate: (insight: Insight) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <p className="animate-rise max-w-[80%] rounded-2xl rounded-br-md bg-surface-3 px-4 py-2 text-[14px]">
          {turn.question}
        </p>
      </div>
      {turn.status === 'pending' && (
        <div className="flex items-center gap-3 px-1 text-[13px] text-ink-3">
          <Loading className="min-h-0" label="Thinking" />
          Running approved analytics functions
        </div>
      )}
      {turn.status === 'error' && (
        <p className="animate-rise rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px] text-ink-2">
          {turn.error}
        </p>
      )}
      {turn.insight?.notice && <p className="px-1 text-[13px] text-ink-3">{turn.insight.notice}</p>}
      {turn.insight && (
        <InsightCard insight={turn.insight} onCreateRecommendation={() => onCreate(turn.insight!)} />
      )}
    </div>
  )
}

export function ChatPanel() {
  const meta = useMeta()
  const { turns, ask, busy } = useConversation()
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState<Insight | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const [params, setParams] = useSearchParams()
  const handledLink = useRef(false)

  // Other screens link here with a question ready to send.
  useEffect(() => {
    const question = params.get('ask')
    if (!question || handledLink.current) return
    handledLink.current = true
    ask(question)
    setParams({}, { replace: true })
  }, [params, ask, setParams])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns])

  const submit = (question: string) => {
    if (!question.trim() || busy) return
    ask(question.trim())
    setDraft('')
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit(draft)
  }
  const suggestions = meta.assistant.mode === 'live' ? LIVE_SUGGESTIONS : [DEMO_QUESTION, BRIEF_QUESTION]

  return (
    <div className="flex min-h-[calc(100vh-160px)] flex-col">
      <div className="flex-1 space-y-7 pb-6">
        {turns.length === 0 && (
          <div className="pt-[8vh] pb-8">
            <h2 className="text-[26px] font-semibold tracking-[-0.025em]">
              Ask why, and see what the data can prove.
            </h2>
            <p className="mt-2 max-w-xl text-[15px] text-ink-2">
              Every answer separates what was measured from what is only a hypothesis, and shows the
              query behind each number.
            </p>
          </div>
        )}
        {turns.map((turn) => (
          <TurnView key={turn.id} turn={turn} onCreate={setCreating} />
        ))}
        <div ref={end} />
      </div>
      <div className="sticky bottom-0 bg-gradient-to-t from-page from-70% to-transparent pt-4 pb-5">
        {turns.length === 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => submit(suggestion)}
                className="rounded-full border border-line-2 bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-2 shadow-card transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 rounded-2xl border border-line-2 bg-surface p-1.5 pl-4 shadow-card focus-within:border-ink-3"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about adoption, funnels or a release"
            aria-label="Ask a question"
            className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || busy}
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-ink transition-opacity',
              'disabled:opacity-25',
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        </form>
      </div>
      <CreateRecommendationDialog insight={creating} onClose={() => setCreating(null)} />
    </div>
  )
}
