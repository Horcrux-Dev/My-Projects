import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AccountConfig, MonitorEvent, PipelineOutput } from './engine'
import {
  DEFAULT_ACCOUNT,
  INSTRUMENTS,
  SETUP_LABEL,
  SimulatedProvider,
  backtest,
  fmtPrice,
  runAll,
  simulateH1,
} from './engine'
import { DecisionMemoCard } from './components/DecisionMemo'
import { TradeChart } from './components/TradeChart'
import { DirBadge, Sparkline } from './components/ui'

const SYMBOLS = INSTRUMENTS.map((i) => i.symbol)
const MONITOR_MS = 4000

const PIPELINE = [
  { key: 'SCAN', glyph: '⊙' },
  { key: 'SIGNALS', glyph: '▮' },
  { key: 'PLAN', glyph: '✕' },
  { key: 'RISK', glyph: '⛊' },
  { key: 'MONITOR', glyph: '▦' },
  { key: 'VERDICT', glyph: '◎' },
]

export default function App() {
  const [account, setAccount] = useState<AccountConfig>(DEFAULT_ACCOUNT)
  const [seed, setSeed] = useState(1337)
  const [results, setResults] = useState<Record<string, PipelineOutput>>({})
  const [selected, setSelected] = useState('GC')
  const [monitoring, setMonitoring] = useState(false)
  const [events, setEvents] = useState<MonitorEvent[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(true)

  const providerRef = useRef(new SimulatedProvider(seed))
  const prevVerdicts = useRef<Record<string, string>>({})

  const compute = useCallback(
    async (s: number, acct: AccountConfig, announce: boolean) => {
      providerRef.current.setSeed(s)
      const out = await runAll(providerRef.current, acct, SYMBOLS, s)
      const map: Record<string, PipelineOutput> = {}
      const newEvents: MonitorEvent[] = []
      const now = Date.now()
      for (const o of out) {
        const sym = o.memo.instrument.symbol
        map[sym] = o
        const prev = prevVerdicts.current[sym]
        if (announce && prev && prev !== o.memo.verdict) {
          newEvents.push({
            time: now,
            symbol: sym,
            kind: o.memo.verdict,
            message: `${sym} → ${o.memo.verdict} · ${o.memo.signal.direction} ${o.memo.signal.stars}★ · ${o.memo.finalStatus}`,
          })
        } else if (announce && o.memo.verdict === 'APPROVED') {
          newEvents.push({
            time: now,
            symbol: sym,
            kind: 'SCAN',
            message: `${sym} setup live · entry ${fmtPrice(o.memo.plan.entry, o.memo.instrument)} · R:R 1:${o.memo.plan.rr.toFixed(2)}`,
          })
        }
        prevVerdicts.current[sym] = o.memo.verdict
      }
      setResults(map)
      if (newEvents.length) setEvents((e) => [...newEvents, ...e].slice(0, 60))
      setLoading(false)
    },
    [],
  )

  // Initial run.
  useEffect(() => {
    compute(seed, account, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recompute when account changes (no announce spam).
  useEffect(() => {
    compute(seed, account, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  // 24/7 monitor loop.
  useEffect(() => {
    if (!monitoring) return
    const id = setInterval(() => {
      setSeed((s) => {
        const ns = s + 1
        compute(ns, account, true)
        return ns
      })
    }, MONITOR_MS)
    return () => clearInterval(id)
  }, [monitoring, account, compute])

  const rescan = () => {
    const ns = seed + 1
    setSeed(ns)
    compute(ns, account, true)
    setEvents((e) =>
      [{ time: Date.now(), symbol: 'SYS', kind: 'SCAN' as const, message: 'Manual re-scan across all instruments' }, ...e].slice(0, 60),
    )
  }

  const current = results[selected]

  // Backtest for the selected instrument over a deep simulated history.
  const bt = useMemo(() => {
    if (!current) return null
    const inst = current.memo.instrument
    const longH1 = simulateH1(inst, 2000, seed)
    return backtest(inst, longH1, account)
  }, [current, seed, account])

  const approvedCount = Object.values(results).filter((r) => r.memo.verdict === 'APPROVED').length
  const watchCount = Object.values(results).filter((r) => r.memo.verdict === 'WATCHLIST').length

  return (
    <div className="frame">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      {/* Header */}
      <div className="flex between wrap" style={{ alignItems: 'flex-start' }}>
        <div className="stamp">
          <span className="k">Project:</span>
          <span className="v">24/7 AI Trader</span>
          <span className="k">Model:</span>
          <span className="v">Fable 5</span>
          <span className="k">System:</span>
          <span className="v">Decision Engine</span>
          <span className="k">Version:</span>
          <span className="v">1.0</span>
        </div>
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <span
            className="chip"
            style={{
              color: monitoring ? 'var(--green)' : 'var(--muted)',
              borderColor: monitoring ? 'var(--green)' : 'var(--line-strong)',
            }}
          >
            {monitoring && <span className="dot-live" style={{ marginRight: 6 }} />}
            {monitoring ? 'System Online 24/7' : 'System Idle'}
          </span>
        </div>
      </div>

      <h1 className="headline">
        One Market. <span className="accent">One Clear Decision.</span>
      </h1>
      <div className="subhead">
        Scan<span className="dot">.</span> Signals<span className="dot">.</span> Plan
        <span className="dot">.</span> Risk<span className="dot">.</span> Monitor
        <span className="dot">.</span> Verdict<span className="dot">.</span>
      </div>

      {/* Pipeline strip */}
      <div className="pipeline">
        {PIPELINE.map((p, i) => (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`pstep ${p.key === 'MONITOR' && monitoring ? 'active' : ''}`}>
              <span className="glyph accent">{p.glyph}</span>
              <span className="nm">{p.key}</span>
            </div>
            {i < PIPELINE.length - 1 && <span className="parrow">→</span>}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <span className="label">
          {approvedCount} Approved · {watchCount} Watch · {SYMBOLS.length - approvedCount - watchCount} Rejected
        </span>
      </div>

      {/* Controls */}
      <div className="controls">
        <div className="tabs">
          {INSTRUMENTS.map((inst) => {
            const r = results[inst.symbol]
            return (
              <button
                key={inst.symbol}
                className={`tab ${selected === inst.symbol ? 'active' : ''}`}
                onClick={() => setSelected(inst.symbol)}
              >
                <span>
                  {inst.symbol}
                  {r && (
                    <span style={{ color: verdictColor(r.memo.verdict), marginLeft: 6 }}>
                      {verdictGlyph(r.memo.verdict)}
                    </span>
                  )}
                </span>
                <small>{inst.name}</small>
              </button>
            )
          })}
        </div>

        <button
          className={`btn ${monitoring ? 'on' : ''}`}
          onClick={() => setMonitoring((m) => !m)}
        >
          {monitoring ? <><span className="dot-live" /> Monitoring 24/7</> : '▶ Start 24/7 Monitor'}
        </button>
        <button className="btn" onClick={rescan}>↻ Re-scan</button>
        <button className="btn" onClick={() => setShowSettings((s) => !s)}>
          ⚙ Risk Settings
        </button>
        <span className="label" style={{ marginLeft: 'auto' }}>Market seed #{seed}</span>
      </div>

      {showSettings && <AccountPanel account={account} onChange={setAccount} />}

      {loading || !current ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <span className="label">Running pipeline…</span>
        </div>
      ) : (
        <>
          <div className="grid main-grid">
            {/* Left column: memo */}
            <DecisionMemoCard memo={current.memo} />

            {/* Right column: chart + signals + risk */}
            <div className="grid" style={{ gap: 16 }}>
              <div className="card">
                <div className="card-head">
                  <h3><span className="idx">✕</span> TRADE PLAN · {current.memo.instrument.symbol}</h3>
                  <div className="flex" style={{ gap: 8 }}>
                    <DirBadge direction={current.memo.plan.direction} />
                    <span className="chip">4H / 1H</span>
                  </div>
                </div>
                <TradeChart candles={current.h1} plan={current.memo.plan} inst={current.memo.instrument} />
                <div className="statgrid mt">
                  <Stat n={current.memo.instrument.symbol} l={`Last ${fmtPrice(current.memo.scan.lastPrice, current.memo.instrument)}`} />
                  <Stat n={`${current.memo.scan.changePct >= 0 ? '+' : ''}${current.memo.scan.changePct.toFixed(2)}%`} l="Bar Change" />
                  <Stat n={`1:${current.memo.plan.rr.toFixed(2)}`} l="Reward : Risk" />
                </div>
              </div>

              <SignalPanel out={current} />
              <RiskPanel out={current} account={account} />
            </div>
          </div>

          {/* Second row: scan · backtest · monitor */}
          <div className="grid cols-3 mt">
            <ScanPanel out={current} />
            {bt && <BacktestPanel bt={bt} symbol={current.memo.instrument.symbol} />}
            <MonitorPanel events={events} results={results} onSelect={setSelected} monitoring={monitoring} />
          </div>
        </>
      )}

      {/* Disclaimer */}
      <div className="disclaimer">
        <b className="accent">DECISION-SUPPORT TOOL — NOT FINANCIAL ADVICE.</b> This engine produces
        research and a structured recommendation; <b>a human makes the final call on every trade</b>.
        It ships with a deterministic market <i>simulator</i> so all figures shown (including backtest
        statistics) are illustrative of the logic, not live results. Futures trading involves
        substantial risk of loss. Past and simulated performance never guarantees future results.
        Connect a live data + broker adapter before risking capital.
      </div>

      <div className="ruler">
        <span>00</span>
        <span>25</span>
        <span>50 — 24/7 AI TRADER · FUTURES DECISION ENGINE</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- panels

function SignalPanel({ out }: { out: PipelineOutput }) {
  const s = out.memo.signal
  return (
    <div className="card">
      <div className="card-head">
        <h3><span className="idx">▮</span> SIGNALS · CONFLUENCE</h3>
        <span className="chip" style={{ color: 'var(--orange)' }}>
          {s.strength} · {s.confidence}%
        </span>
      </div>
      {s.setupType !== 'NONE' && (
        <div
          className="flex between"
          style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed var(--line)' }}
        >
          <div>
            <div className="label" style={{ marginBottom: 2 }}>Setup Flagged</div>
            <b className="mono" style={{ fontSize: 13, color: 'var(--orange)' }}>
              ◎ {SETUP_LABEL[s.setupType].toUpperCase()}
            </b>
            <div className="label" style={{ fontSize: 9.5, marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>
              {s.setupNote}
            </div>
          </div>
          <span className="chip">Q {s.setupQuality}</span>
        </div>
      )}
      {s.votes.map((v) => (
        <div key={v.name} className="vote">
          <span className="nm">{v.name}</span>
          <span className="val">{v.value}</span>
          <DirBadge direction={v.direction} />
        </div>
      ))}
      <div className="drow mt">
        <span className="k">Net Score</span>
        <span className="v" style={{ color: s.score > 0 ? 'var(--green)' : s.score < 0 ? 'var(--red)' : undefined }}>
          {s.score > 0 ? '+' : ''}{s.score}
        </span>
      </div>
    </div>
  )
}

function RiskPanel({ out, account }: { out: PipelineOutput; account: AccountConfig }) {
  const r = out.memo.risk
  return (
    <div className="card">
      <div className="card-head">
        <h3><span className="idx">⛊</span> RISK MODULE</h3>
        <span
          className="pill"
          style={{
            color: '#fff',
            background: r.pass ? 'var(--green)' : 'var(--red)',
            borderColor: r.pass ? 'var(--green)' : 'var(--red)',
          }}
        >
          {r.pass ? 'PASS → CONTINUE' : 'FAIL → BLOCK'}
        </span>
      </div>
      {r.checks.map((c) => (
        <div key={c.name} className={`check ${c.ok ? 'ok' : 'bad'}`}>
          <span className="mk">{c.ok ? '✓' : '✕'}</span>
          <span className="nm">{c.name}</span>
          <span className="st">{c.detail}</span>
        </div>
      ))}
      <div className="statgrid mt">
        <Stat n={`${r.contracts}${r.useMicro ? 'μ' : ''}`} l={`${r.useMicro ? out.memo.instrument.micro?.symbol : out.memo.instrument.symbol} Size`} />
        <Stat n={`$${r.dollarRisk.toLocaleString()}`} l={`Risk · ${(account.riskPerTrade * 100).toFixed(1)}%`} />
        <Stat n={`$${r.dollarReward.toLocaleString()}`} l="Reward @ Target" />
      </div>
    </div>
  )
}

function ScanPanel({ out }: { out: PipelineOutput }) {
  const s = out.memo.scan
  const eventColor = s.eventRisk === 'HIGH' ? 'var(--red)' : s.eventRisk === 'ELEVATED' ? 'var(--orange)' : 'var(--green)'
  // Page-2 scanner inputs, each with a live read.
  const inputs: [string, string, string][] = [
    ['Price', `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, 'var(--ink-2)'],
    ['Volume', `${s.volumePct.toFixed(0)}%`, s.volumePct >= 115 ? 'var(--orange)' : 'var(--ink-2)'],
    ['Trend', s.htfTrend, s.htfTrend === 'LONG' ? 'var(--green)' : s.htfTrend === 'SHORT' ? 'var(--red)' : 'var(--muted)'],
    ['News', s.eventRisk, eventColor],
  ]
  return (
    <div className="card">
      <h3><span className="idx">⊙</span> SCAN · MARKET SCANNER</h3>
      <div className="flex wrap" style={{ gap: 6, marginBottom: 10 }}>
        {inputs.map(([k, v, c]) => (
          <span key={k} className="chip" style={{ color: c, borderColor: c }}>
            {k}: {v}
          </span>
        ))}
      </div>
      <div className="drow"><span className="k">Instrument</span><span className="v">{s.instrument.symbol} · {s.instrument.name}</span></div>
      <div className="drow"><span className="k">Last Price</span><span className="v">{fmtPrice(s.lastPrice, s.instrument)}</span></div>
      <div className="drow"><span className="k">Regime</span><span className="v" style={{ color: s.regime === 'TRENDING' ? 'var(--orange)' : undefined }}>{s.regime}</span></div>
      <div className="drow"><span className="k">ADX (trend str.)</span><span className="v">{s.adx.toFixed(1)}</span></div>
      <div className="drow"><span className="k">ATR / Volatility</span><span className="v">{s.atrPct.toFixed(2)}%</span></div>
      <div className="drow"><span className="k">Volume vs Avg</span><span className="v" style={{ color: s.volumePct >= 115 ? 'var(--orange)' : undefined }}>{s.volumePct.toFixed(0)}%</span></div>
      <div className="drow"><span className="k">H4 / H1 Trend</span><span className="v"><DirBadge direction={s.htfTrend} /> <DirBadge direction={s.ltfTrend} /></span></div>
      <div className="drow"><span className="k">Aligned</span><span className="v" style={{ color: s.trendAligned ? 'var(--green)' : 'var(--red)' }}>{s.trendAligned ? 'YES' : 'NO'}</span></div>
      <div className="drow"><span className="k">Event / News Risk</span><span className="v" style={{ color: eventColor }}>{s.eventRisk}</span></div>
      {s.eventRisk !== 'CLEAR' && (
        <div className="label" style={{ fontSize: 9.5, marginTop: 6, textTransform: 'none', letterSpacing: 0, color: eventColor }}>
          {s.eventNote}
        </div>
      )}
    </div>
  )
}

function BacktestPanel({ bt, symbol }: { bt: ReturnType<typeof backtest>; symbol: string }) {
  const st = bt.stats
  const pf = st.profitFactor === Infinity ? '∞' : st.profitFactor.toFixed(2)
  return (
    <div className="card">
      <div className="card-head">
        <h3><span className="idx">▤</span> BACKTEST · {symbol}</h3>
        <span className="chip">Simulated · {st.trades} trades</span>
      </div>
      <Sparkline data={st.equityCurve.length ? st.equityCurve : [0, 0]} width={320} height={70} zeroLine />
      <div className="label" style={{ marginTop: 2 }}>Cumulative R · equity curve</div>
      <div className="statgrid mt">
        <Stat n={`${st.winRate.toFixed(0)}%`} l="Win Rate" />
        <Stat n={`${st.expectancy >= 0 ? '+' : ''}${st.expectancy.toFixed(2)}R`} l="Expectancy" />
        <Stat n={pf} l="Profit Factor" />
        <Stat n={`${st.netR >= 0 ? '+' : ''}${st.netR.toFixed(1)}R`} l="Net Result" />
        <Stat n={`${st.wins}/${st.losses}`} l="Win / Loss" />
        <Stat n={`${st.maxConsecLosses}`} l="Max Consec. L" />
      </div>
    </div>
  )
}

function MonitorPanel({
  events,
  results,
  onSelect,
  monitoring,
}: {
  events: MonitorEvent[]
  results: Record<string, PipelineOutput>
  onSelect: (s: string) => void
  monitoring: boolean
}) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <span className="idx">▦</span> MONITOR · WATCHLIST
        </h3>
        <span className="chip" style={{ color: monitoring ? 'var(--green)' : 'var(--muted)' }}>
          {monitoring ? 'LOOP ACTIVE' : 'PAUSED'}
        </span>
      </div>

      {INSTRUMENTS.map((inst) => {
        const r = results[inst.symbol]
        if (!r) return null
        return (
          <div key={inst.symbol} className="wl" onClick={() => onSelect(inst.symbol)}>
            <span className="sym">{inst.symbol}</span>
            <div>
              <div className="nm">{inst.name}</div>
              <div className="label" style={{ fontSize: 9 }}>
                {r.memo.signal.direction} · {r.memo.signal.stars}★ · 1:{r.memo.plan.rr.toFixed(2)}
              </div>
            </div>
            <span className="mono" style={{ fontSize: 11 }}>{fmtPrice(r.memo.scan.lastPrice, inst)}</span>
            <span className={`pill ${r.memo.verdict}`}>{r.memo.verdict}</span>
          </div>
        )
      })}

      <div className="label" style={{ margin: '14px 0 6px' }}>Event Feed</div>
      <div className="feed">
        {events.length === 0 && <span className="label">No events yet — start the 24/7 monitor.</span>}
        {events.map((e, i) => (
          <div key={i} className="event">
            <span className="tm">{new Date(e.time).toLocaleTimeString('en-US', { hour12: false })}</span>
            <span className={`kd ${e.kind}`}>{e.kind}</span>
            <span>{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AccountPanel({ account, onChange }: { account: AccountConfig; onChange: (a: AccountConfig) => void }) {
  const set = (patch: Partial<AccountConfig>) => onChange({ ...account, ...patch })
  return (
    <div className="card mt">
      <h3><span className="idx">⚙</span> ACCOUNT & RISK SETTINGS</h3>
      <div className="grid cols-3">
        <NumField label="Account Equity ($)" value={account.equity} step={1000} onChange={(v) => set({ equity: v })} />
        <PctField label="Risk Per Trade" value={account.riskPerTrade} onChange={(v) => set({ riskPerTrade: v })} hint="% of equity risked per trade" />
        <PctField label="Max Portfolio Risk" value={account.maxPortfolioRisk} onChange={(v) => set({ maxPortfolioRisk: v })} hint="cap on single-trade exposure" />
        <PctField label="Max Daily Loss" value={account.maxDailyLoss} onChange={(v) => set({ maxDailyLoss: v })} hint="daily stop" />
        <PctField label="Current Drawdown" value={account.currentDrawdown} onChange={(v) => set({ currentDrawdown: v })} hint="from equity peak" max={0.3} />
        <PctField label="Max Drawdown" value={account.maxDrawdown} onChange={(v) => set({ maxDrawdown: v })} hint="hard trading halt" max={0.4} />
        <NumField label="Min Reward:Risk" value={account.minRR} step={0.1} onChange={(v) => set({ minRR: v })} hint="reject setups below this" />
        <div className="field">
          <label>Allow Micro Contracts</label>
          <button className={`btn ${account.allowMicro ? 'on' : ''}`} onClick={() => set({ allowMicro: !account.allowMicro })}>
            {account.allowMicro ? 'ENABLED (MGC/MNQ/MES/SIL)' : 'DISABLED'}
          </button>
          <span className="hint">use micros when full-size rounds to zero</span>
        </div>
      </div>
    </div>
  )
}

function NumField({ label, value, onChange, step = 1, hint }: { label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

function PctField({ label, value, onChange, hint, max = 0.1 }: { label: string; value: number; onChange: (v: number) => void; hint?: string; max?: number }) {
  return (
    <div className="field">
      <label>{label} · {(value * 100).toFixed(1)}%</label>
      <input type="range" min={0} max={max} step={0.001} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  )
}

function verdictColor(v: string) {
  return v === 'APPROVED' ? 'var(--green)' : v === 'WATCHLIST' ? 'var(--orange)' : 'var(--muted)'
}
function verdictGlyph(v: string) {
  return v === 'APPROVED' ? '✓' : v === 'WATCHLIST' ? '◉' : '✕'
}
