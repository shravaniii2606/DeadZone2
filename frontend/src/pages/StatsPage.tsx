import { useEffect, useState } from "react";
import { api } from "../api";

interface Reading {
  latitude: number;
  longitude: number;
  signal_strength: number;
  network_type: string;
  operator: string;
}

interface OperatorStat {
  operator: string;
  avgSignal: number;
  total: number;
  deadZones: number;
  deadZonePct: number;
  dominant_network: string;
  color: string;
}

interface DeadZoneHotspot {
  lat: number;
  lng: number;
  count: number;
  avgSignal: number;
  area: string;
}

interface NetworkStat {
  type: string;
  count: number;
  pct: number;
  color: string;
}

const OPERATOR_COLORS: Record<string, string> = {
  Jio: "#0ea5e9",
  Airtel: "#f59e0b",
  Vi: "#a855f7",
  BSNL: "#22c55e",
  unknown: "#6b7280",
};

const NETWORK_COLORS: Record<string, string> = {
  "5g": "#a855f7",
  "4g": "#3b82f6",
  "3g": "#f59e0b",
  "2g": "#ef4444",
  "slow-2g": "#dc2626",
  unknown: "#6b7280",
};

function getSignalColor(s: number) {
  if (s >= -70) return "#22c55e";
  if (s >= -85) return "#84cc16";
  if (s >= -100) return "#f59e0b";
  if (s >= -110) return "#ef4444";
  return "#6b7280";
}

function getAreaName(lat: number, lng: number): string {
  if (lat > 19.20) return "Thane / Mulund";
  if (lat > 19.15) return "Ghatkopar / Vikhroli";
  if (lat > 19.10) return "Kurla / Sion";
  if (lat > 19.05) return "Dharavi / Matunga";
  if (lat > 19.00) return "Dadar / Parel";
  if (lat > 18.97) return "Worli / Lower Parel";
  return "Colaba / South Mumbai";
}

export default function StatsPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [operatorStats, setOperatorStats] = useState<OperatorStat[]>([]);
  const [hotspots, setHotspots] = useState<DeadZoneHotspot[]>([]);
  const [networkStats, setNetworkStats] = useState<NetworkStat[]>([]);
  const [totalReadings, setTotalReadings] = useState(0);
  const [totalDeadZones, setTotalDeadZones] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await api.getHeatmap();
      if (res.success && Array.isArray(res.data)) {
        const data: Reading[] = res.data;
        setReadings(data);
        processData(data);
      }
    } catch (e) {
      console.error("Failed to fetch data", e);
    } finally {
      setLoading(false);
    }
  }

  function processData(data: Reading[]) {
    setTotalReadings(data.length);
    const deadCount = data.filter(r => r.signal_strength < -100).length;
    setTotalDeadZones(deadCount);

    // Operator stats
    const opMap: Record<string, { signals: number[]; networks: string[] }> = {};
    data.forEach(r => {
      const op = r.operator || "unknown";
      if (!opMap[op]) opMap[op] = { signals: [], networks: [] };
      opMap[op].signals.push(r.signal_strength);
      opMap[op].networks.push(r.network_type?.toLowerCase() || "unknown");
    });

    const opStats: OperatorStat[] = Object.entries(opMap)
      .map(([op, { signals, networks }]) => {
        const avg = signals.reduce((a, b) => a + b, 0) / signals.length;
        const dead = signals.filter(s => s < -100).length;
        const netCount: Record<string, number> = {};
        networks.forEach(n => { netCount[n] = (netCount[n] || 0) + 1; });
        const dominant = Object.entries(netCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
        return {
          operator: op,
          avgSignal: Math.round(avg),
          total: signals.length,
          deadZones: dead,
          deadZonePct: Math.round((dead / signals.length) * 100),
          dominant_network: dominant.toUpperCase(),
          color: OPERATOR_COLORS[op] || "#6b7280",
        };
      })
      .sort((a, b) => b.avgSignal - a.avgSignal);

    setOperatorStats(opStats);

    // Dead zone hotspots — grid-based clustering
    const grid: Record<string, { lats: number[]; lngs: number[]; signals: number[] }> = {};
    data.filter(r => r.signal_strength < -100).forEach(r => {
      const key = `${(r.latitude * 20).toFixed(0)},${(r.longitude * 20).toFixed(0)}`;
      if (!grid[key]) grid[key] = { lats: [], lngs: [], signals: [] };
      grid[key].lats.push(r.latitude);
      grid[key].lngs.push(r.longitude);
      grid[key].signals.push(r.signal_strength);
    });

    const spots: DeadZoneHotspot[] = Object.values(grid)
      .filter(g => g.lats.length >= 2)
      .map(g => {
        const lat = g.lats.reduce((a, b) => a + b, 0) / g.lats.length;
        const lng = g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length;
        return {
          lat, lng,
          count: g.lats.length,
          avgSignal: Math.round(g.signals.reduce((a, b) => a + b, 0) / g.signals.length),
          area: getAreaName(lat, lng),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    setHotspots(spots);

    // Network distribution
    const netMap: Record<string, number> = {};
    data.forEach(r => {
      const nt = r.network_type?.toLowerCase() || "unknown";
      netMap[nt] = (netMap[nt] || 0) + 1;
    });

    const netStats: NetworkStat[] = Object.entries(netMap)
      .map(([type, count]) => ({
        type,
        count,
        pct: Math.round((count / data.length) * 100),
        color: NETWORK_COLORS[type] || "#6b7280",
      }))
      .sort((a, b) => b.count - a.count);

    setNetworkStats(netStats);
  }

  if (loading) return (
    <div className="page-stack" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <p style={{ opacity: 0.5 }}>Loading telecom intelligence...</p>
    </div>
  );

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Telecom Intelligence Dashboard</p>
          <h1>Network Analytics</h1>
          <p className="hero-copy">Crowdsourced signal intelligence across Mumbai — operator performance, dead zone hotspots, and coverage gaps.</p>
        </div>
      </section>

      {/* Summary Stats */}
      <section className="stats-grid">
        {[
          { label: "Total Readings", value: totalReadings.toLocaleString(), color: "#22c55e", sub: "Crowdsourced data points" },
          { label: "Dead Zones Found", value: totalDeadZones.toLocaleString(), color: "#ef4444", sub: `${Math.round((totalDeadZones/totalReadings)*100)}% of coverage area` },
          { label: "Operators Tracked", value: operatorStats.length.toString(), color: "#a855f7", sub: "Jio, Airtel, Vi, BSNL" },
          { label: "Areas Covered", value: "Mumbai MMR", color: "#38bdf8", sub: "18.89°N – 19.27°N" },
        ].map(s => (
          <div className="stat-card" key={s.label} style={{ borderTopColor: s.color }}>
            <span>{s.label}</span>
            <strong style={{ color: s.color }}>{s.value}</strong>
            <p>{s.sub}</p>
          </div>
        ))}
      </section>

      {/* Operator Comparison */}
      <section className="panel">
        <p className="panel-kicker">Operator Performance</p>
        <h2>Signal Quality by Provider</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
          {operatorStats.map(op => (
            <div key={op.operator} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: "80px", fontWeight: 700, color: op.color }}>{op.operator}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.8rem" }}>
                  <span>Avg Signal: <strong style={{ color: getSignalColor(op.avgSignal) }}>{op.avgSignal}</strong></span>
                  <span>Dead Zones: <strong style={{ color: "#ef4444" }}>{op.deadZonePct}%</strong></span>
                  <span>Network: <strong>{op.dominant_network}</strong></span>
                  <span style={{ opacity: 0.5 }}>{op.total} readings</span>
                </div>
                <div style={{ height: "6px", background: "#1a1a1a", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ // Replace the bar width calculation:
width: `${Math.max(0, Math.min(100, ((op.avgSignal + 120) / 65) * 100))}%`, height: "100%", background: op.color, borderRadius: "3px", transition: "width 0.5s" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Dead Zone Hotspots */}
      <section className="panel">
        <p className="panel-kicker">Dead Zone Intelligence</p>
        <h2>Top Hotspots Requiring Attention</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
          {hotspots.length === 0 ? (
            <p style={{ opacity: 0.5 }}>No significant dead zone clusters found</p>
          ) : hotspots.map((spot, i) => (
            <div key={i} style={{ background: "#0d1a0d", border: "1px solid #ef444433", borderRadius: "8px", padding: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "#ef4444" }}>#{i + 1} {spot.area}</strong>
                <span style={{ fontSize: "0.75rem", background: "#ef444422", color: "#ef4444", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>
                  {spot.count} reports
                </span>
              </div>
              <p style={{ fontSize: "0.78rem", opacity: 0.6, margin: "0.25rem 0" }}>
                {spot.lat.toFixed(4)}°N, {spot.lng.toFixed(4)}°E
              </p>
              <p style={{ fontSize: "0.8rem", margin: 0 }}>
                Avg Signal: <strong style={{ color: getSignalColor(spot.avgSignal) }}>{spot.avgSignal}</strong>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Network Distribution */}
      <section className="panel">
        <p className="panel-kicker">Network Coverage</p>
        <h2>Distribution by Generation</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1rem" }}>
          {networkStats.map(n => (
            <div key={n.type} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: "70px", fontWeight: 700, color: n.color }}>{n.type.toUpperCase()}</div>
              <div style={{ flex: 1, height: "8px", background: "#1a1a1a", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${n.pct}%`, height: "100%", background: n.color, borderRadius: "4px", transition: "width 0.5s" }} />
              </div>
              <div style={{ width: "60px", textAlign: "right", fontSize: "0.8rem" }}>
                <strong>{n.pct}%</strong> <span style={{ opacity: 0.5 }}>({n.count})</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Business Value */}
      <section className="panel" style={{ borderLeft: "4px solid #22c55e" }}>
        <p className="panel-kicker">Business Intelligence</p>
        <h2>Why Telecom Companies Need This</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {[
            { icon: "📡", title: "Tower Placement", desc: "Identify exact coordinates where new towers will eliminate the most dead zones" },
            { icon: "📊", title: "Competitor Analysis", desc: "Compare signal quality across operators to identify market gaps" },
            { icon: "🏛️", title: "TRAI Compliance", desc: "Ground truth data for regulatory reporting and coverage commitments" },
            { icon: "💰", title: "ROI Optimization", desc: "Prioritize infrastructure spend based on crowdsourced impact data" },
          ].map(b => (
            <div key={b.title} style={{ background: "#0d1a0d", borderRadius: "8px", padding: "0.75rem" }}>
              <p style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>{b.icon}</p>
              <strong style={{ color: "#22c55e" }}>{b.title}</strong>
              <p style={{ fontSize: "0.8rem", opacity: 0.7, margin: "0.25rem 0 0" }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}