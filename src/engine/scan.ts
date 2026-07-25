import type { Candle, Direction, Instrument, ScanResult } from './types'
import { adx, atr, closes, ema, lastDefined, slopePct } from './indicators'

// ============================================================================
// SCAN stage — read the market state for an instrument.
// Establishes regime (trending vs ranging), volatility, and multi-timeframe
// trend bias (H4 = higher timeframe filter, H1 = entry timeframe).
// ============================================================================

/** Classify trend from EMA structure + regression slope. */
function trendBias(candles: Candle[]): Direction {
  const c = closes(candles)
  const ema20 = lastDefined(ema(c, 20))
  const ema50 = lastDefined(ema(c, 50))
  const price = c[c.length - 1]
  const slope = slopePct(c, 20)
  let up = 0
  let down = 0
  if (price > ema20) up++
  else down++
  if (ema20 > ema50) up++
  else down++
  if (slope > 0.02) up++
  else if (slope < -0.02) down++
  if (up >= 2 && up > down) return 'LONG'
  if (down >= 2 && down > up) return 'SHORT'
  return 'FLAT'
}

export function runScan(
  inst: Instrument,
  h1: Candle[],
  h4: Candle[],
): ScanResult {
  const c1 = closes(h1)
  const lastPrice = c1[c1.length - 1]
  const prevPrice = c1[c1.length - 2] ?? lastPrice
  const changePct = ((lastPrice - prevPrice) / prevPrice) * 100

  const atrVal = lastDefined(atr(h1, 14))
  const atrPct = (atrVal / lastPrice) * 100
  const adxVal = lastDefined(adx(h1, 14).adx)

  const htfTrend = trendBias(h4)
  const ltfTrend = trendBias(h1)
  const trendAligned =
    htfTrend !== 'FLAT' && htfTrend === ltfTrend

  return {
    instrument: inst,
    lastPrice,
    changePct,
    atr: atrVal,
    atrPct,
    adx: adxVal,
    regime: adxVal >= 22 ? 'TRENDING' : 'RANGING',
    htfTrend,
    ltfTrend,
    trendAligned,
  }
}
