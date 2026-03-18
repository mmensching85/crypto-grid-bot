"use client";
import { useState, useRef } from "react";
import {
  PRICE_FETCH_PROMPT, CONFIG_GEN_PROMPT,
  ALLOCATOR_PROMPT, GOAL_SCAN_PROMPT, GOAL_CONFIG_PROMPT,
} from "@/lib/prompts";

// ── TYPES ─────────────────────────────────────────────────────────────────────
type Provider = "claude" | "gemini" | "grok" | "openai";
interface Config {
  gridCount: number; upperPrice: number; lowerPrice: number; capitalPerGrid: number;
  estimatedMonthlyROI: string; netMonthlyROI: string; stopLoss: number; takeProfit: number;
  gridSpacing: string; gridSpacingPct: number; gridType: string; gridTypeReason: string;
  estMonthlyTrades: number; estMonthlyFees: number; healthScore: number;
  healthBreakdown: { spacingVsFees: number; rangeVsVolatility: number; capitalPerGridScore: number; stopLossScore: number };
  breakEvenTrades: number; breakEvenDays: number; historicalRangeFit: string; historicalRangePct: number;
  rebalanceThresholdPct: number; rebalanceSuggestion: string;
  riskLevel: string; marketCondition: string; reasoning: string; warnings: string[]; tips: string[];
}
interface Range { label: string; upperPrice: number; lowerPrice: number; rangePercent: string; description: string; }
interface Result {
  coin: string; currentPrice: number; change24h: number; change7d: number;
  weekHigh: number; weekLow: number; atrPct: number; priceSource: string;
  sparkline: number[]; suggestedRanges: Range[];
  configs: { Conservative: Config; Moderate: Config; Aggressive: Config };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmtPrice = (p: number | undefined | null): string => {
  if (!p && p !== 0) return "—";
  if (p < 0.0001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(3);
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const changeColor = (v: number | undefined) => !v ? "#4a6a4a" : v > 0 ? "#00ff87" : "#ff4444";
const PIONEX_FEE_RT = 0.001;

const PROVIDERS: { id: Provider; label: string; model: string; color: string }[] = [
  { id: "claude", label: "Claude", model: "Sonnet 4", color: "#cc785c" },
  { id: "gemini", label: "Gemini", model: "2.0 Flash", color: "#4285f4" },
  { id: "grok",   label: "Grok",   model: "3",         color: "#1da1f2" },
  { id: "openai", label: "GPT",    model: "4o",         color: "#10a37f" },
];

// ── COMPONENTS ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, accent, sub }: { label: string; value: React.ReactNode; accent?: string; sub?: string }) => (
  <div style={{ background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "8px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
    <span style={{ color: "#4a6a4a", fontSize: "10px", fontFamily: "'Space Mono',monospace", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
    <span style={{ color: accent || "#e8ffe8", fontSize: "16px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{value}</span>
    {sub && <span style={{ color: "#3a5a3a", fontSize: "10px" }}>{sub}</span>}
  </div>
);

const RiskBadge = ({ level }: { level: string }) => {
  const c = { Low: { bg: "#0d2b1a", text: "#00ff87", border: "#00ff87" }, Medium: { bg: "#2b1f0d", text: "#ffaa00", border: "#ffaa00" }, High: { bg: "#2b0d0d", text: "#ff4444", border: "#ff4444" } }[level] || { bg: "#2b1f0d", text: "#ffaa00", border: "#ffaa00" };
  return <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: "2px 10px", borderRadius: "4px", fontSize: "11px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{level} Risk</span>;
};

const GridTypeBadge = ({ type }: { type: string }) => {
  const isGeo = type === "geometric";
  return <span style={{ background: isGeo ? "#1a0f2e" : "#0d1a2e", color: isGeo ? "#a78bfa" : "#60a5fa", border: `1px solid ${isGeo ? "#a78bfa" : "#60a5fa"}`, padding: "2px 10px", borderRadius: "4px", fontSize: "11px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{isGeo ? "% GEOMETRIC" : "≡ ARITHMETIC"}</span>;
};

const Sparkline = ({ data, upperPrice, lowerPrice, currentPrice }: { data: number[]; upperPrice?: number; lowerPrice?: number; currentPrice: number }) => {
  if (!data || data.length < 2) return null;
  const W = 552, H = 120, PAD = 8;
  const allP = [...data, upperPrice, lowerPrice].filter(Boolean) as number[];
  const minP = Math.min(...allP) * 0.995, maxP = Math.max(...allP) * 1.005;
  const rng = maxP - minP || 1;
  const toY = (p: number) => PAD + (H - PAD * 2) * (1 - (p - minP) / rng);
  const toX = (i: number) => PAD + (W - PAD * 2) * (i / (data.length - 1));
  const pathD = data.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(" ");
  const areaD = pathD + ` L${toX(data.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`;
  const up = upperPrice ? toY(upperPrice) : null;
  const lo = lowerPrice ? toY(lowerPrice) : null;
  const cp = toY(currentPrice);
  const lineColor = data[data.length - 1] >= data[0] ? "#00ff87" : "#ff4444";
  return (
    <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "16px 24px 20px" }}>
      <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "10px" }}>7-DAY PRICE CHART & GRID RANGE</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {up !== null && lo !== null && <rect x={PAD} y={up} width={W - PAD * 2} height={lo - up} fill="#00ff8708" />}
        {up !== null && <g><line x1={PAD} y1={up} x2={W - PAD} y2={up} stroke="#00ff87" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" /><text x={W - PAD + 4} y={up + 4} fill="#00ff87" fontSize="9" fontFamily="Space Mono,monospace">↑ ${fmtPrice(upperPrice)}</text></g>}
        {lo !== null && <g><line x1={PAD} y1={lo} x2={W - PAD} y2={lo} stroke="#ff6644" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" /><text x={W - PAD + 4} y={lo + 4} fill="#ff6644" fontSize="9" fontFamily="Space Mono,monospace">↓ ${fmtPrice(lowerPrice)}</text></g>}
        <path d={areaD} fill="url(#ag)" />
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={toX(data.length - 1)} cy={cp} r="4" fill={lineColor} />
        <circle cx={toX(data.length - 1)} cy={cp} r="8" fill={lineColor} opacity="0.2" />
        {["7d ago", "6d", "5d", "4d", "3d", "2d", "now"].map((l, i) => (
          <text key={i} x={toX(i)} y={H + 14} fill="#2a3a2a" fontSize="8" fontFamily="Space Mono,monospace" textAnchor="middle">{l}</text>
        ))}
      </svg>
    </div>
  );
};

const HealthScore = ({ config }: { config: Config }) => {
  if (!config?.healthScore) return null;
  const score = config.healthScore;
  const color = score >= 75 ? "#00ff87" : score >= 50 ? "#ffaa00" : "#ff4444";
  const label = score >= 75 ? "EXCELLENT" : score >= 60 ? "GOOD" : score >= 40 ? "FAIR" : "POOR";
  const bd = config.healthBreakdown || { spacingVsFees: 0, rangeVsVolatility: 0, capitalPerGridScore: 0, stopLossScore: 0 };
  const segments = [
    { label: "Spacing vs Fees", value: bd.spacingVsFees, max: 25 },
    { label: "Range vs Volatility", value: bd.rangeVsVolatility, max: 25 },
    { label: "Capital/Grid", value: bd.capitalPerGridScore, max: 25 },
    { label: "Stop Loss Buffer", value: bd.stopLossScore, max: 25 },
  ];
  return (
    <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "16px 24px" }}>
      <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "12px" }}>BOT HEALTH SCORE</div>
      <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "14px" }}>
        <div style={{ position: "relative", width: "70px", height: "70px", flexShrink: 0 }}>
          <svg viewBox="0 0 36 36" style={{ width: "70px", height: "70px", transform: "rotate(-90deg)" }}>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1a2a1a" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${(score / 100) * 100} 100`} strokeLinecap="round" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color, fontSize: "16px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{score}</span>
          </div>
        </div>
        <div>
          <div style={{ color, fontSize: "13px", fontFamily: "'Space Mono',monospace", fontWeight: 700, marginBottom: "4px" }}>{label}</div>
          <div style={{ color: "#4a6a4a", fontSize: "11px", lineHeight: 1.5 }}>Based on spacing efficiency, volatility match, capital sizing, and risk buffers.</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {segments.map(s => (
          <div key={s.label} style={{ background: "#0a0f0a", borderRadius: "6px", padding: "8px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ color: "#4a6a4a", fontSize: "9px" }}>{s.label.toUpperCase()}</span>
              <span style={{ color: s.value >= 20 ? "#00ff87" : s.value >= 12 ? "#ffaa00" : "#ff4444", fontSize: "10px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{s.value}/{s.max}</span>
            </div>
            <div style={{ height: "3px", background: "#1a2a1a", borderRadius: "2px" }}>
              <div style={{ height: "3px", borderRadius: "2px", background: s.value >= 20 ? "#00ff87" : s.value >= 12 ? "#ffaa00" : "#ff4444", width: `${(s.value / s.max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BreakEvenPanel = ({ config }: { config: Config }) => {
  if (!config?.breakEvenTrades) return null;
  const progressPct = Math.min(((config.estMonthlyTrades || 1) / config.breakEvenTrades) * 100, 100);
  return (
    <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "16px 24px" }}>
      <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "12px" }}>BREAK-EVEN CALCULATOR</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
        {[
          { label: "Break-Even Trades", value: config.breakEvenTrades, accent: "#ffaa00" },
          { label: "Est. Days to B/E", value: `~${Math.round(config.breakEvenDays || 0)}d`, accent: "#ffaa00" },
          { label: "Monthly Trades Est", value: config.estMonthlyTrades, accent: "#a0c0a0" },
        ].map(({ label, value, accent }) => (
          <div key={label} style={{ background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "6px", padding: "10px 12px" }}>
            <div style={{ color: "#4a6a4a", fontSize: "9px", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
            <div style={{ color: accent, fontSize: "15px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ color: "#4a6a4a", fontSize: "10px" }}>Monthly progress toward break-even</span>
        <span style={{ color: "#ffaa00", fontSize: "10px", fontFamily: "'Space Mono',monospace" }}>{Math.round(progressPct)}%</span>
      </div>
      <div style={{ height: "6px", background: "#1a2a1a", borderRadius: "3px" }}>
        <div style={{ height: "6px", borderRadius: "3px", background: "linear-gradient(90deg,#ffaa00,#00ff87)", width: `${progressPct}%` }} />
      </div>
    </div>
  );
};

const RebalanceAlert = ({ config, currentPrice }: { config: Config; currentPrice: number }) => {
  if (!config?.rebalanceThresholdPct) return null;
  const triggerUp = config.upperPrice * (1 + config.rebalanceThresholdPct / 100);
  const triggerDown = config.lowerPrice * (1 - config.rebalanceThresholdPct / 100);
  const inRange = currentPrice >= config.lowerPrice && currentPrice <= config.upperPrice;
  const nearUp = currentPrice >= config.upperPrice * 0.95;
  const nearDown = currentPrice <= config.lowerPrice * 1.05;
  const alertColor = !inRange ? "#ff4444" : nearUp || nearDown ? "#ffaa00" : "#00ff87";
  const alertMsg = !inRange ? "PRICE OUT OF RANGE — rebalance recommended" : nearUp ? "PRICE NEAR UPPER BOUND — monitor closely" : nearDown ? "PRICE NEAR LOWER BOUND — monitor closely" : "PRICE IN RANGE — bot running optimally";
  return (
    <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "16px 24px" }}>
      <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "12px" }}>REBALANCE ALERT THRESHOLDS</div>
      <div style={{ background: `${alertColor}12`, border: `1px solid ${alertColor}40`, borderRadius: "6px", padding: "10px 14px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: alertColor, flexShrink: 0 }} />
        <span style={{ color: alertColor, fontSize: "11px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{alertMsg}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
        {[
          { label: "Rebalance if price ↑ to", value: `$${fmtPrice(triggerUp)}`, accent: "#ff6644" },
          { label: "Rebalance if price ↓ to", value: `$${fmtPrice(triggerDown)}`, accent: "#60a5fa" },
          { label: "Threshold", value: `±${config.rebalanceThresholdPct}% beyond range`, accent: "#a0a0a0" },
          { label: "Status", value: inRange ? "In Range" : "Out of Range", accent: inRange ? "#00ff87" : "#ff4444" },
        ].map(({ label, value, accent }) => (
          <div key={label} style={{ background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "6px", padding: "10px 12px" }}>
            <div style={{ color: "#4a6a4a", fontSize: "9px", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
            <div style={{ color: accent, fontSize: "12px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
      {config.rebalanceSuggestion && <div style={{ color: "#6a8a6a", fontSize: "11px", lineHeight: 1.6, paddingLeft: "10px", borderLeft: "2px solid #2a4a2a" }}>{config.rebalanceSuggestion}</div>}
    </div>
  );
};

const HistoricalFit = ({ config }: { config: Config }) => {
  if (!config?.historicalRangePct) return null;
  const pct = config.historicalRangePct;
  const color = pct >= 70 ? "#00ff87" : pct >= 50 ? "#ffaa00" : "#ff4444";
  return (
    <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "16px 24px" }}>
      <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "12px" }}>HISTORICAL RANGE FIT (Est. 30-Day)</div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "10px" }}>
        <div style={{ flex: 1, height: "10px", background: "#1a2a1a", borderRadius: "5px", overflow: "hidden" }}>
          <div style={{ height: "10px", borderRadius: "5px", background: `linear-gradient(90deg,${color}88,${color})`, width: `${pct}%` }} />
        </div>
        <span style={{ color, fontSize: "18px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{pct}%</span>
        <span style={{ color, fontSize: "11px" }}>{pct >= 75 ? "Strong" : pct >= 55 ? "Moderate" : "Weak"} Fit</span>
      </div>
      <div style={{ color: "#6a8a6a", fontSize: "11px", lineHeight: 1.6 }}>{config.historicalRangeFit}</div>
      {pct < 55 && <div style={{ marginTop: "8px", color: "#c07070", fontSize: "11px", paddingLeft: "10px", borderLeft: "2px solid #ff444440" }}>⚠ Low fit — bot may pause frequently. Consider widening range.</div>}
    </div>
  );
};

const ComparisonTable = ({ configs }: { configs: Result["configs"] }) => {
  const labels = ["Conservative", "Moderate", "Aggressive"] as const;
  const lc = { Conservative: "#00ff87", Moderate: "#ffdd00", Aggressive: "#ff6644" };
  const rows = [
    { key: "gridCount", label: "Grid Count" },
    { key: "estimatedMonthlyROI", label: "Gross ROI/mo" },
    { key: "netMonthlyROI", label: "Net ROI/mo", accent: true },
    { key: "estMonthlyFees", label: "Fees/mo", fmt: (v: number) => `$${Number(v).toFixed(2)}`, feeCol: true },
    { key: "healthScore", label: "Health", fmt: (v: number) => `${v}/100` },
    { key: "breakEvenDays", label: "Break-Even", fmt: (v: number) => `~${Math.round(v)}d` },
    { key: "historicalRangePct", label: "30d Fit", fmt: (v: number) => `${v}%` },
    { key: "gridType", label: "Spacing", fmt: (v: string) => v === "geometric" ? "% Geo" : "≡ Arith" },
    { key: "gridSpacing", label: "Grid Spacing" },
    { key: "upperPrice", label: "Upper", fmt: (v: number) => `$${fmtPrice(v)}` },
    { key: "lowerPrice", label: "Lower", fmt: (v: number) => `$${fmtPrice(v)}` },
    { key: "capitalPerGrid", label: "Cap/Grid", fmt: (v: number) => `$${Number(v).toFixed(2)}` },
    { key: "stopLoss", label: "Stop Loss", fmt: (v: number) => `$${fmtPrice(v)}` },
    { key: "takeProfit", label: "Take Profit", fmt: (v: number) => `$${fmtPrice(v)}` },
  ] as { key: string; label: string; fmt?: (v: unknown) => string; accent?: boolean; feeCol?: boolean }[];
  return (
    <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "20px 24px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Space Mono',monospace", fontSize: "11px" }}>
        <thead>
          <tr>
            <th style={{ color: "#2a3a2a", textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #1a2a1a", fontSize: "10px" }}>METRIC</th>
            {labels.map(l => <th key={l} style={{ color: lc[l], textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #1a2a1a", fontSize: "10px" }}>{l.toUpperCase()}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.key} style={{ background: ri % 2 === 0 ? "#0a0f0a" : "transparent" }}>
              <td style={{ color: "#4a6a4a", padding: "7px 8px", fontSize: "10px" }}>{row.label}</td>
              {labels.map(l => {
                const cfg = configs[l] as Record<string, unknown>;
                const raw = cfg?.[row.key];
                const val = raw != null ? (row.fmt ? row.fmt(raw as never) : raw) : "—";
                const color = row.feeCol ? "#ff6644" : row.accent ? lc[l] : "#e8ffe8";
                return <td key={l} style={{ color, textAlign: "right", padding: "7px 8px", fontWeight: row.accent || row.feeCol ? 700 : 400 }}>{String(val)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ProfitSimulator = ({ config, currentPrice, capital }: { config: Config; currentPrice: number; capital: string }) => {
  const [simPrice, setSimPrice] = useState(currentPrice);
  const { upperPrice, lowerPrice, gridCount, capitalPerGrid, gridSpacingPct } = config;
  const rangeSize = upperPrice - lowerPrice;
  const gridSize = rangeSize / (gridCount || 1);
  const priceMove = Math.abs(simPrice - currentPrice);
  const tradesTriggered = Math.min(Math.floor(priceMove / gridSize), gridCount);
  const grossPerTrade = capitalPerGrid * (gridSize / currentPrice);
  const feePerTrade = capitalPerGrid * PIONEX_FEE_RT;
  const profitPerTrade = grossPerTrade - feePerTrade;
  const totalFees = tradesTriggered * feePerTrade;
  const totalProfit = tradesTriggered * profitPerTrade;
  const roiPct = capital ? ((totalProfit / Number(capital)) * 100) : 0;
  const spacingPct = gridSpacingPct || (gridSize / currentPrice * 100);
  const inRange = simPrice >= lowerPrice && simPrice <= upperPrice;
  const atStop = simPrice <= config.stopLoss, atTP = simPrice >= config.takeProfit;
  const sliderMin = lowerPrice * 0.7, sliderMax = upperPrice * 1.3;
  let statusColor = "#00ff87", statusMsg = "IN RANGE — Bot actively trading";
  if (atStop) { statusColor = "#ff4444"; statusMsg = "STOP LOSS HIT"; }
  else if (atTP) { statusColor = "#ffaa00"; statusMsg = "TAKE PROFIT HIT"; }
  else if (!inRange) { statusColor = "#ffdd00"; statusMsg = "OUT OF RANGE — Bot paused"; }
  return (
    <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "20px 24px" }}>
      <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "14px" }}>PROFIT SIMULATOR</div>
      <input type="range" className="sim-slider" min={sliderMin} max={sliderMax} step={(sliderMax - sliderMin) / 200} value={simPrice} onChange={e => setSimPrice(Number(e.target.value))} style={{ width: "100%", background: `linear-gradient(to right,#1a2a1a ${((simPrice - sliderMin) / (sliderMax - sliderMin)) * 100}%,#0a0f0a 0%)` }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", marginBottom: "14px" }}>
        <span style={{ color: "#2a3a2a", fontSize: "9px" }}>${fmtPrice(sliderMin)}</span>
        <span style={{ color: "#00ff87", fontSize: "13px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>${fmtPrice(simPrice)}</span>
        <span style={{ color: "#2a3a2a", fontSize: "9px" }}>${fmtPrice(sliderMax)}</span>
      </div>
      <div style={{ background: `${statusColor}15`, border: `1px solid ${statusColor}40`, borderRadius: "6px", padding: "8px 12px", marginBottom: "14px", textAlign: "center" }}>
        <span style={{ color: statusColor, fontSize: "11px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{statusMsg}</span>
      </div>
      {spacingPct <= 0.1 && <div style={{ background: "#1a0505", border: "1px solid #ff444460", borderRadius: "6px", padding: "8px 14px", marginBottom: "12px", color: "#ff6644", fontSize: "11px" }}>⚠ Spacing ({spacingPct.toFixed(2)}%) ≤ Pionex 0.1% fee — loses money every trade</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        {[
          { label: "Sim Price", value: `$${fmtPrice(simPrice)}`, accent: "#e8ffe8" },
          { label: "Trades Hit", value: tradesTriggered, accent: "#00ff87" },
          { label: "Gross", value: `$${(tradesTriggered * grossPerTrade).toFixed(2)}`, accent: "#a0c0a0" },
          { label: "Pionex Fees", value: `-$${totalFees.toFixed(3)}`, accent: "#ff6644" },
          { label: "Net Profit", value: `$${totalProfit.toFixed(2)}`, accent: totalProfit >= 0 ? "#00ff87" : "#ff4444" },
          { label: "Net ROI", value: `${roiPct.toFixed(2)}%`, accent: roiPct >= 0 ? "#00ff87" : "#ff4444" },
        ].map(({ label, value, accent }) => (
          <div key={label} style={{ background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "6px", padding: "10px 12px" }}>
            <div style={{ color: "#4a6a4a", fontSize: "9px", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
            <div style={{ color: accent, fontSize: "13px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RangeCard = ({ range, isSelected, onSelect }: { range: Range; isSelected: boolean; onSelect: (r: Range) => void }) => {
  const c = { Conservative: { bg: "#0d2b1a", text: "#00ff87", border: "#00ff8760" }, Moderate: { bg: "#1a1a0d", text: "#ffdd00", border: "#ffdd0060" }, Aggressive: { bg: "#2b0d0d", text: "#ff6644", border: "#ff664460" } }[range.label] || { bg: "#1a1a0d", text: "#ffdd00", border: "#ffdd0060" };
  return (
    <div onClick={() => onSelect(range)} style={{ background: isSelected ? c.bg : "#0a0f0a", border: `1px solid ${isSelected ? c.border : "#1a2a1a"}`, borderRadius: "10px", padding: "14px", cursor: "pointer", flex: 1, boxShadow: isSelected ? `0 0 18px ${c.border}` : "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ color: c.text, fontSize: "11px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{range.label}</span>
        <span style={{ color: c.text, fontSize: "10px" }}>{range.rangePercent}</span>
      </div>
      <div style={{ color: "#e8ffe8", fontSize: "11px", fontFamily: "'Space Mono',monospace", marginBottom: "6px" }}>${fmtPrice(range.lowerPrice)} — ${fmtPrice(range.upperPrice)}</div>
      <div style={{ color: "#4a6a4a", fontSize: "10px", lineHeight: 1.5 }}>{range.description}</div>
      {isSelected && <div style={{ marginTop: "8px", color: c.text, fontSize: "10px" }}>✓ SELECTED</div>}
    </div>
  );
};

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [provider, setProvider] = useState<Provider>("claude");
  const [form, setForm] = useState({ coin: "", capital: "" });
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<Range | null>(null);
  const [activeTab, setActiveTab] = useState("config");
  const [showAllocator, setShowAllocator] = useState(false);
  const [showGoalFinder, setShowGoalFinder] = useState(false);
  const [callCount, setCallCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── allocator state
  const [allocCoins, setAllocCoins] = useState("");
  const [allocCapital, setAllocCapital] = useState("");
  const [allocResult, setAllocResult] = useState<Record<string, unknown> | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);

  // ── goal finder state
  const [goalUSD, setGoalUSD] = useState("");
  const [goalDays, setGoalDays] = useState("7");
  const [goalResult, setGoalResult] = useState<Record<string, unknown> | null>(null);
  const [goalLoading, setGoalLoading] = useState(false);
  const [goalMsg, setGoalMsg] = useState("");
  const [goalError, setGoalError] = useState<string | null>(null);

  const callAI = async (systemPrompt: string, userMsg: string, useSearch = false) => {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, systemPrompt, userMsg, useSearch }),
    });
    const data = await res.json() as { result?: unknown; error?: string };
    if (data.error) throw new Error(data.error);
    setCallCount(n => n + 1);
    return data.result;
  };

  const handleSubmit = async () => {
    if (!form.coin || !form.capital) { setError("Fill in coin and capital."); return; }
    setError(null); setLoading(true); setResult(null); setSelectedRange(null);
    try {
      setLoadingMsg("SEARCHING LIVE PRICE & ATR...");
      const priceData = await callAI(PRICE_FETCH_PROMPT, `Fetch current price, 24h/7d change, week high/low, ATR for: ${form.coin.toUpperCase()}`, true) as Result;
      setLoadingMsg("COMPUTING CONFIGS, HEALTH SCORES & BREAK-EVEN...");
      const configData = await callAI(CONFIG_GEN_PROMPT,
        `Coin: ${priceData.coin || form.coin.toUpperCase()}\nCurrent Price: $${priceData.currentPrice}\n24h Change: ${priceData.change24h}%\n7d Change: ${priceData.change7d}%\nWeek High: $${priceData.weekHigh}\nWeek Low: $${priceData.weekLow}\nATR%: ${priceData.atrPct}\nCapital: $${form.capital}`,
        false
      ) as Partial<Result>;
      setResult({ ...priceData, ...configData } as Result);
      setSelectedRange((configData.suggestedRanges?.[1] || null) as Range | null);
      setActiveTab("config");
    } catch (err) { setError((err as Error).message || "Unknown error"); }
    setLoading(false);
  };

  const handleAlloc = async () => {
    if (!allocCoins || !allocCapital) { setAllocError("Enter coins and capital."); return; }
    setAllocError(null); setAllocLoading(true); setAllocResult(null);
    try {
      const data = await callAI(ALLOCATOR_PROMPT, `Total Capital: $${allocCapital}\nCoins: ${allocCoins}\n\nSearch live prices then recommend optimal split.`, true);
      setAllocResult(data as Record<string, unknown>);
    } catch (e) { setAllocError((e as Error).message); }
    setAllocLoading(false);
  };

  const handleGoal = async () => {
    if (!goalUSD || !goalDays) { setGoalError("Enter profit target and days."); return; }
    setGoalError(null); setGoalLoading(true); setGoalResult(null);
    try {
      setGoalMsg("SCANNING MARKETS + FETCHING LIVE PRICES...");
      const scanData = await callAI(GOAL_SCAN_PROMPT, `Find 5-6 ranging crypto coins for grid bots. Return live prices.`, true) as { coins: unknown[] };
      setGoalMsg("CALCULATING CONFIGS FOR YOUR GOAL...");
      const coinList = (scanData.coins || []).map((c: unknown) => {
        const coin = c as { symbol: string; currentPrice: number; change7d: number; weekHigh: number; weekLow: number; why: string };
        return `${coin.symbol}: $${coin.currentPrice}, 7d: ${coin.change7d}%, H: $${coin.weekHigh}, L: $${coin.weekLow}, why: ${coin.why}`;
      }).join("\n");
      const configData = await callAI(GOAL_CONFIG_PROMPT, `Goal: $${goalUSD} USD in ${goalDays} days.\n\nCoins:\n${coinList}`, false);
      setGoalResult(configData as Record<string, unknown>);
    } catch (e) { setGoalError((e as Error).message); }
    setGoalLoading(false);
  };

  const activeConfig = result?.configs?.[selectedRange?.label as keyof Result["configs"]] || null;
  const btnReady = form.coin.trim() && form.capital.trim() && !loading;

  const s = { background: "#0a0f0a", border: "1px solid #1a2a1a", color: "#e8ffe8", borderRadius: "6px", padding: "10px 14px", fontFamily: "'Space Mono',monospace", fontSize: "13px", width: "100%", outline: "none" };
  const lbl = { color: "#4a6a4a", fontSize: "10px", fontFamily: "'Space Mono',monospace", letterSpacing: "0.12em", textTransform: "uppercase" as const, display: "block", marginBottom: "6px" };

  return (
    <div style={{ minHeight: "100vh", background: "#050a05", backgroundImage: "radial-gradient(ellipse at 20% 20%,#0a1a0a 0%,transparent 60%),radial-gradient(ellipse at 80% 80%,#051005 0%,transparent 60%)", fontFamily: "'Space Mono',monospace", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "40px", maxWidth: "640px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "8px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#00ff87", boxShadow: "0 0 12px #00ff87", animation: "pulse 2s infinite" }} />
          <span style={{ color: "#00ff87", fontSize: "10px", letterSpacing: "0.2em" }}>GRID BOT ENGINE v5.3</span>
        </div>
        <h1 style={{ color: "#e8ffe8", fontSize: "clamp(28px,5vw,42px)", margin: "0 0 10px", fontFamily: "'Syne',sans-serif", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          Crypto Grid<br /><span style={{ color: "#00ff87" }}>Bot Calculator</span>
        </h1>
        <p style={{ color: "#4a6a4a", fontSize: "13px", margin: 0 }}>Live prices · Health score · Break-even · Goal finder · Capital optimizer</p>
      </div>

      {/* Input Card */}
      <div style={{ width: "100%", maxWidth: "640px", background: "#080d08", border: "1px solid #1a2a1a", borderRadius: "16px", padding: "28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg,transparent,#00ff8720,transparent)", animation: "scan 4s linear infinite" }} />

        {/* Provider selector */}
        <div style={{ marginBottom: "20px" }}>
          <label style={lbl}>AI Provider</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {PROVIDERS.map(p => (
              <button key={p.id} onClick={() => setProvider(p.id)} style={{
                padding: "8px 14px", borderRadius: "6px", fontFamily: "'Space Mono',monospace", fontSize: "11px",
                cursor: "pointer", border: "1px solid", transition: "all 0.15s", letterSpacing: "0.06em",
                background: provider === p.id ? `${p.color}20` : "#0a0f0a",
                color: provider === p.id ? p.color : "#4a6a4a",
                borderColor: provider === p.id ? p.color : "#2a3a2a",
              }}>
                {p.label} <span style={{ opacity: 0.6, fontSize: "9px" }}>{p.model}</span>
              </button>
            ))}
          </div>
          <div style={{ color: "#2a3a2a", fontSize: "10px", marginTop: "6px" }}>
            Configure keys in Vercel → Settings → Environment Variables
          </div>
        </div>

        {/* Call counter */}
        {callCount > 0 && (
          <div style={{ marginBottom: "16px", background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "8px", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.1em" }}>API CALLS</span>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ color: "#00ff87", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{callCount}</span>
              <span style={{ color: "#2a3a2a", fontSize: "10px" }}>~${(callCount * 0.02).toFixed(2)} est.</span>
              <button onClick={() => setCallCount(0)} style={{ background: "none", border: "none", color: "#2a3a2a", fontSize: "10px", cursor: "pointer", fontFamily: "'Space Mono',monospace" }}>reset</button>
            </div>
          </div>
        )}

        {/* CSV */}
        <div style={{ marginBottom: "20px" }}>
          <input type="file" accept=".csv" ref={fileRef} onChange={() => {}} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: "10px", background: "#0a0f0a", border: "1px dashed #2a3a2a", borderRadius: "8px", color: "#4a6a4a", cursor: "pointer", fontSize: "12px", fontFamily: "'Space Mono',monospace" }}>
            ↑ Upload CSV — columns: coin, capital
          </button>
        </div>

        {/* Form */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Coin / Symbol</label>
            <input style={s} placeholder="BTC, ETH, SOL, SUI, DOGE..." value={form.coin} onChange={e => setForm(f => ({ ...f, coin: e.target.value }))} />
            <span style={{ color: "#2a3a2a", fontSize: "10px" }}>AI fetches live price automatically</span>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Capital (USD)</label>
            <input style={s} placeholder="500" value={form.capital} onChange={e => setForm(f => ({ ...f, capital: e.target.value }))} />
          </div>
        </div>

        {error && <div style={{ background: "#1a0505", border: "1px solid #ff4444", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", color: "#ff4444", fontSize: "12px" }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "10px" }}>
          <button onClick={handleSubmit} disabled={!btnReady} style={{ padding: "14px", background: btnReady ? "#00ff87" : "#0a0f0a", color: btnReady ? "#050a05" : "#4a6a4a", border: btnReady ? "none" : "1px solid #1a2a1a", borderRadius: "8px", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: "13px", cursor: btnReady ? "pointer" : "not-allowed", boxShadow: btnReady ? "0 0 30px rgba(0,255,135,0.3)" : "none" }}>
            {loading ? "ANALYZING..." : "GENERATE CONFIG →"}
          </button>
          <button onClick={() => setShowAllocator(s => !s)} style={{ padding: "14px 18px", background: showAllocator ? "#2b1f0d" : "#0a0f0a", color: "#ffaa00", border: "1px solid #ffaa0060", borderRadius: "8px", fontFamily: "'Space Mono',monospace", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
            ⊕ ALLOCATOR
          </button>
          <button onClick={() => setShowGoalFinder(s => !s)} style={{ padding: "14px 18px", background: showGoalFinder ? "#1a0f2e" : "#0a0f0a", color: "#a78bfa", border: "1px solid #a78bfa60", borderRadius: "8px", fontFamily: "'Space Mono',monospace", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
            ◎ GOAL
          </button>
        </div>
      </div>

      {/* Allocator Panel */}
      {showAllocator && (
        <div style={{ width: "100%", maxWidth: "640px", background: "#080d08", border: "1px solid #1a2a1a", borderRadius: "16px", padding: "24px", marginTop: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ffaa00" }} />
            <span style={{ color: "#ffaa00", fontSize: "10px", letterSpacing: "0.2em" }}>CAPITAL ALLOCATION OPTIMIZER</span>
          </div>
          <div style={{ display: "grid", gap: "12px", marginBottom: "14px" }}>
            <div><label style={lbl}>Coins (comma separated)</label><input style={s} placeholder="SUI, ETH, SOL, BTC" value={allocCoins} onChange={e => setAllocCoins(e.target.value)} /></div>
            <div><label style={lbl}>Total Capital (USD)</label><input style={s} placeholder="850" value={allocCapital} onChange={e => setAllocCapital(e.target.value)} /></div>
          </div>
          {allocError && <div style={{ background: "#1a0505", border: "1px solid #ff4444", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", color: "#ff4444", fontSize: "12px" }}>{allocError}</div>}
          <button onClick={handleAlloc} disabled={allocLoading} style={{ width: "100%", padding: "12px", background: allocLoading ? "#0a1a0a" : "#ffaa00", color: allocLoading ? "#4a6a4a" : "#050a05", border: "none", borderRadius: "8px", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: "12px", cursor: allocLoading ? "not-allowed" : "pointer" }}>
            {allocLoading ? "ANALYZING..." : "OPTIMIZE ALLOCATION →"}
          </button>
          {allocResult && (
            <div style={{ marginTop: "16px" }}>
              {((allocResult as { allocations?: unknown[] }).allocations || []).map((a: unknown, i: number) => {
                const alloc = a as { coin: string; currentPrice: number; allocatedCapital: number; allocationPct: number; rationale: string; riskLevel: string; expectedNetROI: string; priority: number };
                const rc = { Low: "#00ff87", Medium: "#ffaa00", High: "#ff4444" }[alloc.riskLevel] || "#ffaa00";
                return (
                  <div key={i} style={{ background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "8px", padding: "14px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "#2a3a2a", fontSize: "11px" }}>#{alloc.priority}</span>
                        <span style={{ color: "#e8ffe8", fontSize: "14px", fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>{alloc.coin?.toUpperCase()}</span>
                        <span style={{ color: "#4a6a4a", fontSize: "11px" }}>@ ${fmtPrice(alloc.currentPrice)}</span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <RiskBadge level={alloc.riskLevel} />
                        <span style={{ color: "#00ff87", fontSize: "12px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{alloc.expectedNetROI}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ color: "#4a6a4a", fontSize: "10px" }}>Capital allocated</span>
                      <span style={{ color: "#ffaa00", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: "11px" }}>${Number(alloc.allocatedCapital).toFixed(0)} ({alloc.allocationPct}%)</span>
                    </div>
                    <div style={{ height: "6px", background: "#1a2a1a", borderRadius: "3px", marginBottom: "8px" }}>
                      <div style={{ height: "6px", borderRadius: "3px", background: rc, width: `${alloc.allocationPct}%` }} />
                    </div>
                    <div style={{ color: "#6a8a6a", fontSize: "11px", lineHeight: 1.5 }}>{alloc.rationale}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Goal Finder Panel */}
      {showGoalFinder && (
        <div style={{ width: "100%", maxWidth: "640px", background: "#080d08", border: "1px solid #1a2a1a", borderRadius: "16px", padding: "24px", marginTop: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a78bfa" }} />
            <span style={{ color: "#a78bfa", fontSize: "10px", letterSpacing: "0.2em" }}>ROI GOAL FINDER</span>
          </div>
          <p style={{ color: "#4a6a4a", fontSize: "11px", marginBottom: "16px", lineHeight: 1.5 }}>Tell the AI how much you want to make and by when.</p>
          <div style={{ display: "grid", gap: "12px", marginBottom: "14px" }}>
            <div><label style={lbl}>Profit Target (USD)</label><input style={s} placeholder="50" value={goalUSD} onChange={e => setGoalUSD(e.target.value)} /></div>
            <div>
              <label style={lbl}>Timeframe</label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {["3", "7", "14", "30", "60", "90"].map(d => (
                  <button key={d} onClick={() => setGoalDays(d)} style={{ padding: "8px 14px", borderRadius: "6px", fontFamily: "'Space Mono',monospace", fontSize: "11px", cursor: "pointer", border: "1px solid", background: goalDays === d ? "#1a0f2e" : "#0a0f0a", color: goalDays === d ? "#a78bfa" : "#4a6a4a", borderColor: goalDays === d ? "#a78bfa" : "#2a3a2a" }}>{d}d</button>
                ))}
                <input style={{ ...s, width: "70px", padding: "8px 10px", fontSize: "11px" }} placeholder="custom" value={["3","7","14","30","60","90"].includes(goalDays) ? "" : goalDays} onChange={e => setGoalDays(e.target.value)} />
              </div>
            </div>
          </div>
          {goalError && <div style={{ background: "#1a0505", border: "1px solid #ff4444", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", color: "#ff4444", fontSize: "12px" }}>{goalError}</div>}
          <button onClick={handleGoal} disabled={goalLoading} style={{ width: "100%", padding: "12px", background: goalLoading ? "#0a0a1a" : "#a78bfa", color: goalLoading ? "#4a4a7a" : "#050a05", border: "none", borderRadius: "8px", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: "12px", cursor: goalLoading ? "not-allowed" : "pointer" }}>
            {goalLoading ? goalMsg || "SCANNING..." : "FIND COINS FOR MY GOAL →"}
          </button>

          {goalResult && (
            <div style={{ marginTop: "20px" }}>
              <div style={{ background: "#0e0b1a", border: "1px solid #a78bfa40", borderRadius: "10px", padding: "14px 18px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#6a5a8a", fontSize: "10px", marginBottom: "3px" }}>YOUR GOAL</div>
                  <div style={{ color: "#a78bfa", fontSize: "22px", fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>${goalResult.goalUSD as number} in {goalResult.goalDays as number}d</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#6a5a8a", fontSize: "10px", marginBottom: "3px" }}>DAILY ROI NEEDED</div>
                  <div style={{ color: Number(goalResult.requiredDailyROI) > 0.5 ? "#ff4444" : "#00ff87", fontSize: "18px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{Number(goalResult.requiredDailyROI).toFixed(3)}%/day</div>
                </div>
              </div>
              {goalResult.bestPick && (
                <div style={{ background: "#0a120a", border: "1px solid #00ff8740", borderRadius: "10px", padding: "12px 16px", marginBottom: "14px", display: "flex", gap: "12px" }}>
                  <span style={{ fontSize: "20px" }}>★</span>
                  <div>
                    <div style={{ color: "#00ff87", fontSize: "11px", fontFamily: "'Space Mono',monospace", fontWeight: 700, marginBottom: "3px" }}>BEST PICK: {String(goalResult.bestPick).toUpperCase()}</div>
                    <div style={{ color: "#6a8a6a", fontSize: "11px", lineHeight: 1.5 }}>{goalResult.bestPickReason as string}</div>
                  </div>
                </div>
              )}
              {((goalResult.candidates || []) as unknown[]).map((c: unknown, i: number) => {
                const cand = c as { rank: number; coin: string; currentPrice: number; feasibility: string; gridConfig: { riskLevel: string; netProfitOverPeriod: number; estDailyROIPct: number; gridCount: number; gridSpacing: string; healthScore: number; upperPrice: number; lowerPrice: number }; requiredCapital: number; why: string; feasibilityReason: string; stopLoss: number; takeProfit: number };
                const fc = { High: "#00ff87", Medium: "#ffaa00", Low: "#ff4444" }[cand.feasibility] || "#ffaa00";
                const isBest = String(cand.coin).toUpperCase() === String(goalResult.bestPick).toUpperCase();
                return (
                  <div key={i} style={{ background: isBest ? "#0a120a" : "#0a0f0a", border: `1px solid ${isBest ? "#00ff8740" : "#1a2a1a"}`, borderRadius: "10px", padding: "16px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ color: "#2a3a2a", fontSize: "12px" }}>#{cand.rank}</span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "#e8ffe8", fontSize: "16px", fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>{cand.coin?.toUpperCase()}</span>
                            {isBest && <span style={{ color: "#00ff87", fontSize: "9px", fontFamily: "'Space Mono',monospace" }}>★ BEST</span>}
                          </div>
                          <div style={{ color: "#4a6a4a", fontSize: "10px" }}>@ ${fmtPrice(cand.currentPrice)}</div>
                        </div>
                      </div>
                      <span style={{ background: `${fc}18`, color: fc, border: `1px solid ${fc}50`, padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{cand.feasibility} Feasibility</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "6px", marginBottom: "10px" }}>
                      {[
                        { label: "Required Capital", value: `$${Number(cand.requiredCapital).toLocaleString()}`, accent: "#ffaa00" },
                        { label: "Net Profit", value: `$${Number(cand.gridConfig?.netProfitOverPeriod || 0).toFixed(2)}`, accent: "#00ff87" },
                        { label: "Daily ROI", value: `${Number(cand.gridConfig?.estDailyROIPct || 0).toFixed(3)}%`, accent: "#a78bfa" },
                        { label: "Grid Count", value: cand.gridConfig?.gridCount, accent: "#e8ffe8" },
                        { label: "Grid Spacing", value: cand.gridConfig?.gridSpacing, accent: "#e8ffe8" },
                        { label: "Health Score", value: `${cand.gridConfig?.healthScore}/100`, accent: (cand.gridConfig?.healthScore || 0) >= 70 ? "#00ff87" : "#ffaa00" },
                      ].map(({ label, value, accent }) => (
                        <div key={label} style={{ background: "#080d08", borderRadius: "6px", padding: "8px 10px" }}>
                          <div style={{ color: "#4a6a4a", fontSize: "8px", textTransform: "uppercase", marginBottom: "3px" }}>{label}</div>
                          <div style={{ color: accent, fontSize: "12px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{value ?? "—"}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ color: "#6a8a6a", fontSize: "11px", lineHeight: 1.6, marginBottom: "6px" }}>{cand.why}</div>
                    <div style={{ color: fc, fontSize: "10px", paddingLeft: "10px", borderLeft: `2px solid ${fc}40` }}>{cand.feasibilityReason}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ marginTop: "32px", textAlign: "center" }}>
          <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "12px" }}>
            {[0, 1, 2, 3, 4].map(i => <div key={i} style={{ width: "4px", height: "20px", background: "#00ff87", borderRadius: "2px", animation: "pulse 1s infinite", animationDelay: `${i * 0.15}s` }} />)}
          </div>
          <p style={{ color: "#4a6a4a", fontSize: "11px", letterSpacing: "0.1em" }}>{loadingMsg}</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div style={{ width: "100%", maxWidth: "640px", marginTop: "28px", animation: "fadeIn 0.4s ease" }}>

          {/* Price Banner */}
          <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderRadius: "16px 16px 0 0", padding: "16px 24px", borderBottom: "1px solid #1a2a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "4px" }}>LIVE PRICE — {result.coin?.toUpperCase()}</div>
              <div style={{ color: "#00ff87", fontSize: "32px", fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>${fmtPrice(result.currentPrice)}</div>
            </div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ color: changeColor(result.change24h), fontSize: "13px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>
                {result.change24h >= 0 ? "▲" : "▼"} {Math.abs(result.change24h || 0).toFixed(2)}% <span style={{ color: "#3a5a3a", fontSize: "10px" }}>24h</span>
              </div>
              <div style={{ color: changeColor(result.change7d), fontSize: "12px", fontFamily: "'Space Mono',monospace" }}>
                {result.change7d >= 0 ? "▲" : "▼"} {Math.abs(result.change7d || 0).toFixed(2)}% <span style={{ color: "#3a5a3a", fontSize: "10px" }}>7d</span>
              </div>
              {result.atrPct && <div style={{ color: "#4a6a4a", fontSize: "10px" }}>ATR: {result.atrPct.toFixed(1)}%/day</div>}
              {result.priceSource && <div style={{ color: "#2a3a2a", fontSize: "9px" }}>via {result.priceSource}</div>}
            </div>
          </div>

          <Sparkline data={result.sparkline} upperPrice={activeConfig?.upperPrice} lowerPrice={activeConfig?.lowerPrice} currentPrice={result.currentPrice} />

          {/* Range Selector */}
          {result.suggestedRanges && (
            <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "20px 24px", borderBottom: "1px solid #1a2a1a" }}>
              <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "14px" }}>SELECT PRICE RANGE</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {result.suggestedRanges.map(r => <RangeCard key={r.label} range={r} isSelected={selectedRange?.label === r.label} onSelect={r => { setSelectedRange(r); setActiveTab("config"); }} />)}
              </div>
            </div>
          )}

          {/* Tab Bar */}
          <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "0 24px", display: "flex", borderBottom: "1px solid #1a2a1a", overflowX: "auto" }}>
            {[
              { id: "config", label: "CONFIG" }, { id: "health", label: "HEALTH" },
              { id: "breakeven", label: "BREAK-EVEN" }, { id: "rebalance", label: "REBALANCE" },
              { id: "fit", label: "HIST FIT" }, { id: "compare", label: "COMPARE" },
              { id: "simulate", label: "SIMULATE" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab.id ? "#00ff87" : "transparent"}`, color: activeTab === tab.id ? "#00ff87" : "#4a6a4a", fontFamily: "'Space Mono',monospace", fontSize: "10px", letterSpacing: "0.1em", padding: "12px 14px", cursor: "pointer", whiteSpace: "nowrap" }}>{tab.label}</button>
            ))}
            <div style={{ flex: 1 }} />
            {activeConfig && (
              <button onClick={() => { const t = `${result.coin?.toUpperCase()} ${selectedRange?.label} Grid Bot\nPrice: $${fmtPrice(result.currentPrice)}\nRange: $${fmtPrice(activeConfig.lowerPrice)} — $${fmtPrice(activeConfig.upperPrice)}\nGrids: ${activeConfig.gridCount} | Spacing: ${activeConfig.gridSpacing}\nGross ROI: ${activeConfig.estimatedMonthlyROI}/mo | Net: ${activeConfig.netMonthlyROI}/mo\nFees: $${Number(activeConfig.estMonthlyFees).toFixed(2)}/mo | Health: ${activeConfig.healthScore}/100\nStop Loss: $${fmtPrice(activeConfig.stopLoss)} | Take Profit: $${fmtPrice(activeConfig.takeProfit)}`; navigator.clipboard.writeText(t); }} style={{ background: "#0a0f0a", border: "1px solid #2a3a2a", color: "#4a6a4a", borderRadius: "6px", padding: "6px 12px", margin: "6px 0", fontFamily: "'Space Mono',monospace", fontSize: "10px", cursor: "pointer" }}>⎘ COPY</button>
            )}
          </div>

          {/* Config Tab */}
          {activeTab === "config" && activeConfig && (
            <>
              <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a2a1a" }}>
                <div>
                  <div style={{ color: "#4a6a4a", fontSize: "10px", letterSpacing: "0.12em", marginBottom: "4px" }}>RECOMMENDED CONFIG</div>
                  <div style={{ color: "#e8ffe8", fontSize: "20px", fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>
                    {result.coin?.toUpperCase()} Grid Bot {selectedRange && <span style={{ color: "#4a6a4a", fontSize: "13px" }}>— {selectedRange.label}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
                  <RiskBadge level={activeConfig.riskLevel} />
                  {activeConfig.gridType && <GridTypeBadge type={activeConfig.gridType} />}
                </div>
              </div>
              {activeConfig.gridTypeReason && (
                <div style={{ background: activeConfig.gridType === "geometric" ? "#0e0b1a" : "#0a0f1a", border: "1px solid #1a2a1a", borderTop: "none", padding: "12px 24px", display: "flex", gap: "12px" }}>
                  <span style={{ fontSize: "18px" }}>{activeConfig.gridType === "geometric" ? "%" : "≡"}</span>
                  <div>
                    <div style={{ color: activeConfig.gridType === "geometric" ? "#a78bfa" : "#60a5fa", fontSize: "10px", fontFamily: "'Space Mono',monospace", fontWeight: 700, marginBottom: "3px" }}>WHY {(activeConfig.gridType || "").toUpperCase()} SPACING?</div>
                    <div style={{ color: "#6a8a8a", fontSize: "11px", lineHeight: 1.6 }}>{activeConfig.gridTypeReason}</div>
                  </div>
                </div>
              )}
              <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <StatCard label="Grid Count" value={activeConfig.gridCount} accent="#00ff87" />
                <StatCard label="Health Score" value={`${activeConfig.healthScore || "—"}/100`} accent={activeConfig.healthScore >= 75 ? "#00ff87" : activeConfig.healthScore >= 50 ? "#ffaa00" : "#ff4444"} />
                <StatCard label="Gross Monthly ROI" value={activeConfig.estimatedMonthlyROI} accent="#a0c0a0" />
                <StatCard label="Net Monthly ROI" value={activeConfig.netMonthlyROI || "—"} accent="#00ff87" />
                <StatCard label="Est. Monthly Fees" value={activeConfig.estMonthlyFees ? `$${Number(activeConfig.estMonthlyFees).toFixed(2)}` : "—"} accent="#ff6644" />
                <StatCard label="Capital / Grid" value={`$${Number(activeConfig.capitalPerGrid).toFixed(2)}`} />
                <StatCard label="Grid Spacing" value={activeConfig.gridSpacing} />
                <StatCard label="Break-Even Days" value={activeConfig.breakEvenDays ? `~${Math.round(activeConfig.breakEvenDays)}d` : "—"} accent="#ffaa00" />
                <StatCard label="Stop Loss" value={`$${fmtPrice(activeConfig.stopLoss)}`} accent="#ff4444" />
                <StatCard label="Take Profit" value={`$${fmtPrice(activeConfig.takeProfit)}`} accent="#ffaa00" />
                <StatCard label="Upper Price" value={`$${fmtPrice(activeConfig.upperPrice)}`} />
                <StatCard label="Lower Price" value={`$${fmtPrice(activeConfig.lowerPrice)}`} />
              </div>
              <div style={{ background: "#0a0c14", border: "1px solid #1a1a2a", borderTop: "none", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ color: "#4a4a7a", fontSize: "10px" }}>PIONEX (0.05%+0.05% = 0.1%/trade)</span>
                <div style={{ display: "flex", gap: "16px" }}>
                  <span style={{ color: "#6a6aaa", fontSize: "11px", fontFamily: "'Space Mono',monospace" }}>Min: <span style={{ color: "#a0a0ff", fontWeight: 700 }}>0.10%</span></span>
                  {activeConfig.gridSpacingPct && <span style={{ color: activeConfig.gridSpacingPct <= 0.1 ? "#ff4444" : "#00ff87", fontSize: "11px", fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{activeConfig.gridSpacingPct <= 0.1 ? "⚠ BELOW MIN" : "✓ ABOVE MIN"}</span>}
                </div>
              </div>
              <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "16px 24px" }}>
                <div style={{ color: "#4a6a4a", fontSize: "10px", marginBottom: "6px" }}>MARKET CONDITION</div>
                <div style={{ color: "#e8ffe8", fontSize: "13px", lineHeight: 1.6 }}>{activeConfig.marketCondition}</div>
              </div>
              <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "16px 24px" }}>
                <div style={{ color: "#4a6a4a", fontSize: "10px", marginBottom: "6px" }}>AI REASONING</div>
                <div style={{ color: "#a0c0a0", fontSize: "12px", lineHeight: 1.7 }}>{activeConfig.reasoning}</div>
              </div>
              {activeConfig.warnings?.length > 0 && (
                <div style={{ background: "#0d0808", border: "1px solid #2a1a1a", borderTop: "none", padding: "16px 24px" }}>
                  <div style={{ color: "#ff4444", fontSize: "10px", marginBottom: "10px" }}>⚠ WARNINGS</div>
                  {activeConfig.warnings.map((w, i) => <div key={i} style={{ color: "#c07070", fontSize: "12px", lineHeight: 1.6, marginBottom: "6px", paddingLeft: "12px", borderLeft: "2px solid #ff444440" }}>{w}</div>)}
                </div>
              )}
              {activeConfig.tips?.length > 0 && (
                <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", padding: "16px 24px" }}>
                  <div style={{ color: "#00ff87", fontSize: "10px", marginBottom: "10px" }}>✦ PRO TIPS</div>
                  {activeConfig.tips.map((t, i) => <div key={i} style={{ color: "#70a070", fontSize: "12px", lineHeight: 1.6, marginBottom: "6px", paddingLeft: "12px", borderLeft: "2px solid #00ff8740" }}>{t}</div>)}
                </div>
              )}
            </>
          )}

          {activeTab === "health" && activeConfig && <HealthScore config={activeConfig} />}
          {activeTab === "breakeven" && activeConfig && <BreakEvenPanel config={activeConfig} />}
          {activeTab === "rebalance" && activeConfig && <RebalanceAlert config={activeConfig} currentPrice={result.currentPrice} />}
          {activeTab === "fit" && activeConfig && <HistoricalFit config={activeConfig} />}
          {activeTab === "compare" && result.configs && <ComparisonTable configs={result.configs} />}
          {activeTab === "simulate" && activeConfig && <ProfitSimulator config={activeConfig} currentPrice={result.currentPrice} capital={form.capital} />}

          <div style={{ background: "#080d08", border: "1px solid #1a2a1a", borderTop: "none", borderRadius: "0 0 16px 16px", padding: "12px 24px", textAlign: "center" }}>
            <p style={{ color: "#2a3a2a", fontSize: "10px", margin: 0 }}>Prices fetched live · Pionex 0.1% fees factored · Not financial advice</p>
          </div>
        </div>
      )}
    </div>
  );
}
