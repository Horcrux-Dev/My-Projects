import type { AccountConfig, Candle, Instrument } from './types'
import { aggregate } from './marketData'
import { runScan } from './scan'
import { runSignals } from './signals'
import { runPlan } from './plan'
import { runRisk } from './risk'
import { runVerdict } from './verdict'

// ============================================================================
// Backtester — walk the history bar by bar, applying the EXACT same engine
// used live, then measure how the decisions would have performed.
//
// This exists to keep the "higher success rate" claim honest: the numbers are
// computed on the (simulated) data actually shown, not asserted. On live data
// the same code produces live statistics. Past performance never guarantees
// future results.
// ============================================================================

export interface Trade {
  entryIndex: number
  direction: 'LONG' | 'SHORT'
  entry: number
  stop: number
  target: number
  exit: number
  rMultiple: number
  win: boolean
}

export interface BacktestStats {
  trades: number
  wins: number
  losses: number
  winRate: number
  avgR: number
  expectancy: number
  profitFactor: number
  maxConsecLosses: number
  equityCurve: number[]
  netR: number
}

export function backtest(
  inst: Instrument,
  h1: Candle[],
  account: AccountConfig,
  opts: { warmup?: number; maxHold?: number } = {},
): { trades: Trade[]; stats: BacktestStats } {
  const warmup = opts.warmup ?? 220
  const maxHold = opts.maxHold ?? 48
  const trades: Trade[] = []
  let i = warmup

  while (i < h1.length - 2) {
    const window = h1.slice(0, i + 1)
    const h4 = aggregate(window, 4)
    const scan = runScan(inst, window, h4)
    const signal = runSignals(scan, window)
    const plan = runPlan(inst, scan, signal, window)
    const risk = runRisk(inst, plan, scan, account)
    const { verdict } = runVerdict(scan, signal, plan, risk, account)

    // We take APPROVED setups; WATCHLIST setups are entered only if price is
    // already in the zone (mirrors a live "condition met" trigger).
    const tradeable =
      verdict === 'APPROVED' ||
      (verdict === 'WATCHLIST' && plan.priceInEntryZone && signal.stars >= 3)

    if (!tradeable || plan.direction === 'FLAT') {
      i += 1
      continue
    }

    const dir = plan.direction
    const entry = h1[i].close
    const stop = plan.stop
    const target = plan.target
    const risDist = Math.abs(entry - stop)
    if (risDist <= 0) {
      i += 1
      continue
    }

    // Walk forward to resolve the trade.
    let exit = entry
    let rMultiple = 0
    let resolved = false
    const end = Math.min(i + maxHold, h1.length - 1)
    for (let j = i + 1; j <= end; j++) {
      const bar = h1[j]
      if (dir === 'LONG') {
        if (bar.low <= stop) {
          exit = stop
          rMultiple = -1
          resolved = true
          break
        }
        if (bar.high >= target) {
          exit = target
          rMultiple = (target - entry) / risDist
          resolved = true
          break
        }
      } else {
        if (bar.high >= stop) {
          exit = stop
          rMultiple = -1
          resolved = true
          break
        }
        if (bar.low <= target) {
          exit = target
          rMultiple = (entry - target) / risDist
          resolved = true
          break
        }
      }
    }
    if (!resolved) {
      // Time exit at last bar in window.
      exit = h1[end].close
      rMultiple = ((dir === 'LONG' ? exit - entry : entry - exit) / risDist)
    }

    trades.push({
      entryIndex: i,
      direction: dir,
      entry,
      stop,
      target,
      exit,
      rMultiple: Number(rMultiple.toFixed(2)),
      win: rMultiple > 0,
    })

    // Skip past the trade to avoid overlapping entries.
    i = (trades[trades.length - 1] ? end : i) + 1
  }

  return { trades, stats: summarise(trades) }
}

function summarise(trades: Trade[]): BacktestStats {
  const wins = trades.filter((t) => t.win)
  const losses = trades.filter((t) => !t.win)
  const grossWin = wins.reduce((a, t) => a + t.rMultiple, 0)
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.rMultiple, 0))
  const netR = trades.reduce((a, t) => a + t.rMultiple, 0)

  let consec = 0
  let maxConsec = 0
  for (const t of trades) {
    if (!t.win) {
      consec++
      maxConsec = Math.max(maxConsec, consec)
    } else consec = 0
  }

  const equityCurve: number[] = []
  let acc = 0
  for (const t of trades) {
    acc += t.rMultiple
    equityCurve.push(Number(acc.toFixed(2)))
  }

  const n = trades.length
  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n ? (wins.length / n) * 100 : 0,
    avgR: n ? netR / n : 0,
    expectancy: n ? netR / n : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxConsecLosses: maxConsec,
    equityCurve,
    netR: Number(netR.toFixed(2)),
  }
}
