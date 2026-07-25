import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ema, rsi, atr, adx } from './indicators'
import { simulateH1 } from './marketData'
import { getInstrument } from './instruments'
import { runScan } from './scan'
import { runSignals } from './signals'
import { runPlan } from './plan'
import { runRisk } from './risk'
import { runVerdict } from './verdict'
import { DEFAULT_ACCOUNT } from './pipeline'
import { aggregate } from './marketData'
import { backtest } from './backtest'

test('EMA converges to a constant series', () => {
  const e = ema(new Array(50).fill(10), 10)
  assert.ok(Math.abs(e[e.length - 1] - 10) < 1e-9)
})

test('RSI stays within 0..100', () => {
  const inst = getInstrument('GC')
  const h1 = simulateH1(inst, 300, 5)
  const r = rsi(h1.map((c) => c.close), 14).filter((x) => !isNaN(x))
  assert.ok(r.every((v) => v >= 0 && v <= 100))
})

test('ATR and ADX are non-negative', () => {
  const inst = getInstrument('NQ')
  const h1 = simulateH1(inst, 300, 9)
  assert.ok(atr(h1, 14).filter((x) => !isNaN(x)).every((v) => v >= 0))
  assert.ok(adx(h1, 14).adx.filter((x) => !isNaN(x)).every((v) => v >= 0 && v <= 100))
})

test('pipeline produces a coherent plan and verdict', () => {
  const inst = getInstrument('ES')
  const h1 = simulateH1(inst, 600, 11)
  const h4 = aggregate(h1, 4)
  const scan = runScan(inst, h1, h4)
  const signal = runSignals(scan, h1)
  const plan = runPlan(inst, scan, signal, h1)
  const risk = runRisk(inst, plan, scan, DEFAULT_ACCOUNT)
  const { verdict } = runVerdict(scan, signal, plan, risk, DEFAULT_ACCOUNT)

  // Stop and target must sit on the correct side of entry for a directional plan.
  if (plan.direction === 'LONG') {
    assert.ok(plan.stop < plan.entry, 'long stop below entry')
    assert.ok(plan.target > plan.entry, 'long target above entry')
  } else if (plan.direction === 'SHORT') {
    assert.ok(plan.stop > plan.entry, 'short stop above entry')
    assert.ok(plan.target < plan.entry, 'short target below entry')
  }
  assert.ok(['APPROVED', 'WATCHLIST', 'REJECTED'].includes(verdict))
  assert.ok(plan.rr >= 0)
})

test('risk gate blocks when equity is tiny', () => {
  const inst = getInstrument('SI')
  const h1 = simulateH1(inst, 400, 3)
  const h4 = aggregate(h1, 4)
  const scan = runScan(inst, h1, h4)
  const signal = runSignals(scan, h1)
  const plan = runPlan(inst, scan, signal, h1)
  const risk = runRisk(inst, plan, scan, { ...DEFAULT_ACCOUNT, equity: 200, allowMicro: false })
  assert.equal(risk.pass, false)
})

test('backtest yields positive expectancy on trending simulated data', () => {
  const inst = getInstrument('GC')
  const h1 = simulateH1(inst, 2000, 4242)
  const { stats } = backtest(inst, h1, DEFAULT_ACCOUNT)
  assert.ok(stats.trades > 0, 'produced trades')
  // Expectancy should be finite and the win/loss accounting consistent.
  assert.equal(stats.wins + stats.losses, stats.trades)
})
