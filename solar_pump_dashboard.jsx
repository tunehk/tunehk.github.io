import { useState, useMemo, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine
} from "recharts";

// ─── DEFAULT CONSTANTS ────────────────────────────────────────────
const DEFAULT_SITE = { lat: 1.406, lon: 34.480, elev: 1886, name: "Kapchorwa, Uganda" };
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];
const LITERS_PER_PERSON = 15;

// Default: average hourly G(i) irradiance (W/m²) per month
// Source: PVGIS-SARAH3, Kapchorwa Uganda (1.406°N, 34.480°E, 1886m), 3° slope, 0° azimuth, 2023
const DEFAULT_PROFILES = {
  1:[0,0,0,0,16.1,260.6,519.9,747.5,916.1,1021.1,988.0,870.6,705.9,545.0,332.6,117.5,0,0,0,0,0,0,0,0],
  2:[0,0,0,0,7.4,233.9,507.2,725.4,933.0,1037.9,1050.3,894.6,712.4,516.2,343.6,121.1,0,0,0,0,0,0,0,0],
  3:[0,0,0,0,15.9,203.5,442.3,610.8,788.2,862.7,890.8,774.6,653.0,452.7,234.8,88.7,0,0,0,0,0,0,0,0],
  4:[0,0,0,0,41.8,236.9,444.0,638.9,791.5,856.2,860.2,801.1,595.5,389.6,237.5,66.5,0,0,0,0,0,0,0,0],
  5:[0,0,0,0,60.4,273.0,495.2,666.5,821.0,909.4,903.9,789.4,596.9,394.7,185.7,49.2,0,0,0,0,0,0,0,0],
  6:[0,0,0,0,33.0,209.8,429.6,588.7,747.2,760.1,775.3,708.8,615.5,407.8,183.2,55.8,0,0,0,0,0,0,0,0],
  7:[0,0,0,0,22.2,207.5,426.2,612.7,769.2,785.5,773.2,684.0,616.0,449.3,253.6,72.5,0,0,0,0,0,0,0,0],
  8:[0,0,0,0,34.0,247.3,467.4,699.7,861.0,918.3,820.3,751.0,623.0,403.8,248.6,77.7,0,0,0,0,0,0,0,0],
  9:[0,0,0,0,50.4,257.6,513.2,727.6,863.8,935.9,908.0,847.8,639.3,405.3,191.3,48.8,0,0,0,0,0,0,0,0],
  10:[0,0,0,0,72.1,275.5,490.1,699.7,816.5,857.7,879.4,702.7,466.3,317.5,174.5,24.0,0,0,0,0,0,0,0,0],
  11:[0,0,0,0,62.8,290.4,515.3,697.9,824.8,872.9,784.2,748.1,574.3,376.6,193.9,24.6,0,0,0,0,0,0,0,0],
  12:[0,0,0,0,34.2,279.2,502.4,708.4,843.5,915.3,895.2,821.1,627.1,449.7,231.7,50.3,0,0,0,0,0,0,0,0]
};

// Pump presets
const PUMP_PRESETS = {
  "SQF-2 (1kW)": {
    refHead: 150,
    segments: [
      { flow: 2.79, power: 660 },
      { flow: 2.52, power: 590 },
      { flow: 2.15, power: 500 },
      { flow: 1.84, power: 430 },
      { flow: 1.49, power: 350 },
      { flow: 0.94, power: 240 },
      { flow: 0.53, power: 160 },
      { flow: 0.30, power: 100 },
    ]
  },
  "SQF-10 (2kW)": {
    refHead: 150,
    segments: [
      { flow: 5.50, power: 1800 },
      { flow: 5.00, power: 1500 },
      { flow: 4.20, power: 1200 },
      { flow: 3.40, power: 900 },
      { flow: 2.50, power: 700 },
      { flow: 1.60, power: 500 },
      { flow: 0.80, power: 300 },
      { flow: 0.30, power: 150 },
    ]
  },
  "Custom": {
    refHead: 150,
    segments: [
      { flow: 2.0, power: 500 },
      { flow: 1.0, power: 250 },
      { flow: 0.3, power: 100 },
    ]
  }
};

// ─── PVGIS CSV PARSER ─────────────────────────────────────────────
// Supports PVGIS hourly CSV exports. Users configure their PV system
// (kWp, slope, azimuth) on the PVGIS website before downloading.
//
// If the CSV has a P column (PV power output in W), it is used directly.
// If only G(i) is present (irradiance in W/m²), values are used as-is
// (equivalent to a ~1 kWp system at standard test conditions).

function parsePVGIS_CSV(text) {
  const lines = text.split(/\r?\n/);
  const meta = { lat: null, lon: null, elev: null, slope: null, azimuth: null, db: null, kWp: null };
  let dataStart = -1;

  // Parse header metadata
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i].trim();
    const lower = line.toLowerCase();
    if (lower.includes("latitude")) { const m = line.match(/([\d.-]+)\s*$/); if (m) meta.lat = parseFloat(m[1]); }
    if (lower.includes("longitude")) { const m = line.match(/([\d.-]+)\s*$/); if (m) meta.lon = parseFloat(m[1]); }
    if (lower.includes("elevation")) { const m = line.match(/([\d.-]+)\s*$/); if (m) meta.elev = parseFloat(m[1]); }
    if (lower.includes("nominal power")) { const m = line.match(/([\d.]+)/); if (m) meta.kWp = parseFloat(m[1]); }
    if (lower.includes("slope")) { const m = line.match(/([\d.]+)/); if (m) meta.slope = parseFloat(m[1]); }
    if (lower.includes("azimuth")) { const m = line.match(/([\d.-]+)/); if (m) meta.azimuth = parseFloat(m[1]); }
    if (lower.includes("radiation database")) { const m = line.match(/:\s*(.+)$/); if (m) meta.db = m[1].trim(); }
    if (/^time[,\t]/i.test(line)) { dataStart = i; break; }
  }

  if (dataStart === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\d{8}:\d{4}/.test(lines[i].trim())) { dataStart = i; break; }
    }
  }
  if (dataStart === -1) throw new Error("Could not locate data rows. Expected PVGIS hourly format with timestamps like 20230101:0006.");

  // Parse header columns — prefer P (power), fall back to G(i)
  const headers = lines[dataStart].split(/[,\t]+/).map(h => h.trim());
  const timeIdx = headers.findIndex(h => h.toLowerCase() === "time");
  const pIdx = headers.findIndex(h => h === "P" || h === "p");
  const giIdx = headers.findIndex(h => h === "G(i)" || h === "g(i)" || h === "Gi");
  const useP = pIdx >= 0;
  const valIdx = useP ? pIdx : giIdx;

  if (valIdx < 0) throw new Error("CSV must contain a 'P' (PV power) or 'G(i)' (irradiance) column. Download hourly data from PVGIS.");

  // Parse hourly data
  const hourlyData = [];
  for (let i = dataStart + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !/^\d{8}/.test(line)) continue;
    const parts = line.split(/[,\t]+/);
    const timeStr = parts[timeIdx >= 0 ? timeIdx : 0]?.trim();
    if (!timeStr || !/^\d{8}/.test(timeStr)) continue;

    const month = parseInt(timeStr.substring(4, 6));
    const hour = parseInt((timeStr.split(":")[1] || "0000").substring(0, 2));
    const val = parseFloat(parts[valIdx]) || 0;

    hourlyData.push({ month, hour, val });
  }

  if (hourlyData.length < 100) throw new Error(`Only found ${hourlyData.length} data rows. Expected ~8760 for a full year.`);

  // Build monthly average profiles
  const buckets = {};
  for (let m = 1; m <= 12; m++) { buckets[m] = {}; for (let h = 0; h < 24; h++) buckets[m][h] = []; }
  for (const d of hourlyData) {
    if (d.month >= 1 && d.month <= 12 && d.hour >= 0 && d.hour < 24) {
      buckets[d.month][d.hour].push(d.val);
    }
  }

  const profiles = {};
  for (let m = 1; m <= 12; m++) {
    profiles[m] = [];
    for (let h = 0; h < 24; h++) {
      const arr = buckets[m][h];
      profiles[m].push(arr.length > 0 ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0);
    }
  }

  const colUsed = useP ? "P (PV power)" : "G(i) (irradiance)";
  return { profiles, meta, rowCount: hourlyData.length, colUsed };
}

// ─── PUMP CURVE MATH ──────────────────────────────────────────────
function buildPiecewiseCoeffs(segments) {
  const sorted = [...segments].sort((a, b) => b.power - a.power);
  const result = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = (sorted[i].flow - sorted[i + 1].flow) / (sorted[i].power - sorted[i + 1].power);
    const b = sorted[i].flow - a * sorted[i].power;
    result.push({ ...sorted[i], a, b, nextPower: sorted[i + 1].power });
  }
  const last = sorted[sorted.length - 1];
  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const a = (prev.flow - last.flow) / (prev.power - last.power);
    const b = last.flow - a * last.power;
    result.push({ ...last, a, b, nextPower: 0 });
  } else {
    result.push({ ...last, a: last.flow / last.power, b: 0, nextPower: 0 });
  }
  return result;
}

function getFlowFromPower(powerW, coeffs) {
  if (powerW <= 0) return 0;
  for (const seg of coeffs) {
    if (powerW >= seg.nextPower) return Math.max(0, seg.a * powerW + seg.b);
  }
  return 0;
}

function scaleCoeffs(coeffs, refHead, actualHead) {
  const ratio = refHead / actualHead;
  return coeffs.map(c => ({ ...c, a: c.a * ratio, b: c.b * ratio }));
}

// ─── SIMULATION ENGINE ────────────────────────────────────────────
// Pump curve values are flow rates in m³/hr at a given power input.
// Each hour: look up flow rate → add directly to storage.
// Power is capped at highest pump curve point (no extrapolation beyond data).

function runSimulation({ headM, storageLiters, dailyDemandLiters, profiles, pumpSegments, refHead }) {
  const storageM3 = storageLiters / 1000;
  const dailyDemandM3 = dailyDemandLiters / 1000;
  const hourlyDemandM3 = dailyDemandM3 / 24;
  const maxPumpPower = Math.max(...pumpSegments.map(s => s.power));

  const rawCoeffs = buildPiecewiseCoeffs(pumpSegments);
  const coeffs = scaleCoeffs(rawCoeffs, refHead, headM);

  const monthly = [];
  const dailyServed = [];
  let dayOfYear = 0;
  let yearlyPumped = 0, yearlyDemand = 0, yearlyDeficit = 0, yearlyOverflow = 0;
  let daysNotServed = 0;
  let storage = 0; // start empty — conservative sizing assumption

  for (let m = 0; m < 12; m++) {
    const profile = profiles[m + 1];
    const days = DAYS_IN_MONTH[m];
    let monthPumped = 0, monthDeficit = 0, monthOverflow = 0;

    for (let d = 0; d < days; d++) {
      dayOfYear++;
      let dayPumped = 0;
      let dayDeficit = 0;

      for (let h = 0; h < 24; h++) {
        // Cap power at max pump curve point
        const powerW = Math.min(profile[h], maxPumpPower);
        // Flow in m³/hr — add directly for this hour
        const flowM3 = getFlowFromPower(powerW, coeffs);
        storage += flowM3;
        dayPumped += flowM3;
        monthPumped += flowM3;
        storage -= hourlyDemandM3;
        if (storage > storageM3) { monthOverflow += storage - storageM3; storage = storageM3; }
        if (storage < 0) { dayDeficit += Math.abs(storage); monthDeficit += Math.abs(storage); storage = 0; }
      }

      // Water actually delivered = demand minus what was missed
      const served = (dailyDemandM3 - dayDeficit) * 1000; // liters
      dailyServed.push({ day: dayOfYear, served: +served.toFixed(0), demand: dailyDemandLiters });
      if (dayDeficit > 0.0001) daysNotServed++;
    }

    monthly.push({
      month: MONTH_NAMES[m], monthIdx: m, days,
      totalPumped: monthPumped, totalDemand: dailyDemandM3 * days,
      deficit: monthDeficit, overflow: monthOverflow,
      avgDailyPumped: monthPumped / days
    });
    yearlyPumped += monthPumped;
    yearlyDemand += dailyDemandM3 * days;
    yearlyDeficit += monthDeficit;
    yearlyOverflow += monthOverflow;
  }

  const hourlyProfile = (monthIdx) => {
    const profile = profiles[monthIdx + 1];
    return profile.map((val, h) => {
      const powerW = Math.min(val, maxPumpPower);
      const flowRate = getFlowFromPower(powerW, coeffs);
      return {
        hour: h, label: `${h}:00`,
        power: Math.round(powerW),
        flowRate: +flowRate.toFixed(3),
        demand: +hourlyDemandM3.toFixed(4)
      };
    });
  };

  return {
    monthly, dailyServed, daysNotServed,
    yearlyPumped, yearlyDemand, yearlyDeficit, yearlyOverflow,
    reliability: yearlyDemand > 0 ? Math.max(0, (1 - yearlyDeficit / yearlyDemand) * 100) : 100,
    hourlyProfile
  };
}

function buildPumpCurveViz(pumpSegments, refHead, headM) {
  const rawCoeffs = buildPiecewiseCoeffs(pumpSegments);
  const coeffs = scaleCoeffs(rawCoeffs, refHead, headM);
  const maxP = Math.max(...pumpSegments.map(s => s.power));
  const points = [];
  for (let p = 0; p <= maxP; p += Math.max(5, maxP / 200)) {
    points.push({ power: Math.round(p), flow: +getFlowFromPower(p, coeffs).toFixed(3) });
  }
  return points;
}

// ─── THEME ────────────────────────────────────────────────────────
const C = {
  bg: "#0B1120", card: "#111827", cardAlt: "#0F172A", border: "#1E293B",
  accent: "#F59E0B",
  water: "#22D3EE", waterDim: "#0E7490",
  solar: "#FBBF24", solarDim: "#92400E",
  deficit: "#F87171", success: "#34D399", overflow: "#A78BFA",
  text: "#F1F5F9", textDim: "#94A3B8", textMuted: "#64748B",
  grid: "#1E293B"
};
const ttStyle = { backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "12px", color: C.text };

// ─── UI COMPONENTS ────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "20px 24px", ...style }}>{children}</div>;
}

function Stat({ label, value, unit, color, sub }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.card} 0%, ${color}12 100%)`, border: `1px solid ${color}30`, borderRadius: "12px", padding: "14px 18px", flex: 1, minWidth: "150px" }}>
      <div style={{ fontSize: "10px", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px", fontFamily: "monospace" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}<span style={{ fontSize: "13px", color: C.textDim, marginLeft: "3px" }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: "10px", color: C.textDim, marginTop: "3px" }}>{sub}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, unit, color }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", color: C.textDim, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "monospace" }}>{label}</span>
        <span style={{ fontSize: "18px", fontWeight: 700, color }}>
          {typeof value === "number" && value >= 1000 ? value.toLocaleString() : value}
          <span style={{ fontSize: "11px", color: C.textDim, marginLeft: "2px" }}>{unit}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: "5px", background: C.border, borderRadius: "3px" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: "3px", transition: "width 0.1s" }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
          style={{ position: "absolute", top: "-8px", left: 0, width: "100%", height: "22px", appearance: "none", background: "transparent", cursor: "pointer", WebkitAppearance: "none" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
        <span style={{ fontSize: "9px", color: C.textMuted }}>{min}{unit}</span>
        <span style={{ fontSize: "9px", color: C.textMuted }}>{max}{unit}</span>
      </div>
    </div>
  );
}

function Section({ icon, title, right, children }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>{icon}</span>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: "2px", background: C.cardAlt, borderRadius: "10px", padding: "3px", marginBottom: "20px" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: 1, padding: "8px 12px", borderRadius: "8px", border: "none",
          background: active === t.id ? C.card : "transparent",
          color: active === t.id ? C.accent : C.textMuted,
          fontSize: "12px", fontWeight: 600, cursor: "pointer",
          transition: "all 0.15s",
          boxShadow: active === t.id ? "0 1px 4px rgba(0,0,0,0.3)" : "none"
        }}>{t.icon} {t.label}</button>
      ))}
    </div>
  );
}

// ─── PUMP EDITOR ──────────────────────────────────────────────────
function PumpEditor({ segments, onChange, refHead, onRefHeadChange }) {
  const update = (idx, field, val) => {
    const next = segments.map((s, i) => i === idx ? { ...s, [field]: parseFloat(val) || 0 } : s);
    onChange(next);
  };
  const addRow = () => onChange([...segments, { flow: 0, power: 0 }]);
  const removeRow = (idx) => { if (segments.length > 2) onChange(segments.filter((_, i) => i !== idx)); };

  const inputStyle = {
    width: "80px", padding: "6px 8px", borderRadius: "6px", border: `1px solid ${C.border}`,
    background: C.cardAlt, color: C.text, fontSize: "12px", fontFamily: "monospace", textAlign: "center"
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
        <span style={{ fontSize: "11px", color: C.textDim, fontFamily: "monospace" }}>REF HEAD:</span>
        <input type="number" value={refHead} onChange={e => onRefHeadChange(+e.target.value || 1)} style={{ ...inputStyle, width: "60px" }} />
        <span style={{ fontSize: "11px", color: C.textMuted }}>m — head at which datasheet values apply</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 80px 80px 32px", gap: "4px 8px", alignItems: "center" }}>
        <div style={{ fontSize: "10px", color: C.textMuted, fontFamily: "monospace" }}>#</div>
        <div style={{ fontSize: "10px", color: C.water, fontFamily: "monospace", textAlign: "center" }}>FLOW m³/hr</div>
        <div style={{ fontSize: "10px", color: C.solar, fontFamily: "monospace", textAlign: "center" }}>POWER W</div>
        <div />
        {segments.map((seg, i) => [
          <span key={`n${i}`} style={{ fontSize: "11px", color: C.textMuted, fontFamily: "monospace" }}>{i + 1}</span>,
          <input key={`f${i}`} type="number" step="0.01" value={seg.flow} onChange={e => update(i, "flow", e.target.value)} style={inputStyle} />,
          <input key={`p${i}`} type="number" step="10" value={seg.power} onChange={e => update(i, "power", e.target.value)} style={inputStyle} />,
          <button key={`r${i}`} onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: C.deficit, cursor: "pointer", fontSize: "14px", padding: "2px" }} title="Remove">×</button>
        ])}
      </div>
      <button onClick={addRow} style={{
        marginTop: "10px", padding: "5px 14px", borderRadius: "6px",
        border: `1px dashed ${C.border}`, background: "transparent",
        color: C.textDim, fontSize: "11px", cursor: "pointer"
      }}>+ Add Point</button>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────
export default function SolarPumpDashboard() {
  // System params
  const [headM, setHeadM] = useState(150);
  const [storageLiters, setStorageLiters] = useState(5000);
  const [dailyDemandLiters, setDailyDemandLiters] = useState(2000);
  const [selectedMonth, setSelectedMonth] = useState(0);

  // Solar data
  const [profiles, setProfiles] = useState(DEFAULT_PROFILES);
  const [site, setSite] = useState(DEFAULT_SITE);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  // Pump
  const [pumpPreset, setPumpPreset] = useState("SQF-2 (1kW)");
  const [pumpSegments, setPumpSegments] = useState(PUMP_PRESETS["SQF-2 (1kW)"].segments);
  const [refHead, setRefHead] = useState(PUMP_PRESETS["SQF-2 (1kW)"].refHead);

  // Nav
  const [tab, setTab] = useState("sim");
  const fileRef = useRef(null);

  // ── CSV Upload ──
  const handleCSVUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadStatus(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = parsePVGIS_CSV(ev.target.result);
        setProfiles(result.profiles);
        setSite({
          lat: result.meta.lat ?? "?",
          lon: result.meta.lon ?? "?",
          elev: result.meta.elev ?? "?",
          name: file.name.replace(/\.(csv|txt)$/i, "").replace(/Timeseries_/i, "").replace(/_/g, " ")
        });
        setUploadStatus(`Loaded ${result.rowCount.toLocaleString()} hourly records using ${result.colUsed} · ${result.meta.db || "PVGIS"}${result.meta.kWp ? ` · ${result.meta.kWp} kWp` : ""} · ${result.meta.slope ?? "?"}° slope`);
      } catch (err) {
        setUploadError(err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const resetData = () => {
    setProfiles(DEFAULT_PROFILES);
    setSite(DEFAULT_SITE);
    setUploadStatus(null);
    setUploadError(null);
  };

  const handlePresetChange = (name) => {
    setPumpPreset(name);
    setPumpSegments([...PUMP_PRESETS[name].segments]);
    setRefHead(PUMP_PRESETS[name].refHead);
  };

  // ── Simulation ──
  const sim = useMemo(() => runSimulation({
    headM, storageLiters, dailyDemandLiters, profiles, pumpSegments, refHead
  }), [headM, storageLiters, dailyDemandLiters, profiles, pumpSegments, refHead]);

  const hourly = useMemo(() => sim.hourlyProfile(selectedMonth), [sim, selectedMonth]);
  const pumpViz = useMemo(() => buildPumpCurveViz(pumpSegments, refHead, headM), [pumpSegments, refHead, headM]);

  const monthlyChart = sim.monthly.map(m => ({
    month: m.month,
    pumped: +(m.totalPumped * 1000).toFixed(0),
    demand: +(m.totalDemand * 1000).toFixed(0),
    deficit: +(m.deficit * 1000).toFixed(0)
  }));

  const relColor = sim.reliability >= 90 ? C.success : sim.reliability >= 70 ? C.accent : C.deficit;
  const peopleServed = Math.round(dailyDemandLiters / LITERS_PER_PERSON);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 0 }}>
      <style>{`
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:${C.text}; border:3px solid ${C.accent}; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.4); }
        input[type="range"]::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background:${C.text}; border:3px solid ${C.accent}; cursor:pointer; }
        * { box-sizing: border-box; }
      `}</style>

      {/* HEADER */}
      <div style={{ background: `linear-gradient(135deg, ${C.card} 0%, ${C.solarDim}20 50%, ${C.waterDim}20 100%)`, borderBottom: `1px solid ${C.border}`, padding: "20px 24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <span style={{ fontSize: "24px" }}>☀️</span>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, background: `linear-gradient(135deg, ${C.accent}, ${C.water})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Solar Water Pump Simulator
          </h1>
        </div>
        <div style={{ fontSize: "11px", color: C.textDim, fontFamily: "monospace" }}>
          {site.name} · {site.lat}°N, {site.lon}°E · {site.elev}m ASL · {pumpPreset}
        </div>
      </div>

      <div style={{ padding: "16px 20px", maxWidth: "1240px", margin: "0 auto" }}>

        {/* STAT CARDS */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          <Stat label="Annual Pumped" value={(sim.yearlyPumped * 1000).toFixed(0)} unit="L" color={C.water} sub={`${sim.yearlyPumped.toFixed(1)} m³`} />
          <Stat label="Reliability" value={sim.reliability.toFixed(1)} unit="%" color={relColor} sub={sim.yearlyDeficit > 0 ? `${(sim.yearlyDeficit * 1000).toFixed(0)}L deficit` : "No deficit"} />
          <Stat label="Avg Daily" value={(sim.yearlyPumped / 365 * 1000).toFixed(0)} unit="L/d" color={C.solar} sub={`Demand: ${dailyDemandLiters}L/d`} />
          <Stat label="Days Not Served" value={sim.daysNotServed} unit={`/ 365`} color={sim.daysNotServed === 0 ? C.success : C.deficit} sub={sim.daysNotServed === 0 ? "Full coverage" : `${(sim.daysNotServed / 365 * 100).toFixed(1)}% of year`} />
        </div>

        {/* TABS */}
        <Tabs tabs={[
          { id: "sim", icon: "📊", label: "Simulation" },
          { id: "data", icon: "📁", label: "PVGIS Data" },
          { id: "pump", icon: "🔧", label: "Pump Setup" }
        ]} active={tab} onChange={setTab} />

        {/* ═══ SIMULATION TAB ═══ */}
        {tab === "sim" && (
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "16px" }}>
            <Card style={{ height: "fit-content", position: "sticky", top: "16px" }}>
              <Section icon="⚙️" title="Parameters">
                <Slider label="Storage Tank" value={storageLiters} min={500} max={40000} step={500} onChange={setStorageLiters} unit="L" color={C.overflow} />
                <Slider label="Daily Demand" value={dailyDemandLiters} min={200} max={25000} step={100} onChange={setDailyDemandLiters} unit="L" color={C.accent} />
              </Section>
              <div style={{ marginTop: "12px", padding: "12px", background: `${C.accent}08`, border: `1px solid ${C.accent}18`, borderRadius: "8px", fontSize: "11px", color: C.textDim, lineHeight: 1.8 }}>
                Pump: <span style={{ color: C.text }}>{pumpPreset}</span><br/>
                Tank: <span style={{ color: C.text }}>{(storageLiters/1000).toFixed(1)} m³</span><br/>
                Serves: <span style={{ color: C.text }}>~{peopleServed} people @ {LITERS_PER_PERSON}L/d</span>
              </div>
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Monthly Bar */}
              <Card>
                <Section icon="📊" title="Monthly Water Balance">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthlyChart} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                      <XAxis dataKey="month" tick={{ fill: C.textDim, fontSize: 10 }} />
                      <YAxis tick={{ fill: C.textDim, fontSize: 10 }} />
                      <Tooltip contentStyle={ttStyle} formatter={(v) => [`${v.toLocaleString()} L`]} />
                      <Bar dataKey="pumped" name="Pumped" fill={C.water} radius={[3,3,0,0]} />
                      <Bar dataKey="demand" name="Demand" fill={C.accent} radius={[3,3,0,0]} opacity={0.5} />
                      <Bar dataKey="deficit" name="Deficit" fill={C.deficit} radius={[3,3,0,0]} />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              </Card>

              {/* Hourly Profile */}
              <Card>
                <Section icon="🕐" title={`Hourly Profile — ${MONTH_NAMES[selectedMonth]}`}
                  right={
                    <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                      {MONTH_NAMES.map((n, i) => (
                        <button key={i} onClick={() => setSelectedMonth(i)} style={{
                          padding: "3px 8px", borderRadius: "5px",
                          border: `1px solid ${i === selectedMonth ? C.accent : C.border}`,
                          background: i === selectedMonth ? `${C.accent}18` : "transparent",
                          color: i === selectedMonth ? C.accent : C.textMuted,
                          fontSize: "9px", fontWeight: 600, cursor: "pointer", fontFamily: "monospace"
                        }}>{n}</button>
                      ))}
                    </div>
                  }>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={hourly}>
                      <defs>
                        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.solar} stopOpacity={0.25}/><stop offset="100%" stopColor={C.solar} stopOpacity={0.02}/></linearGradient>
                        <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.water} stopOpacity={0.25}/><stop offset="100%" stopColor={C.water} stopOpacity={0.02}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                      <XAxis dataKey="label" tick={{ fill: C.textDim, fontSize: 9 }} interval={2} />
                      <YAxis yAxisId="p" tick={{ fill: C.textDim, fontSize: 9 }} label={{ value: "Power (W)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10 }} />
                      <YAxis yAxisId="f" orientation="right" tick={{ fill: C.textDim, fontSize: 9 }} label={{ value: "Flow (m³/hr)", angle: 90, position: "insideRight", fill: C.textDim, fontSize: 10 }} />
                      <Tooltip contentStyle={ttStyle} />
                      <Area yAxisId="p" type="monotone" dataKey="power" name="PV Power (W)" stroke={C.solar} fill="url(#sg)" strokeWidth={2} />
                      <Area yAxisId="f" type="monotone" dataKey="flowRate" name="Flow (m³/hr)" stroke={C.water} fill="url(#wg)" strokeWidth={2} />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Section>
              </Card>

              {/* Daily Load Served */}
              <Card>
                <Section icon="💧" title="Daily Load Served">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={sim.dailyServed} barCategoryGap={0}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                      <XAxis dataKey="day" tick={{ fill: C.textDim, fontSize: 9 }} interval={29}
                        label={{ value: "Day of Year", position: "bottom", fill: C.textDim, fontSize: 10, dy: 5 }} />
                      <YAxis tick={{ fill: C.textDim, fontSize: 9 }} label={{ value: "Liters", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10 }} />
                      <Tooltip contentStyle={ttStyle}
                        formatter={(v, name) => [`${v.toLocaleString()} L`, name === "served" ? "Water Delivered" : "Daily Demand"]}
                        labelFormatter={(d) => `Day ${d}`} />
                      <Bar dataKey="served" name="served" fill={C.water} radius={0} isAnimationActive={false} />
                      <ReferenceLine y={dailyDemandLiters} stroke={C.accent} strokeWidth={2} strokeDasharray="6 3"
                        label={{ value: `Demand: ${dailyDemandLiters}L`, position: "right", fill: C.accent, fontSize: 10 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              </Card>

              {/* Table */}
              <Card>
                <Section icon="📋" title="Monthly Summary">
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "monospace" }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {["Month","Days","Pumped (L)","Demand (L)","Deficit (L)","Avg Daily (L)","Reliability"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: C.textMuted, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sim.monthly.map((m, i) => {
                          const rel = m.totalDemand > 0 ? Math.max(0, (1 - m.deficit / m.totalDemand) * 100) : 100;
                          const rc = rel >= 90 ? C.success : rel >= 70 ? C.accent : C.deficit;
                          return (
                            <tr key={i} onClick={() => setSelectedMonth(i)}
                              style={{ borderBottom: `1px solid ${C.border}15`, cursor: "pointer", background: selectedMonth === i ? `${C.accent}06` : "transparent" }}>
                              <td style={{ padding: "8px 10px", fontWeight: 600 }}>{m.month}</td>
                              <td style={{ padding: "8px 10px", color: C.textDim }}>{m.days}</td>
                              <td style={{ padding: "8px 10px", color: C.water }}>{(m.totalPumped*1000).toFixed(0)}</td>
                              <td style={{ padding: "8px 10px", color: C.accent }}>{(m.totalDemand*1000).toFixed(0)}</td>
                              <td style={{ padding: "8px 10px", color: m.deficit > 0 ? C.deficit : C.textMuted }}>{m.deficit > 0 ? (m.deficit*1000).toFixed(0) : "—"}</td>
                              <td style={{ padding: "8px 10px", color: C.textDim }}>{(m.avgDailyPumped*1000).toFixed(0)}</td>
                              <td style={{ padding: "8px 10px" }}><span style={{ color: rc, background: `${rc}12`, padding: "2px 7px", borderRadius: "4px", fontSize: "10px", fontWeight: 600 }}>{rel.toFixed(1)}%</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
              </Card>
            </div>
          </div>
        )}

        {/* ═══ PVGIS DATA TAB ═══ */}
        {tab === "data" && (
          <Card>
            <Section icon="📁" title="PVGIS Hourly Data">
              <p style={{ fontSize: "13px", color: C.textDim, lineHeight: 1.7, margin: "0 0 16px" }}>
                Upload hourly data exported from PVGIS. Configure your PV system (location, installed peak PV power kWp, slope, and azimuth) on the
                PVGIS website before downloading.
              </p>

              <a href="https://re.jrc.ec.europa.eu/pvg_tools/en/" target="_blank" rel="noreferrer"
                style={{
                  display: "inline-block", padding: "10px 22px", borderRadius: "8px",
                  background: `${C.solar}18`, border: `1px solid ${C.solar}40`, color: C.solar,
                  fontSize: "13px", fontWeight: 600, textDecoration: "none", marginBottom: "16px"
                }}>
                Open PVGIS Interactive Tool ↗
              </a>

              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSVUpload} style={{ display: "none" }} />
                <button onClick={() => fileRef.current?.click()} style={{
                  padding: "10px 24px", borderRadius: "8px", border: `1px solid ${C.accent}`,
                  background: `${C.accent}15`, color: C.accent, fontSize: "13px", fontWeight: 600, cursor: "pointer"
                }}>Upload CSV File</button>
                <button onClick={resetData} style={{
                  padding: "10px 20px", borderRadius: "8px", border: `1px solid ${C.border}`,
                  background: "transparent", color: C.textDim, fontSize: "13px", cursor: "pointer"
                }}>Reset to Default</button>
              </div>

              {uploadStatus && <div style={{ padding: "10px 16px", background: `${C.success}12`, border: `1px solid ${C.success}30`, borderRadius: "8px", color: C.success, fontSize: "12px", marginBottom: "12px" }}>✓ {uploadStatus}</div>}
              {uploadError && <div style={{ padding: "10px 16px", background: `${C.deficit}12`, border: `1px solid ${C.deficit}30`, borderRadius: "8px", color: C.deficit, fontSize: "12px", marginBottom: "12px" }}>⚠ {uploadError}</div>}

              {/* Site info */}
              <div style={{ padding: "12px 16px", background: C.cardAlt, borderRadius: "8px", marginBottom: "20px", fontSize: "12px", color: C.textDim, lineHeight: 1.7 }}>
                <strong style={{ color: C.text }}>Current site:</strong> {site.name} · {site.lat}°N, {site.lon}°E · {site.elev}m elevation
              </div>

              {/* All 12 month profiles */}
              <div>
                <h3 style={{ fontSize: "13px", color: C.text, marginBottom: "10px" }}>Average Monthly Irradiance Profiles</h3>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="hour" type="number" domain={[0, 23]} tick={{ fill: C.textDim, fontSize: 10 }} tickFormatter={h => `${h}:00`} />
                    <YAxis tick={{ fill: C.textDim, fontSize: 10 }} label={{ value: "W/m²", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10 }} />
                    <Tooltip contentStyle={ttStyle} labelFormatter={h => `${h}:00`} />
                    {MONTH_NAMES.map((name, m) => {
                      // Generate distinct colors for 12 months
                      const hue = (m * 30) % 360;
                      const color = `hsl(${hue}, 75%, 60%)`;
                      return (
                        <Line key={m} data={profiles[m+1].map((v,h) => ({hour:h, value:v}))}
                          dataKey="value" name={name}
                          stroke={color} strokeWidth={1.5} dot={false} />
                      );
                    })}
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* How-to */}
              <div style={{ marginTop: "20px", padding: "14px", background: C.cardAlt, borderRadius: "8px" }}>
                <h4 style={{ fontSize: "12px", color: C.textDim, margin: "0 0 8px" }}>How to download from PVGIS:</h4>
                <ol style={{ fontSize: "12px", color: C.textDim, lineHeight: 1.8, margin: 0, paddingLeft: "20px" }}>
                  <li>Open <a href="https://re.jrc.ec.europa.eu/pvg_tools/en/" target="_blank" rel="noreferrer" style={{ color: C.accent }}>PVGIS Interactive Tool</a></li>
                  <li>Enter your site coordinates on the left window</li>
                  <li>Select <strong style={{ color: C.text }}>"Hourly data"</strong> in the left panel</li>
                  <li>Set <strong style={{ color: C.text }}>installed peak PV power (kWp)</strong>, panel slope, and azimuth</li>
                  <li>Click the blue <strong style={{ color: C.text }}>download CSV</strong> button at the bottom of the page</li>
                  <li>Upload the CSV file here</li>
                </ol>
              </div>
            </Section>
          </Card>
        )}

        {/* ═══ PUMP SETUP TAB ═══ */}
        {tab === "pump" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Card>
              <Section icon="🔧" title="Pump Configuration">
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "6px", fontFamily: "monospace", textTransform: "uppercase" }}>Preset</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {Object.keys(PUMP_PRESETS).map(name => (
                      <button key={name} onClick={() => handlePresetChange(name)} style={{
                        padding: "6px 14px", borderRadius: "6px",
                        border: `1px solid ${pumpPreset === name ? C.accent : C.border}`,
                        background: pumpPreset === name ? `${C.accent}15` : "transparent",
                        color: pumpPreset === name ? C.accent : C.textDim,
                        fontSize: "11px", fontWeight: 600, cursor: "pointer"
                      }}>{name}</button>
                    ))}
                  </div>
                </div>
                <PumpEditor
                  segments={pumpSegments}
                  onChange={(s) => { setPumpSegments(s); setPumpPreset("Custom"); }}
                  refHead={refHead}
                  onRefHeadChange={setRefHead}
                />
                <div style={{ marginTop: "16px", padding: "12px", background: C.cardAlt, borderRadius: "8px", fontSize: "11px", color: C.textDim, lineHeight: 1.7 }}>
                  <strong style={{ color: C.text }}>How to use:</strong> Enter flow (m³/hr) and power (W) data points from your pump's
                  performance datasheet at the reference total dynamic head. The simulator builds a piecewise-linear curve
                  and scales flow inversely when you adjust head on the Simulation tab.
                </div>
              </Section>
            </Card>
            <Card>
              <Section icon="📈" title={`Pump Curve Preview @ ${headM}m`}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={pumpViz}>
                    <defs><linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.water} stopOpacity={0.2}/><stop offset="100%" stopColor={C.water} stopOpacity={0.02}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="power" tick={{ fill: C.textDim, fontSize: 10 }} label={{ value: "Power (W)", position: "bottom", fill: C.textDim, fontSize: 10 }} />
                    <YAxis tick={{ fill: C.textDim, fontSize: 10 }} label={{ value: "Flow (m³/hr)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10 }} />
                    <Tooltip contentStyle={ttStyle} formatter={(v) => [`${v} m³/hr`]} labelFormatter={(l) => `${l} W`} />
                    <Area type="monotone" dataKey="flow" stroke={C.water} fill="url(#pg2)" strokeWidth={2.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "6px" }}>Data points at ref head ({refHead}m):</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {[...pumpSegments].sort((a,b) => a.power - b.power).map((s, i) => (
                      <span key={i} style={{ fontSize: "10px", padding: "3px 8px", background: C.cardAlt, borderRadius: "4px", color: C.textDim, fontFamily: "monospace" }}>
                        {s.power}W → {s.flow} m³/hr
                      </span>
                    ))}
                  </div>
                </div>
              </Section>
            </Card>
          </div>
        )}

        {/* FOOTER */}
        <div style={{ marginTop: "20px", padding: "14px 18px", background: C.card, border: `1px solid ${C.border}`, borderRadius: "10px", fontSize: "10px", color: C.textMuted, lineHeight: 1.6, fontFamily: "monospace" }}>
          <strong style={{ color: C.textDim }}>Model:</strong> Hourly timestep · PVGIS solar data · Piecewise-linear pump curve · Flow ∝ 1/head ·
          {" "}Built by <strong style={{ color: C.accent }}>Tuneh Knott</strong> — Engineers Without Borders, Virginia Tech
        </div>
      </div>
    </div>
  );
}
