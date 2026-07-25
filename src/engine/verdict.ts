import type {
  AccountConfig,
  DecisionMemo,
  RiskResult,
  ScanResult,
  SignalResult,
  TradePlan,
  Verdict,
} from './types'

// ============================================================================
// VERDICT stage — "then I get one clear decision. Take it. Watch it. Skip it."
// Combines signal quality, plan quality and the risk gate into ONE call:
// APPROVED / WATCHLIST / REJECTED. Human approval is always required.
// ============================================================================

export function runVerdict(
  scan: ScanResult,
  signal: SignalResult,
  plan: TradePlan,
  risk: RiskResult,
  account: AccountConfig,
): { verdict: Verdict; reasons: string[]; finalStatus: string } {
  const reasons: string[] = []

  // Hard blocks -> REJECTED.
  if (signal.direction === 'FLAT') {
    reasons.push('No directional edge — signal is flat/mixed')
  }
  if (!risk.pass) {
    const failed = risk.checks.filter((c) => !c.ok).map((c) => c.name)
    reasons.push(`Risk gate failed: ${failed.join(', ')}`)
  }
  if (plan.rr < account.minRR) {
    reasons.push(`R:R ${plan.rr.toFixed(2)} below ${account.minRR} minimum`)
  }

  const hardBlock =
    signal.direction === 'FLAT' || !risk.pass || plan.rr < account.minRR
  if (hardBlock) {
    return { verdict: 'REJECTED', reasons, finalStatus: 'DO NOT TRADE' }
  }

  // Quality gates for APPROVED vs WATCHLIST.
  const strongSignal = signal.stars >= 3 && signal.strength !== 'WEAK'
  const aligned = scan.trendAligned
  const trending = scan.regime === 'TRENDING'
  const inZone = plan.priceInEntryZone
  const goodRR = plan.rr >= Math.max(account.minRR, 1.8)

  const approveScore =
    (strongSignal ? 2 : 0) +
    (aligned ? 1 : 0) +
    (trending ? 1 : 0) +
    (inZone ? 1 : 0) +
    (goodRR ? 1 : 0)

  if (strongSignal) reasons.push(`Signal ${signal.strength} (${signal.stars}★, ${signal.confidence}% conf)`)
  else reasons.push(`Signal only ${signal.strength} (${signal.stars}★)`)
  if (signal.setupType !== 'NONE') reasons.push(`Setup: ${signal.setupNote}`)
  if (aligned) reasons.push('H1/H4 trend aligned')
  else reasons.push('Higher-timeframe trend not aligned')
  if (trending) reasons.push(`Trending regime (ADX ${scan.adx.toFixed(0)})`)
  else reasons.push(`Ranging regime (ADX ${scan.adx.toFixed(0)})`)
  reasons.push(inZone ? 'Price inside entry zone' : 'Price outside entry zone — wait for pullback')
  reasons.push(`R:R 1:${plan.rr.toFixed(2)}`)

  // Discipline gate: never auto-approve a fresh entry into a high-impact event
  // window — hold it on the watchlist until the event clears.
  if (scan.eventRisk === 'HIGH') {
    reasons.push(`Held for event risk: ${scan.eventNote}`)
    return { verdict: 'WATCHLIST', reasons, finalStatus: 'HELD — EVENT WINDOW' }
  }
  if (scan.eventRisk === 'ELEVATED') {
    reasons.push(`Note: ${scan.eventNote}`)
  }

  // APPROVED demands strong confluence, alignment and price at the entry.
  if (approveScore >= 5 && strongSignal && aligned && inZone) {
    return { verdict: 'APPROVED', reasons, finalStatus: 'DECISION READY' }
  }
  // Otherwise it is a valid idea that needs a condition to trigger.
  return { verdict: 'WATCHLIST', reasons, finalStatus: 'MONITOR CONDITIONS' }
}

/** Build a deterministic memo id from symbol + last bar time. */
export function memoId(symbol: string, seed: number): string {
  const n = (Math.abs(seed) % 900) + 100
  return `FD-${n}-${symbol}`
}

export function buildMemo(
  base: Omit<DecisionMemo, 'verdict' | 'reasons' | 'finalStatus'>,
  account: AccountConfig,
): DecisionMemo {
  const { verdict, reasons, finalStatus } = runVerdict(
    base.scan,
    base.signal,
    base.plan,
    base.risk,
    account,
  )
  return { ...base, verdict, reasons, finalStatus }
}
