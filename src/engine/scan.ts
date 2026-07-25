import type { Candle, Direction, EventRisk, Instrument, ScanResult } from './types'
import { adx, atr, closes, ema, lastDefined, slopePct } from './indicators'
import { makeRng } from './marketData'

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

  // Volume read: latest bar vs its trailing 20-bar average (100 = average).
  const vols = h1.slice(-21, -1).map((c) => c.volume)
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : h1[h1.length - 1].volume
  const volumePct = avgVol > 0 ? (h1[h1.length - 1].volume / avgVol) * 100 : 100

  const { eventRisk, eventNote } = assessEventRisk(inst, h1[h1.length - 1].time)

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
    volumePct,
    eventRisk,
    eventNote,
  }
}

/**
 * News / scheduled-event awareness (reference page 2: "NEWS & EVENTS
 * MONITORING"). The simulator derives a deterministic pseudo-calendar from the
 * latest bar time so the read is stable per market state. Replace this with a
 * real economic-calendar feed (e.g. FOMC / CPI / NFP for indices, or metals
 * inventory data) when going live.
 */
function assessEventRisk(inst: Instrument, time: number): { eventRisk: EventRisk; eventNote: string } {
  const rng = makeRng(Math.floor(time / 3_600_000) + inst.symbol.charCodeAt(0))
  const roll = rng()
  if (roll > 0.9) {
    return {
      eventRisk: 'HIGH',
      eventNote: inst.klass === 'Index' ? 'High-impact release imminent (FOMC/CPI/NFP window)' : 'Major macro / inventory print imminent',
    }
  }
  if (roll > 0.72) {
    return { eventRisk: 'ELEVATED', eventNote: 'Elevated event risk on the calendar today' }
  }
  return { eventRisk: 'CLEAR', eventNote: 'No high-impact events in the immediate window' }
}
