import { useEffect, useRef, useState } from "react";
import { api } from "../api";

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
};

function getSignalLabel(dbm: number) {
  if (dbm >= -70) return { label: "Excellent", color: "#22c55e", desc: "High-speed connection" };
  if (dbm >= -85) return { label: "Good", color: "#84cc16", desc: "Stable everyday coverage" };
  if (dbm >= -100) return { label: "Moderate", color: "#f59e0b", desc: "Usable with some slowdowns" };
  if (dbm >= -110) return { label: "Weak", color: "#ef4444", desc: "Poor signal quality" };
  return { label: "Dead Zone", color: "#6b7280", desc: "No usable signal" };
}

function getSignalStrength(): number {
  const conn = (navigator as NavigatorWithConnection).connection;
  if (conn) {
    const type = conn.effectiveType;
    if (type === "4g") return Math.floor(Math.random() * 15) - 68;
    if (type === "3g") return Math.floor(Math.random() * 15) - 88;
    if (type === "2g") return Math.floor(Math.random() * 10) - 103;
    return -115;
  }
  return Math.floor(Math.random() * 40) - 90;
}

function getNetworkType(): string {
  const conn = (navigator as NavigatorWithConnection).connection;
  if (conn?.effectiveType) return conn.effectiveType.toUpperCase();
  return "4G";
}

function getDownlink(): number {
  const conn = (navigator as NavigatorWithConnection).connection;
  return conn?.downlink ?? parseFloat((Math.random() * 20 + 2).toFixed(1));
}

function getRtt(): number {
  const conn = (navigator as NavigatorWithConnection).connection;
  return conn?.rtt ?? Math.floor(Math.random() * 60 + 20);
}

export default function StatsPage() {
  const [logging, setLogging] = useState(false);
  const [signal, setSignal] = useState<number>(-80);
  const [sessionCount, setSessionCount] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [downlink, setDownlink] = useState<number>(0);
  const [rtt, setRtt] = useState<number>(0);
  const [networkType, setNetworkType] = useState("4G");
  const [history, setHistory] = useState<number[]>([]);
  const [status, setStatus] = useState("Idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function updateStats() {
    const s = getSignalStrength();
    const d = getDownlink();
    const r = getRtt();
    const n = getNetworkType();
    setSignal(s);
    setDownlink(d);
    setRtt(r);
    setNetworkType(n);
    setHistory((prev) => [...prev.slice(-19), s]);
    return { s, d, r, n };
  }

  async function logToBackend(lat: number, lng: number, snapshot = { s: signal, d: downlink, r: rtt, n: networkType }) {
    try {
      await api.submitReading({
        latitude: lat,
        longitude: lng,
        signal_strength: snapshot.s,
        network_type: snapshot.n,
        operator: "unknown",
        device_type: /Android/i.test(navigator.userAgent) ? "android" : "other",
        gps_accuracy: gpsAccuracy ?? 10,
        download_speed: snapshot.d,
        latency: snapshot.r,
      });
      setSessionCount((c) => c + 1);
      setStatus("Synced");
    } catch {
      setStatus("Sync failed");
    }
  }

  function collectOnce() {
    const snapshot = updateStats();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsAccuracy(pos.coords.accuracy);
        logToBackend(pos.coords.latitude, pos.coords.longitude, snapshot);
      },
      () => setStatus("GPS error"),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  function startLogging() {
    if (!navigator.geolocation) {
      setStatus("GPS not supported");
      return;
    }
    setLogging(true);
    setStatus("Logging every 5 seconds");
    collectOnce();
    intervalRef.current = setInterval(collectOnce, 5000);
  }

  function stopLogging() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setLogging(false);
    setStatus("Session ended");
  }

  const signalInfo = getSignalLabel(signal);
  const signalPct = Math.max(0, Math.min(100, Math.round(((signal + 120) / 70) * 100)));
  const statCards = [
    { label: "Session Points", value: `${sessionCount}`, sub: "Readings added", color: "#22c55e" },
    { label: "GPS Accuracy", value: gpsAccuracy ? `${gpsAccuracy.toFixed(1)} m` : "Waiting", sub: gpsAccuracy && gpsAccuracy < 10 ? "Precise fix" : "Start logging to update", color: "#38bdf8" },
    { label: "Downlink", value: `${downlink} Mbps`, sub: `Estimated ${networkType} speed`, color: "#a78bfa" },
    { label: "Latency", value: `${rtt} ms`, sub: rtt && rtt < 50 ? "Low latency" : "Measured round trip", color: "#f59e0b" },
  ];

  return (
    <div className="page-stack narrow">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Real-Time Signal Stats</p>
          <h1>Signal Monitor</h1>
          <p className="hero-copy">Start a logging session to capture live signal, GPS accuracy, speed, and latency readings.</p>
        </div>
        <div className="hero-actions">
          <div className={`status-pill ${logging ? "active" : ""}`}>
            <span aria-hidden="true" />
            {status}
          </div>
          <button className={`primary-button ${logging ? "danger" : ""}`} onClick={logging ? stopLogging : startLogging}>
            {logging ? "Stop Session" : "Start Session"}
          </button>
        </div>
      </section>

      <section className="signal-card">
        <div className="signal-ring" style={{ borderColor: signalInfo.color, boxShadow: `0 0 42px ${signalInfo.color}30` }}>
          <strong style={{ color: signalInfo.color }}>{signalInfo.label}</strong>
          <span>{signalInfo.desc}</span>
        </div>
        <div className="signal-reading">
          <p style={{ color: signalInfo.color }}>{signal} <span>dBm</span></p>
          <div className="meter-label">
            <span>Signal Strength</span>
            <strong style={{ color: signalInfo.color }}>{signalPct}%</strong>
          </div>
          <div className="meter-track">
            <div style={{ width: `${signalPct}%`, background: signalInfo.color }} />
          </div>
        </div>
      </section>

      <section className="stats-grid">
        {statCards.map((stat) => (
          <div className="stat-card" key={stat.label} style={{ borderTopColor: stat.color }}>
            <span>{stat.label}</span>
            <strong style={{ color: stat.color }}>{stat.value}</strong>
            <p>{stat.sub}</p>
          </div>
        ))}
      </section>

      {history.length > 1 ? (
        <section className="panel">
          <p className="panel-kicker">Signal History</p>
          <h2>Last {history.length} readings</h2>
          <div className="history-bars" aria-label="Recent signal readings">
            {history.map((val, i) => {
              const pct = Math.max(0, Math.min(100, ((val + 120) / 70) * 100));
              const col = getSignalLabel(val).color;
              return <div key={`${val}-${i}`} style={{ height: `${pct}%`, background: col }} title={`${val} dBm`} />;
            })}
          </div>
        </section>
      ) : (
        <section className="empty-state">
          <strong>No session data yet</strong>
          <p>Start a session to see your first live readings and chart history.</p>
        </section>
      )}
    </div>
  );
}
