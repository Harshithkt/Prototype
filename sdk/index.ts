export type Traits = {
  plan?: string
  platform?: string
  actorType?: 'human' | 'ai_agent' | 'bot' | 'service'
  accountName?: string
}

type QueuedEvent = {
  event: string
  userId: string
  properties: Record<string, unknown>
  timestamp: string
}

export type AnalyticsOptions = {
  apiUrl: string
  writeKey: string
  /** How long events wait before a flush. Keep it under the 5 second ingest target. */
  flushIntervalMs?: number
  maxBatchSize?: number
  onError?: (error: Error) => void
}

export class Analytics {
  private queue: QueuedEvent[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private userId: string | undefined

  constructor(private options: AnalyticsOptions) {}

  async identify(userId: string, traits: Traits = {}) {
    this.userId = userId
    await this.post('/v1/identify', { userId, traits })
  }

  track(event: string, properties: Record<string, unknown> = {}) {
    if (!this.userId) throw new Error('Call identify() before track()')
    this.queue.push({
      event,
      userId: this.userId,
      properties,
      timestamp: new Date().toISOString(),
    })
    if (this.queue.length >= (this.options.maxBatchSize ?? 20)) void this.flush()
    else this.timer ??= setTimeout(() => void this.flush(), this.options.flushIntervalMs ?? 1000)
  }

  async flush() {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.queue.length === 0) return
    const events = this.queue
    this.queue = []
    await this.post('/v1/events', { events })
  }

  private async post(path: string, body: unknown) {
    try {
      const response = await fetch(`${this.options.apiUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-write-key': this.options.writeKey },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const { reason } = (await response.json().catch(() => ({}))) as { reason?: string }
        throw new Error(reason ?? `Request failed with ${response.status}`)
      }
    } catch (error) {
      if (!this.options.onError) throw error
      this.options.onError(error as Error)
    }
  }
}
