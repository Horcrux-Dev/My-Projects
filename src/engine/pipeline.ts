import type {
  AccountConfig,
  Candle,
  DecisionMemo,
  Instrument,
} from './types'
import type { MarketDataProvider } from './marketData'
import { getInstrument } from './instruments'
import { runScan } from './scan'
import { runSignals } from './signals'
import { runPlan } from './plan'
import { runRisk } from './risk'
import { buildMemo, memoId } from './verdict'

// ============================================================================
// Pipeline orchestrator — SCAN -> SIGNALS -> PLAN -> RISK -> VERDICT.
// Produces a Final Decision Memo for a single instrument.
// ============================================================================

export const DEFAULT_ACCOUNT: AccountConfig = {
  equity: 50_000,
  riskPerTrade: 0.01, // 1% per trade
  maxPortfolioRisk: 0.06, // 6% total open risk
  maxDailyLoss: 0.03, // 3% daily stop
  currentDrawdown: 0,
  maxDrawdown: 0.15, // 15% max drawdown
  minRR: 1.5,
  allowMicro: true,
}

export interface PipelineOutput {
  memo: DecisionMemo
  h1: Candle[]
  h4: Candle[]
}

export async function runPipeline(
  symbol: string,
  provider: MarketDataProvider,
  account: AccountConfig,
  seed = 1,
): Promise<PipelineOutput> {
  const inst: Instrument = getInstrument(symbol)
  const [h1, h4] = await Promise.all([
    provider.getCandles(symbol, 'H1', 300),
    provider.getCandles(symbol, 'H4', 200),
  ])

  const scan = runScan(inst, h1, h4)
  const signal = runSignals(scan, h1)
  const plan = runPlan(inst, scan, signal, h1)
  const risk = runRisk(inst, plan, scan, account)

  const now = new Date()
  const memo = buildMemo(
    {
      id: memoId(symbol, seed + h1.length),
      date: now.toISOString().slice(0, 10),
      instrument: inst,
      scan,
      signal,
      plan,
      risk,
    },
    account,
  )

  return { memo, h1, h4 }
}

/** Run the pipeline across every tracked instrument. */
export async function runAll(
  provider: MarketDataProvider,
  account: AccountConfig,
  symbols: string[],
  seed = 1,
): Promise<PipelineOutput[]> {
  return Promise.all(symbols.map((s) => runPipeline(s, provider, account, seed)))
}
