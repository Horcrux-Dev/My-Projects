import type { Candle, Instrument, TradePlan } from '../engine/types'
import { fmtPrice } from '../engine/instruments'

// SVG candlestick chart overlaid with the trade plan's entry zone, stop,
// target and invalidation — the visual language of the "Trade Planner" board.

interface Props {
  candles: Candle[]
  plan: TradePlan
  inst: Instrument
  bars?: number
}

export function TradeChart({ candles, plan, inst, bars = 90 }: Props) {
  const w = 620
  const h = 300
  const padR = 70
  const padL = 8
  const padY = 16

  const view = candles.slice(-bars)
  const highsAll = view.map((c) => c.high)
  const lowsAll = view.map((c) => c.low)
  let hi = Math.max(...highsAll, plan.target, plan.stop, plan.invalidation)
  let lo = Math.min(...lowsAll, plan.target, plan.stop, plan.invalidation)
  const pad = (hi - lo) * 0.06
  hi += pad
  lo -= pad
  const span = hi - lo || 1

  const x = (i: number) => padL + (i / (view.length - 1)) * (w - padL - padR)
  const y = (p: number) => padY + (1 - (p - lo) / span) * (h - padY * 2)
  const cw = Math.max(2, ((w - padL - padR) / view.length) * 0.6)

  // Compute label anchor positions, then push them apart so the right-edge
  // callouts never overlap when levels sit close together.
  const levels = [
    { price: plan.target, color: 'var(--green)', label: 'TARGET', dashed: true },
    { price: plan.entry, color: 'var(--ink)', label: 'ENTRY', dashed: false },
    { price: plan.stop, color: 'var(--orange)', label: 'STOP', dashed: true },
    { price: plan.invalidation, color: 'var(--red)', label: 'INVALID', dashed: true },
  ]
    .map((l) => ({ ...l, ly: y(l.price) }))
    .sort((a, b) => a.ly - b.ly)
  const minGap = 22
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].ly - levels[i - 1].ly < minGap) {
      levels[i].ly = levels[i - 1].ly + minGap
    }
  }

  // Entry zone band
  const zoneTop = y(Math.max(plan.entryHigh, plan.entryLow))
  const zoneBot = y(Math.min(plan.entryHigh, plan.entryLow))

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      {/* entry zone */}
      <rect
        x={padL}
        y={zoneTop}
        width={w - padL - padR}
        height={Math.max(2, zoneBot - zoneTop)}
        fill="rgba(27,26,23,0.06)"
        stroke="var(--line-strong)"
        strokeDasharray="3 3"
        strokeWidth="1"
      />

      {/* candles */}
      {view.map((c, i) => {
        const up = c.close >= c.open
        const col = up ? 'var(--ink-2)' : 'var(--orange)'
        const bodyTop = y(Math.max(c.open, c.close))
        const bodyBot = y(Math.min(c.open, c.close))
        return (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth="1" />
            <rect
              x={x(i) - cw / 2}
              y={bodyTop}
              width={cw}
              height={Math.max(1, bodyBot - bodyTop)}
              fill={up ? 'var(--card)' : col}
              stroke={col}
              strokeWidth="1"
            />
          </g>
        )
      })}

      {/* plan levels — line at true price, label de-collided at ly */}
      {levels.map((l) => (
        <g key={l.label}>
          <line
            x1={padL}
            x2={w - padR}
            y1={y(l.price)}
            y2={y(l.price)}
            stroke={l.color}
            strokeWidth="1.4"
            strokeDasharray={l.dashed ? '5 4' : undefined}
          />
          {/* leader from the line to the (possibly shifted) label */}
          <line x1={w - padR} y1={y(l.price)} x2={w - padR + 3} y2={l.ly - 3} stroke={l.color} strokeWidth="0.8" />
          <text x={w - padR + 5} y={l.ly} fontSize="9.5" className="mono" fill={l.color}>
            {l.label}
          </text>
          <text x={w - padR + 5} y={l.ly + 10} fontSize="8.5" className="mono" fill="var(--muted)">
            {fmtPrice(l.price, inst)}
          </text>
        </g>
      ))}
    </svg>
  )
}
