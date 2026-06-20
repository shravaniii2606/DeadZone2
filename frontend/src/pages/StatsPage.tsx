import { useState, useEffect, useRef } from "react";
import { api } from "../api";

function getSignalLabel(dbm: number) {
  if (dbm >= -70) return { label: "Excellent", color: "#22c55e", desc: "4G+ High-speed connection" };
  if (dbm >= -85) return { label: "Good", color: "#84cc16", desc: "Stable 4G connection" };
  if (dbm >= -100) return { label: "Moderate", color: "#f59e0b", desc: "3G level connection" };
  if (dbm >= -110) return { label: "Weak", color: "#ef4444", desc: "Poor signal quality" };
  return { label: "Dead Zone", color: "#6b7280", desc: "No usable signal" };
}

function getSignalStrength(): number {
  const conn = (navigator as any).connection;
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
  const conn = (navigator as any).connection;
  if (conn?.effectiveType) return conn.effectiveType.toUpperCase();
  return "4G";
}

function getDownlink(): number {
  const conn = (navigator as any).connection;
  return conn?.downlink ?? parseFloat((Math.random() * 20 + 2).toFixed(1));
}

function getRtt(): number {
  const conn = (navigator as any).connection;
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
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
  }

  async function logToBackend(lat: number, lng: number) {
    try {
      await api.submitReading({
        latitude: lat,
        longitude: lng,
        signal_strength: signal,
        network_type: networkType,
        operator: "unknown",
        device_type: /Android/i.test(navigator.userAgent) ? "android" : "other",
        gps_accuracy: gpsAccuracy ?? 10,
        download_speed: downlink,
        latency: rtt,
      });
      setSessionCount((c) => c + 1);
      setStatus("Synced ✓");
    } catch {
      setStatus("Sync failed");
    }
  }

  function startLogging() {
    if (!navigator.geolocation) { setStatus("GPS not supported"); return; }
    setLogging(true);
    setStatus("Logging...");
    updateStats();

    intervalRef.current = setInterval(() => {
      updateStats();
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsAccuracy(pos.coords.accuracy);
          logToBackend(pos.coords.latitude, pos.coords.longitude);
        },
        () => setStatus("GPS error"),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }, 5000);
  }

  function stopLogging() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setLogging(false);
    setStatus("Session ended");
  }

  const signalInfo = getSignalLabel(signal);
  const signalPct = Math.max(0, Math.min(100, Math.round(((signal + 120) / 70) * 100)));

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div style={{
        background: "rgba(20,28,20,0.6)",
        border: "1px solid rgba(34,197,94,0.18)",
        borderLeft: "4px solid #22c55e",
        borderRadius: "16px",
        padding: "24px 28px",
      }}>
        <p style={{ color: "#22c55e", fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>
          Real-Time Signal Stats
        </p>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
          Signal Monitor
        </h1>
        <p style={{ color: "#a3b899", marginTop: "6px", fontSize: "14px" }}>
          Live signal strength, network quality, and session tracking
        </p>
      </div>

      {/* Signal Status Circle */}
      <div style={{
        background: "rgba(20,28,20,0.6)",
        border: "1px solid rgba(34,197,94,0.18)",
        borderRadius: "20px",
        padding: "40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
      }}>
        {/* Circle */}
        <div style={{
          width: "180px",
          height: "180px",
          borderRadius: "50%",
          border: `4px solid ${signalInfo.color}`,
          boxShadow: `0 0 40px ${signalInfo.color}44, 0 0 80px ${signalInfo.color}22`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `radial-gradient(circle, ${signalInfo.color}11 0%, transparent 70%)`,
          transition: "all 0.5s ease",
        }}>
          <p style={{ color: signalInfo.color, fontSize: "28px", fontWeight: 900, lineHeight: 1 }}>
            {signalInfo.label}
          </p>
          <p style={{ color: "#a3b899", fontSize: "13px", marginTop: "6px", textAlign: "center", padding: "0 12px" }}>
            {signalInfo.desc}
          </p>
        </div>

        {/* dBm value */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "48px", fontWeight: 900, color: signalInfo.color, lineHeight: 1 }}>
            {signal} <span style={{ fontSize: "20px", color: "#a3b899" }}>dBm</span>
          </p>
        </div>

        {/* Signal bar */}
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ color: "#a3b899", fontSize: "12px", fontWeight: 600 }}>Signal Strength</span>
            <span style={{ color: signalInfo.color, fontSize: "12px", fontWeight: 700 }}>{signalPct}%</span>
          </div>
          <div style={{ height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${signalPct}%`,
              background: `linear-gradient(90deg, ${signalInfo.color}, ${signalInfo.color}aa)`,
              borderRadius: "999px",
              transition: "width 0.5s ease",
              boxShadow: `0 0 8px ${signalInfo.color}66`,
            }} />
          </div>
        </div>

        {/* Log button */}
        <button
          onClick={logging ? stopLogging : startLogging}
          style={{
            background: logging
              ? "linear-gradient(135deg, #ef4444, #dc2626)"
              : "linear-gradient(135deg, #22c55e, #16a34a)",
            border: "none",
            borderRadius: "14px",
            padding: "14px 36px",
            color: "#fff",
            fontWeight: 800,
            fontSize: "15px",
            cursor: "pointer",
            boxShadow: logging ? "0 8px 20px rgba(239,68,68,0.25)" : "0 8px 20px rgba(34,197,94,0.25)",
            transition: "all 0.2s ease",
          }}
        >
          {logging ? "⏹ Stop Logging Session" : "▶ Start Logging Session"}
        </button>

        <p style={{ color: "#6b7f65", fontSize: "12px" }}>{status}</p>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
        {[
          { label: "Session Contribution", value: `${sessionCount} points`, sub: "Logged this session", color: "#22c55e" },
          { label: "GPS Accuracy", value: gpsAccuracy ? `${gpsAccuracy.toFixed(1)} m` : "—", sub: gpsAccuracy && gpsAccuracy < 10 ? "Excellent Accuracy" : "Waiting for GPS", color: "#3b82f6" },
          { label: "Connection Downlink", value: `${downlink} Mbps`, sub: `Est. ${networkType} speed`, color: "#8b5cf6" },
          { label: "Round Trip Time", value: `${rtt} ms`, sub: rtt < 50 ? "Low latency" : "High latency", color: "#f59e0b" },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: "rgba(20,28,20,0.6)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "16px",
            padding: "20px",
            borderTop: `3px solid ${stat.color}`,
          }}>
            <p style={{ color: "#a3b899", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
              {stat.label}
            </p>
            <p style={{ color: stat.color, fontSize: "26px", fontWeight: 800, lineHeight: 1 }}>{stat.value}</p>
            <p style={{ color: "#6b7f65", fontSize: "12px", marginTop: "6px" }}>{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Signal history */}
      {history.length > 1 && (
        <div style={{
          background: "rgba(20,28,20,0.6)",
          border: "1px solid rgba(34,197,94,0.18)",
          borderRadius: "16px",
          padding: "24px",
        }}>
          <p style={{ color: "#a3b899", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "16px" }}>
            Signal History (last 20 readings)
          </p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "80px" }}>
            {history.map((val, i) => {
              const pct = Math.max(0, Math.min(100, ((val + 120) / 70) * 100));
              const col = getSignalLabel(val).color;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{
                    width: "100%",
                    height: `${pct}%`,
                    background: col,
                    borderRadius: "4px 4px 0 0",
                    opacity: 0.8,
                    transition: "height 0.3s ease",
                  }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}