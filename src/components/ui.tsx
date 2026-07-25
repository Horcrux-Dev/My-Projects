// Small presentational primitives shared across panels.

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < n ? '' : 'off'}>
          {i < n ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

export function Pips({ n, max = 4 }: { n: number; max?: number }) {
  return (
    <span className="pips">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < n ? 'pip on' : 'pip'} />
      ))}
    </span>
  )
}

export function StrengthBar({ stars, max = 4 }: { stars: number; max?: number }) {
  return (
    <div className="strengthbar">
      {Array.from({ length: max + 1 }).map((_, i) => (
        <span
          key={i}
          className={i === max ? 'cap' : i < stars ? 'on' : ''}
        />
      ))}
    </div>
  )
}

/** A semicircular confidence gauge, like the memo's "signal strength" dial. */
export function Gauge({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value))
  const angle = -90 + (v / 100) * 180 // -90..90 degrees
  const r = 46
  const cx = 60
  const cy = 60
  const rad = (angle * Math.PI) / 180
  const nx = cx + r * Math.sin(rad)
  const ny = cy - r * Math.cos(rad)
  const arc = (from: number, to: number) => {
    const a1 = ((-90 + from) * Math.PI) / 180
    const a2 = ((-90 + to) * Math.PI) / 180
    const x1 = cx + r * Math.sin(a1)
    const y1 = cy - r * Math.cos(a1)
    const x2 = cx + r * Math.sin(a2)
    const y2 = cy - r * Math.cos(a2)
    const large = to - from > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }
  return (
    <svg viewBox="0 0 120 76" width="120" height="76">
      <path d={arc(0, 180)} fill="none" stroke="var(--line-strong)" strokeWidth="6" strokeLinecap="round" />
      <path
        d={arc(0, (v / 100) * 180)}
        fill="none"
        stroke="var(--orange)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r="4" fill="var(--ink)" />
      {label && (
        <text x={cx} y={cy - 14} textAnchor="middle" className="mono" fontSize="15" fontWeight="700" fill="var(--ink)">
          {label}
        </text>
      )}
    </svg>
  )
}

/** Compact line sparkline for equity curves / mini trends. */
export function Sparkline({
  data,
  width = 260,
  height = 60,
  color = 'var(--orange)',
  zeroLine = false,
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
  zeroLine?: boolean
}) {
  if (data.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...data, zeroLine ? 0 : Math.min(...data))
  const max = Math.max(...data, zeroLine ? 0 : Math.max(...data))
  const span = max - min || 1
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2
    const y = height - 2 - ((d - min) / span) * (height - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const zeroY = height - 2 - ((0 - min) / span) * (height - 4)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '100%' }}>
      {zeroLine && (
        <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" />
      )}
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function DirBadge({ direction }: { direction: 'LONG' | 'SHORT' | 'FLAT' }) {
  return <span className={`badge ${direction.toLowerCase()}`}>{direction}</span>
}
