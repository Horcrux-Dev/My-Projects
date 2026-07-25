import type { Candle, Instrument, Timeframe } from './types'
import { getInstrument } from './instruments'

// ============================================================================
// Market data layer.
//
// The app ships with a deterministic, regime-switching price simulator so it
// runs instantly with no API keys or network. A live provider can be dropped
// in by implementing `MarketDataProvider` and passing it to the pipeline.
// ============================================================================

export interface MarketDataProvider {
  /** Fetch the most recent `limit` candles for a symbol at a timeframe. */
  getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]>
}

/** A tiny seeded PRNG (mulberry32) for reproducible simulated markets. */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box-Muller standard normal. */
function gauss(rng: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const TF_MINUTES: Record<Timeframe, number> = { M15: 15, H1: 60, H4: 240, D1: 1440 }

/**
 * Generate a realistic H1 OHLCV series for an instrument using a
 * regime-switching geometric process (trend + mean-reversion + vol clustering).
 */
export function simulateH1(inst: Instrument, bars: number, seed: number): Candle[] {
  const rng = makeRng(seed + hashStr(inst.symbol))
  const barsPerYear = 24 * 252
  const drift = 0
  const baseVol = inst.annualVol / Math.sqrt(barsPerYear)

  let price = inst.refPrice
  // Regime state: trend strength & sign, mean-reversion pull, vol multiplier.
  let trend = (rng() - 0.5) * 2 * baseVol * 0.6
  let volMult = 1
  const candles: Candle[] = []
  const now = Date.now()

  for (let i = 0; i < bars; i++) {
    // Occasionally switch regime.
    if (rng() < 0.02) trend = (rng() - 0.5) * 2 * baseVol * 0.9
    if (rng() < 0.05) volMult = 0.6 + rng() * 1.8 // volatility clustering

    const shock = gauss(rng) * baseVol * volMult
    const ret = drift + trend + shock
    const open = price
    const close = open * (1 + ret)
    // Intrabar range scaled by current volatility.
    const wick = Math.abs(gauss(rng)) * baseVol * volMult * open * 0.8
    const high = Math.max(open, close) + wick * (0.4 + rng() * 0.6)
    const low = Math.min(open, close) - wick * (0.4 + rng() * 0.6)
    const volume = Math.round(1000 + Math.abs(ret / baseVol) * 800 + rng() * 400)

    const time = now - (bars - i) * TF_MINUTES.H1 * 60_000
    candles.push({ time, open, high, low, close, volume })
    price = close
    // Gentle mean reversion of trend toward zero keeps series realistic.
    trend *= 0.98
  }
  return candles
}

/** Aggregate a base series into a higher timeframe by grouping N bars. */
export function aggregate(base: Candle[], factor: number): Candle[] {
  const out: Candle[] = []
  for (let i = 0; i < base.length; i += factor) {
    const group = base.slice(i, i + factor)
    if (group.length === 0) continue
    out.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((a, c) => a + c.volume, 0),
    })
  }
  return out
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Deterministic simulated provider. The same seed always yields the same
 * market, which makes the demo reproducible and the backtest stable.
 */
export class SimulatedProvider implements MarketDataProvider {
  constructor(private seed = 1337) {}

  setSeed(seed: number) {
    this.seed = seed
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const inst = getInstrument(symbol)
    // Simulate a deep H1 history, then aggregate up as needed.
    const h1 = simulateH1(inst, Math.max(limit * 4 + 400, 1600), this.seed)
    let series = h1
    if (timeframe === 'H4') series = aggregate(h1, 4)
    else if (timeframe === 'D1') series = aggregate(h1, 24)
    else if (timeframe === 'M15') series = h1 // treated as base for demo
    return series.slice(-limit)
  }
}
