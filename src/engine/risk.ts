import type {
  AccountConfig,
  Instrument,
  RiskCheck,
  RiskResult,
  ScanResult,
  TradePlan,
} from './types'

// ============================================================================
// RISK stage — "the risk system checks everything."
// Position size -> exposure -> drawdown -> volatility -> max loss.
// Any FAIL blocks the trade. This is what protects capital every decision.
// ============================================================================

export function runRisk(
  inst: Instrument,
  plan: TradePlan,
  scan: ScanResult,
  account: AccountConfig,
): RiskResult {
  const checks: RiskCheck[] = []
  const riskBudget = account.equity * account.riskPerTrade

  // ---- 1. Position size -----------------------------------------------------
  // contracts = risk budget / (stop distance in points * $ per point)
  const fullRiskPerContract = plan.stopDistance * inst.pointValue
  let useMicro = false
  let perContract = fullRiskPerContract
  let contracts = fullRiskPerContract > 0 ? Math.floor(riskBudget / fullRiskPerContract) : 0

  if (contracts < 1 && account.allowMicro && inst.micro) {
    useMicro = true
    perContract = plan.stopDistance * inst.micro.pointValue
    contracts = perContract > 0 ? Math.floor(riskBudget / perContract) : 0
  }

  const sizeOk = contracts >= 1
  checks.push({
    name: 'Position Size Check',
    ok: sizeOk,
    detail: sizeOk
      ? `${contracts} ${useMicro ? inst.micro!.symbol : inst.symbol} within ${(account.riskPerTrade * 100).toFixed(1)}% risk`
      : 'Stop too wide for account — size rounds to 0',
  })

  const dollarRisk = contracts * perContract
  const dollarReward = dollarRisk * plan.rr
  const riskPct = account.equity > 0 ? dollarRisk / account.equity : 0

  // ---- 2. Exposure limit ----------------------------------------------------
  // Single-trade exposure must stay within the portfolio risk cap.
  const exposureOk = riskPct <= account.maxPortfolioRisk + 1e-9
  checks.push({
    name: 'Exposure Limit Check',
    ok: exposureOk,
    detail: exposureOk
      ? `${(riskPct * 100).toFixed(2)}% ≤ ${(account.maxPortfolioRisk * 100).toFixed(1)}% cap`
      : `${(riskPct * 100).toFixed(2)}% exceeds portfolio cap`,
  })

  // ---- 3. Drawdown control --------------------------------------------------
  const ddOk = account.currentDrawdown < account.maxDrawdown
  checks.push({
    name: 'Drawdown Check',
    ok: ddOk,
    detail: ddOk
      ? `${(account.currentDrawdown * 100).toFixed(1)}% of ${(account.maxDrawdown * 100).toFixed(0)}% limit`
      : 'Max drawdown reached — trading paused',
  })

  // ---- 4. Volatility check --------------------------------------------------
  // Reject when ATR% is abnormally high (whipsaw) or dead (no follow-through).
  const volOk = scan.atrPct >= 0.12 && scan.atrPct <= 3.5
  checks.push({
    name: 'Volatility Check',
    ok: volOk,
    detail: `ATR ${scan.atrPct.toFixed(2)}% ${volOk ? 'acceptable' : scan.atrPct > 3.5 ? 'too high' : 'too low'}`,
  })

  // ---- 5. Max loss ----------------------------------------------------------
  // The per-trade dollar risk must not breach the daily loss allowance.
  const dailyLossCap = account.equity * account.maxDailyLoss
  const maxLossOk = dollarRisk <= dailyLossCap + 1e-9 && sizeOk
  checks.push({
    name: 'Max Loss Check',
    ok: maxLossOk,
    detail: maxLossOk
      ? `$${Math.round(dollarRisk).toLocaleString()} ≤ $${Math.round(dailyLossCap).toLocaleString()} daily cap`
      : 'Trade risk breaches daily loss cap',
  })

  const pass = checks.every((c) => c.ok)

  // Rating from realised risk fraction and volatility.
  let rating: RiskResult['rating'] = 'LOW'
  const rel = riskPct / Math.max(account.riskPerTrade, 1e-9)
  if (rel > 0.85 || scan.atrPct > 2.2) rating = 'HIGH'
  else if (rel > 0.5 || scan.atrPct > 1.2) rating = 'MODERATE'

  return {
    pass,
    rating,
    contracts,
    useMicro,
    dollarRisk: Math.round(dollarRisk),
    dollarReward: Math.round(dollarReward),
    riskPct,
    checks,
    maxLossWithinPlan: maxLossOk,
  }
}
