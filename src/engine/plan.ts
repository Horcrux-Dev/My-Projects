import type { Candle, Instrument, ScanResult, SignalResult, TradePlan } from './types'
import { atr, lastDefined, swings } from './indicators'
import { roundToTick } from './instruments'

// ============================================================================
// PLAN stage — turn a directional signal into a concrete trade plan:
// entry zone, structure-based stop, target at the next key level, R:R.
// ============================================================================

export function runPlan(
  inst: Instrument,
  scan: ScanResult,
  signal: SignalResult,
  h1: Candle[],
): TradePlan {
  const price = scan.lastPrice
  const atrVal = lastDefined(atr(h1, 14)) || price * 0.005
  const dir = signal.direction
  const { swingHighs, swingLows } = swings(h1, 3)

  // Entry zone: a pullback band toward value, half an ATR deep.
  const band = atrVal * 0.5
  let entryLow: number
  let entryHigh: number
  if (dir === 'LONG') {
    entryHigh = price
    entryLow = price - band
  } else if (dir === 'SHORT') {
    entryLow = price
    entryHigh = price + band
  } else {
    entryLow = price - band
    entryHigh = price + band
  }
  const entry = (entryLow + entryHigh) / 2

  // Stop: beyond the most recent opposing swing, buffered by 0.5 ATR,
  // but never tighter than 1 ATR (avoids noise stop-outs).
  const recentLow = swingLows.length
    ? swingLows[swingLows.length - 1].price
    : Math.min(...h1.slice(-20).map((c) => c.low))
  const recentHigh = swingHighs.length
    ? swingHighs[swingHighs.length - 1].price
    : Math.max(...h1.slice(-20).map((c) => c.high))

  // Stop sits beyond structure (buffered by 0.5 ATR) but never tighter than
  // 1 ATR (noise) nor wider than 2.5 ATR. If structure is further than the cap,
  // the swing is treated as too distant and a mechanical 2 ATR stop is used —
  // this keeps risk bounded and the R:R realistic.
  const maxStopDist = atrVal * 2.5
  let stop: number
  let invalidation: number
  if (dir === 'SHORT') {
    const structural = Math.max(recentHigh + atrVal * 0.5, entry + atrVal)
    stop = structural - entry > maxStopDist ? entry + atrVal * 2 : structural
    invalidation = recentHigh + atrVal * 0.75
  } else {
    // default LONG-style geometry for LONG and FLAT
    const structural = Math.min(recentLow - atrVal * 0.5, entry - atrVal)
    stop = entry - structural > maxStopDist ? entry - atrVal * 2 : structural
    invalidation = recentLow - atrVal * 0.75
  }

  const stopDistance = Math.abs(entry - stop)

  // Target: the next structural level in the trade direction, else a 2R
  // projection. Take whichever yields the better realistic reward.
  let target: number
  if (dir === 'SHORT') {
    const below = swingLows
      .map((s) => s.price)
      .filter((p) => p < entry - stopDistance * 0.8)
      .sort((a, b) => b - a)[0]
    const structural = below ?? entry - stopDistance * 2
    target = Math.min(structural, entry - stopDistance * 2)
  } else {
    const above = swingHighs
      .map((s) => s.price)
      .filter((p) => p > entry + stopDistance * 0.8)
      .sort((a, b) => a - b)[0]
    const structural = above ?? entry + stopDistance * 2
    target = Math.max(structural, entry + stopDistance * 2)
  }

  const targetDistance = Math.abs(target - entry)
  const rr = stopDistance > 0 ? targetDistance / stopDistance : 0

  const priceInEntryZone = price >= entryLow && price <= entryHigh

  return {
    direction: dir,
    entry: roundToTick(entry, inst),
    entryLow: roundToTick(entryLow, inst),
    entryHigh: roundToTick(entryHigh, inst),
    stop: roundToTick(stop, inst),
    target: roundToTick(target, inst),
    invalidation: roundToTick(invalidation, inst),
    rr: Number(rr.toFixed(2)),
    stopDistance,
    targetDistance,
    timeframe: 'H1 / H4',
    priceInEntryZone,
  }
}
