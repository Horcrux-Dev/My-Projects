import type { DecisionMemo } from '../engine/types'
import { fmtPrice } from '../engine/instruments'
import { Gauge, Pips, Stars, StrengthBar } from './ui'

// The Final Decision Memo — the hero output, mirroring the "FINAL DECISION
// MEMO" board: setup summary, signal strength, risk level, trade plan, status.

export function DecisionMemoCard({ memo }: { memo: DecisionMemo }) {
  const { scan, signal, plan, risk, instrument: inst } = memo
  const riskPips = risk.rating === 'LOW' ? 1 : risk.rating === 'MODERATE' ? 2 : 3

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <span>▣</span> FINAL DECISION MEMO
        </h3>
        <div style={{ textAlign: 'right' }}>
          <div className="label">ID: {memo.id}</div>
          <div className="label">DATE: {memo.date}</div>
        </div>
      </div>

      {/* 1. Setup summary */}
      <MemoRow idx="1" title="Setup Summary">
        <div className="grid" style={{ gridTemplateColumns: '1fr auto', gap: 4 }}>
          <div>
            <KV k="Trend Alignment" v={scan.trendAligned ? 'YES' : 'NO'} good={scan.trendAligned} />
            <KV k="Market Condition" v={scan.regime === 'TRENDING' ? 'TRENDING' : 'IN RANGE'} />
            <KV k="Timeframe" v={plan.timeframe} />
          </div>
        </div>
      </MemoRow>

      {/* 2. Signal strength */}
      <MemoRow idx="2" title="Signal Strength">
        <div className="flex between" style={{ alignItems: 'center' }}>
          <div>
            <div className="flex" style={{ gap: 8 }}>
              <span className="label label-ink">Confidence</span>
              <Stars n={signal.stars} max={4} />
            </div>
            <div className="flex" style={{ gap: 8, marginTop: 6 }}>
              <span className="label label-ink">Strength</span>
              <b className="mono" style={{ color: signal.strength === 'STRONG' ? 'var(--orange)' : 'var(--ink)' }}>
                {signal.strength}
              </b>
            </div>
          </div>
          <Gauge value={signal.confidence} label={`${signal.confidence}%`} />
        </div>
      </MemoRow>

      {/* 3. Risk level */}
      <MemoRow idx="3" title="Risk Level">
        <KV k="Risk Rating" v={risk.rating} />
        <KV k="Max Loss Within Plan" v={risk.maxLossWithinPlan ? 'YES' : 'NO'} good={risk.maxLossWithinPlan} />
        <div className="flex between mt">
          <Pips n={riskPips} max={4} />
          <span className="label">
            {risk.contracts} {risk.useMicro ? inst.micro?.symbol : inst.symbol} · ${risk.dollarRisk.toLocaleString()} risk
          </span>
        </div>
      </MemoRow>

      {/* 4. Trade plan */}
      <MemoRow idx="4" title="Trade Plan">
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2px 18px' }}>
          <KV k="Direction" v={plan.direction} accent />
          <KV k="Entry" v={fmtPrice(plan.entry, inst)} />
          <KV k="Stop Loss" v={fmtPrice(plan.stop, inst)} />
          <KV k="Take Profit" v={fmtPrice(plan.target, inst)} />
          <KV k="Invalidation" v={fmtPrice(plan.invalidation, inst)} />
          <KV k="R:R Ratio" v={`1:${plan.rr.toFixed(2)}`} accent />
        </div>
      </MemoRow>

      {/* 5. Final status */}
      <MemoRow idx="5" title="Final Status" last>
        <div className="flex between">
          <b className="mono" style={{ fontSize: 15, letterSpacing: '0.05em' }}>
            {memo.finalStatus}
          </b>
          <div className="strengthbar" style={{ width: 120 }}>
            <StrengthBar stars={signal.stars} />
          </div>
        </div>
      </MemoRow>

      {/* Verdict tri-state */}
      <div className="label" style={{ textAlign: 'center', margin: '14px 0 4px' }}>
        — HUMAN REVIEW REQUIRED —
      </div>
      <div className="verdict-row">
        <div className={`vbox approved ${memo.verdict === 'APPROVED' ? 'on' : ''}`}>
          <div className="t">✓ APPROVED</div>
          <div className="s">Execute Trade</div>
        </div>
        <div className={`vbox watchlist ${memo.verdict === 'WATCHLIST' ? 'on' : ''}`}>
          <div className="t">◉ WATCHLIST</div>
          <div className="s">Monitor Conditions</div>
        </div>
        <div className={`vbox rejected ${memo.verdict === 'REJECTED' ? 'on' : ''}`}>
          <div className="t">✕ REJECTED</div>
          <div className="s">Do Not Trade</div>
        </div>
      </div>

      {/* Reasons */}
      <div className="mt">
        <div className="label" style={{ marginBottom: 6 }}>Decision Rationale</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {memo.reasons.map((r, i) => (
            <li key={i} className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 3 }}>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function MemoRow({
  idx,
  title,
  children,
  last,
}: {
  idx: string
  title: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      style={{
        padding: '11px 0',
        borderBottom: last ? 'none' : '1px dashed var(--line)',
        display: 'grid',
        gridTemplateColumns: '150px 1fr',
        gap: 14,
        alignItems: 'start',
      }}
    >
      <div className="mono" style={{ fontSize: 12, letterSpacing: '0.06em', fontWeight: 700 }}>
        <span className="accent">{idx}.</span> {title.toUpperCase()}
      </div>
      <div>{children}</div>
    </div>
  )
}

function KV({ k, v, good, accent }: { k: string; v: string; good?: boolean; accent?: boolean }) {
  return (
    <div className="drow" style={{ padding: '4px 0' }}>
      <span className="k">{k}</span>
      <span
        className="v"
        style={{ color: good ? 'var(--green)' : accent ? 'var(--orange)' : undefined }}
      >
        {v}
      </span>
    </div>
  )
}
