import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Dot } from '@/lib/api'
import { formatCount, titleCase } from '@/lib/utils'

const HEIGHT = 420
const MARGIN = { top: 16, right: 20, bottom: 44, left: 48 }
const LAPSED_DAYS = 14
const HIT_RADIUS = 24
const X_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]

// Colour follows the plan, so filtering never repaints the dots that remain.
export const PLAN_COLORS: Record<string, string> = {
  free: 'var(--series-1)',
  pro: 'var(--series-2)',
  enterprise: 'var(--series-3)',
}

type Placed = Dot & { x: number; y: number }

// Interactions and days are whole numbers, so many users share a spot. A small
// offset, stable per user, lets them read as separate dots.
function jitter(userId: number, salt: number) {
  const value = Math.sin(userId * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value) - 0.5
}

function Dots({ placed }: { placed: Placed[] }) {
  return (
    <g>
      {placed.map((dot) => (
        <circle
          key={dot.user_id}
          cx={dot.x}
          cy={dot.y}
          r={4}
          fill={PLAN_COLORS[dot.plan ?? ''] ?? 'var(--ink-3)'}
          stroke="var(--surface)"
          strokeWidth={1}
        />
      ))}
    </g>
  )
}
const MemoDots = memo(Dots)

export function DotPlot({
  dots,
  rangeDays,
  selectedUser,
  onSelect,
}: {
  dots: Dot[]
  rangeDays: number
  selectedUser?: number
  onSelect: (userId: number) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<Placed | null>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    // A container mid-layout can report zero, which would give the plot a negative size.
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { placed, xScale, yScale, xTicks, yTicks, yMax } = useMemo(() => {
    const plotW = Math.max(width - MARGIN.left - MARGIN.right, 100)
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
    const maxX = Math.max(10, ...dots.map((d) => d.interactions))
    const logMax = Math.log10(maxX * 1.12)
    const logMin = Math.log10(0.8)
    const yMax = Math.max(rangeDays - 1, 7)
    const xScale = (value: number) =>
      MARGIN.left + ((Math.log10(value) - logMin) / (logMax - logMin)) * plotW
    const yScale = (value: number) => MARGIN.top + plotH - (value / yMax) * plotH
    const yStep = yMax > 40 ? 10 : yMax > 15 ? 5 : 2
    const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => i * yStep)
    const placed = dots.map((dot) => ({
      ...dot,
      x: xScale(Math.max(dot.interactions * (1 + jitter(dot.user_id, 1) * 0.09), 0.86)),
      y: yScale(Math.max(dot.days_since_last_use + jitter(dot.user_id, 2) * 0.62, -0.2)),
    }))
    return { placed, xScale, yScale, xTicks: X_TICKS.filter((t) => t <= maxX * 1.12), yTicks, yMax }
  }, [dots, width, rangeDays])

  const nearest = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - box.left
    const py = event.clientY - box.top
    let best: Placed | null = null
    let bestDistance = HIT_RADIUS ** 2
    for (const dot of placed) {
      const distance = (dot.x - px) ** 2 + (dot.y - py) ** 2
      if (distance < bestDistance) {
        best = dot
        bestDistance = distance
      }
    }
    return best
  }

  const selected = placed.find((dot) => dot.user_id === selectedUser)
  const plotRight = width - MARGIN.right
  const bandTop = MARGIN.top
  const bandBottom = yScale(LAPSED_DAYS)
  const showBand = yMax > LAPSED_DAYS

  return (
    <div ref={container} className="relative w-full select-none">
      <svg
        role="img"
        aria-label={`Scatter plot of ${dots.length} users by interactions and days since last use`}
        width={width}
        height={HEIGHT}
        className="block"
        style={{ cursor: hover ? 'pointer' : 'default' }}
        onPointerMove={(event) => setHover(nearest(event))}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          const dot = nearest(event as unknown as PointerEvent<SVGSVGElement>)
          if (dot) onSelect(dot.user_id)
        }}
      >
        {showBand && (
          <g>
            <rect
              x={MARGIN.left}
              y={bandTop}
              width={plotRight - MARGIN.left}
              height={bandBottom - bandTop}
              fill="var(--surface-2)"
              opacity={0.65}
            />
          </g>
        )}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={plotRight} y1={yScale(tick)} y2={yScale(tick)} stroke={tick === 0 ? 'var(--axis)' : 'var(--grid)'} />
            <text x={MARGIN.left - 10} y={yScale(tick) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {tick}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick} x={xScale(tick)} y={HEIGHT - MARGIN.bottom + 20} textAnchor="middle" fontSize={12} fill="var(--ink-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatCount(tick)}
          </text>
        ))}
        <text x={MARGIN.left + (plotRight - MARGIN.left) / 2} y={HEIGHT - 6} textAnchor="middle" fontSize={12} fill="var(--ink-2)">
          Interactions (log scale)
        </text>
        <text transform={`translate(13 ${MARGIN.top + (HEIGHT - MARGIN.top - MARGIN.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--ink-2)">
          Days since last use
        </text>

        <MemoDots placed={placed} />

        {showBand && (
          <text
            x={plotRight - 10}
            y={bandTop + 18}
            textAnchor="end"
            fontSize={12}
            fontWeight={500}
            fill="var(--ink-2)"
            stroke="var(--surface)"
            strokeWidth={4}
            strokeLinejoin="round"
            style={{ paintOrder: 'stroke' }}
          >
            Lapsed: no use in {LAPSED_DAYS}+ days
          </text>
        )}

        {selected && <circle cx={selected.x} cy={selected.y} r={7} fill="none" stroke="var(--ink)" strokeWidth={2} />}
        {hover && (
          <circle cx={hover.x} cy={hover.y} r={6} fill={PLAN_COLORS[hover.plan ?? ''] ?? 'var(--ink-3)'} stroke="var(--ink)" strokeWidth={1.5} />
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[220px] rounded-lg border border-line bg-surface px-3 py-2 shadow-float"
          style={{
            left: Math.min(hover.x + 14, width - 200),
            top: Math.max(hover.y - 76, 4),
          }}
        >
          <p className="font-mono text-[12px] font-medium">{hover.external_id}</p>
          <p className="mt-1 text-[12.5px] text-ink-2">
            <span className="font-semibold text-ink tabular-nums">{formatCount(hover.interactions)}</span> interactions
          </p>
          <p className="text-[12.5px] text-ink-2">
            <span className="font-semibold text-ink tabular-nums">{hover.days_since_last_use}</span> days since last use
          </p>
          <p className="mt-1 text-[12px] text-ink-3">
            {titleCase(hover.plan ?? 'no plan')} · {titleCase(hover.platform ?? 'unknown')} · click for timeline
          </p>
        </div>
      )}
    </div>
  )
}
