import type { Candle, Direction, ScanResult, SignalResult, SignalVote } from './types'
import {
  adx,
  bollinger,
  closes,
  ema,
  lastDefined,
  macd,
  rsi,
  stochastic,
} from './indicators'
import { detectSetup } from './setups'

// ============================================================================
// SIGNALS stage — build a directional confluence score.
//
// Philosophy behind the "higher success rate":
//  - Trade WITH the higher-timeframe trend, never against it (regime filter).
//  - Require CONFLUENCE: multiple independent indicators must agree before a
//    setup is graded STRONG. Any single indicator is noisy; agreement is not.
//  - Reward momentum + trend, penalise chasing extremes.
//  - Down-weight everything in a choppy (low-ADX) regime.
// ============================================================================

export function runSignals(scan: ScanResult, h1: Candle[]): SignalResult {
  const c = closes(h1)
  const price = c[c.length - 1]
  const votes: SignalVote[] = []

  // --- Trend structure: EMA stack (20 vs 50 vs 200) ---------------------------
  const ema20 = lastDefined(ema(c, 20))
  const ema50 = lastDefined(ema(c, 50))
  const ema200 = lastDefined(ema(c, Math.min(200, c.length - 1)))
  {
    let dir: Direction = 'FLAT'
    let label = 'mixed'
    if (price > ema20 && ema20 > ema50 && ema50 > ema200) {
      dir = 'LONG'
      label = 'stacked up'
    } else if (price < ema20 && ema20 < ema50 && ema50 < ema200) {
      dir = 'SHORT'
      label = 'stacked down'
    } else if (price > ema50) {
      dir = 'LONG'
      label = 'above 50'
    } else if (price < ema50) {
      dir = 'SHORT'
      label = 'below 50'
    }
    votes.push({ name: 'EMA Stack', value: label, direction: dir, weight: 0.22 })
  }

  // --- MACD momentum ----------------------------------------------------------
  {
    const m = macd(c)
    const hist = lastDefined(m.histogram)
    const line = lastDefined(m.macd)
    const dir: Direction = hist > 0 && line > 0 ? 'LONG' : hist < 0 && line < 0 ? 'SHORT' : hist > 0 ? 'LONG' : 'SHORT'
    votes.push({
      name: 'MACD',
      value: hist >= 0 ? 'bullish' : 'bearish',
      direction: Math.abs(hist) < 1e-9 ? 'FLAT' : dir,
      weight: 0.18,
    })
  }

  // --- RSI momentum / not-overextended ---------------------------------------
  {
    const r = lastDefined(rsi(c, 14))
    let dir: Direction = 'FLAT'
    let label = `${r.toFixed(0)}`
    if (r > 55 && r < 72) {
      dir = 'LONG'
      label = `${r.toFixed(0)} bull`
    } else if (r < 45 && r > 28) {
      dir = 'SHORT'
      label = `${r.toFixed(0)} bear`
    } else if (r >= 72) {
      dir = 'FLAT'
      label = `${r.toFixed(0)} overbought`
    } else if (r <= 28) {
      dir = 'FLAT'
      label = `${r.toFixed(0)} oversold`
    }
    votes.push({ name: 'RSI', value: label, direction: dir, weight: 0.15 })
  }

  // --- Stochastic (momentum turn, filtered to trend) -------------------------
  {
    const s = stochastic(h1)
    const k = lastDefined(s.k)
    let dir: Direction = 'FLAT'
    if (k > 50 && k < 85) dir = 'LONG'
    else if (k < 50 && k > 15) dir = 'SHORT'
    votes.push({
      name: 'Stochastic',
      value: `${k.toFixed(0)}`,
      direction: dir,
      weight: 0.1,
    })
  }

  // --- ADX / DI directional strength -----------------------------------------
  {
    const a = adx(h1, 14)
    const adxVal = lastDefined(a.adx)
    const plus = lastDefined(a.plusDI)
    const minus = lastDefined(a.minusDI)
    let dir: Direction = 'FLAT'
    if (adxVal >= 20) dir = plus > minus ? 'LONG' : 'SHORT'
    votes.push({
      name: 'ADX/DI',
      value: `${adxVal.toFixed(0)} ${plus > minus ? '+DI' : '-DI'}`,
      direction: dir,
      weight: 0.15,
    })
  }

  // --- Bollinger position (breakout vs fade) ---------------------------------
  {
    const b = bollinger(c, 20, 2)
    const upper = lastDefined(b.upper)
    const lower = lastDefined(b.lower)
    const mid = lastDefined(b.middle)
    let dir: Direction = 'FLAT'
    let label = 'inside'
    if (price > mid && price < upper) {
      dir = 'LONG'
      label = 'upper half'
    } else if (price < mid && price > lower) {
      dir = 'SHORT'
      label = 'lower half'
    } else if (price >= upper) {
      label = 'at upper band'
    } else if (price <= lower) {
      label = 'at lower band'
    }
    votes.push({ name: 'Bollinger', value: label, direction: dir, weight: 0.08 })
  }

  // --- Volume confirmation ---------------------------------------------------
  {
    // Volume can't vote a direction on its own — it confirms the current bar's
    // drive. Above-average volume backs the candle's direction; thin volume is
    // neutral.
    const last = h1[h1.length - 1]
    const barDir: Direction = last.close > last.open ? 'LONG' : last.close < last.open ? 'SHORT' : 'FLAT'
    const dir: Direction = scan.volumePct >= 115 ? barDir : 'FLAT'
    votes.push({
      name: 'Volume',
      value: `${scan.volumePct.toFixed(0)}% avg`,
      direction: dir,
      weight: 0.08,
    })
  }

  // --- Higher-timeframe alignment (the master filter) ------------------------
  votes.push({
    name: 'H4 Trend',
    value: scan.htfTrend.toLowerCase(),
    direction: scan.htfTrend,
    weight: 0.12,
  })

  // --- Aggregate into a net score -------------------------------------------
  let raw = 0
  let totalWeight = 0
  for (const v of votes) {
    totalWeight += v.weight
    if (v.direction === 'LONG') raw += v.weight
    else if (v.direction === 'SHORT') raw -= v.weight
  }
  let score = (raw / totalWeight) * 100 // -100..100

  // Regime dampening: agreement means less in chop.
  if (scan.regime === 'RANGING') score *= 0.6

  // Counter-trend penalty: fade the score if it fights the H4 trend.
  const dir: Direction = score > 8 ? 'LONG' : score < -8 ? 'SHORT' : 'FLAT'
  if (scan.htfTrend !== 'FLAT' && dir !== 'FLAT' && dir !== scan.htfTrend) {
    score *= 0.4
  }

  const mag = Math.abs(score)
  const finalDir: Direction = score > 8 ? 'LONG' : score < -8 ? 'SHORT' : 'FLAT'

  // Discrete strength stars 0..4, matching the memo's confidence rating.
  let stars = 0
  if (mag >= 20) stars = 1
  if (mag >= 35) stars = 2
  if (mag >= 50) stars = 3
  if (mag >= 65) stars = 4

  const strength: SignalResult['strength'] =
    mag >= 55 ? 'STRONG' : mag >= 32 ? 'MODERATE' : 'WEAK'

  // --- Detect + score the setup archetype (Signal Engine, page 3) -----------
  const setup = detectSetup(h1, scan)
  // A high-quality setup that agrees with the confluence direction lifts
  // confidence; one that disagrees (e.g. a counter-trend reversal) tempers it.
  const setupAgrees = setup.direction !== 'FLAT' && setup.direction === finalDir
  const setupConflicts = setup.direction !== 'FLAT' && finalDir !== 'FLAT' && setup.direction !== finalDir

  // Confidence blends magnitude, trend alignment, regime quality and setup.
  let confidence = mag
  if (scan.trendAligned) confidence += 12
  if (scan.regime === 'TRENDING') confidence += 8
  if (setupAgrees) confidence += setup.quality * 0.12
  if (setupConflicts) confidence -= 10
  confidence = Math.max(0, Math.min(99, Math.round(confidence)))

  return {
    direction: finalDir,
    score: Math.round(score),
    stars,
    strength,
    confidence,
    votes,
    setupType: finalDir === 'FLAT' ? 'NONE' : setup.type,
    setupQuality: setup.quality,
    setupNote: setup.note,
  }
}
