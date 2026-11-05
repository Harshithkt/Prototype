import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { api, type Insight } from './api'

export type Turn = {
  id: number
  question: string
  status: 'pending' | 'done' | 'error'
  insight?: Insight
  error?: string
}

type Conversation = { turns: Turn[]; ask: (question: string) => void; busy: boolean }

const ConversationContext = createContext<Conversation | null>(null)

// Lives above the router so the conversation survives moving between screens.
export function ConversationProvider({ children }: { children: ReactNode }) {
  const [turns, setTurns] = useState<Turn[]>([])

  const ask = useCallback((question: string) => {
    const id = Date.now()
    const patch = (changes: Partial<Turn>) =>
      setTurns((current) => current.map((t) => (t.id === id ? { ...t, ...changes } : t)))
    setTurns((current) => [...current, { id, question, status: 'pending' }])
    api
      .ask(question)
      .then((insight) => patch({ status: 'done', insight }))
      .catch((error: Error) => patch({ status: 'error', error: error.message }))
  }, [])

  const value = useMemo(
    () => ({ turns, ask, busy: turns.some((turn) => turn.status === 'pending') }),
    [turns, ask],
  )
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>
}

export function useConversation() {
  const value = useContext(ConversationContext)
  if (!value) throw new Error('useConversation needs a ConversationProvider')
  return value
}
