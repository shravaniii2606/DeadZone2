import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";

interface Reading {
  id: string;
  latitude: number;
  longitude: number;
  signal_strength: number;
  network_type: string;
  operator: string;
  created_at: string;
}

function getSignalColor(dbm: number): string {
  if (dbm >= -70) return "#22c55e";   // excellent - green
  if (dbm >= -85) return "#84cc16";   // good - lime
  if (dbm >= -100) return "#f59e0b";  // moderate - amber
  if (dbm >= -110) return "#ef4444";  // weak - red
  return "#6b7280";                    // dead - gray
}

function getSignalLabel(dbm: number): string {
  if (dbm >= -70) return "Excellent";
  if (dbm >= -85) return "Good";
  if (dbm >= -100) return "Moderate";
  if (dbm >= -110) return "Weak";
  return "Dead Zone";
}

function MapClickHandler({ onAreaClick }: { onAreaClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onAreaClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [logging, setLogging] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [currentSignal, setCurrentSignal] = useState<number | null>(null);
  const [status, setStatus] = useState("Ready");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchHeatmap();
    const refresh = setInterval(fetchHeatmap, 15000);
    return () => clearInterval(refresh);
  }, []);

  async function fetchHeatmap() {
    try {
      const res = await api.getHeatmap();
      if (res.success) setReadings(res.data);
    } catch (e) {
      console.error("Heatmap fetch failed", e);
    }
  }

  function getSignalStrength(): number {
    // Network Information API (Android Chrome only)
    const conn = (navigator as any).connection;
    if (conn) {
      const type = conn.effectiveType;
      if (type === "4g") return -65;
      if (type === "3g") return -85;
      if (type === "2g") return -100;
      return -110;
    }
    // Fallback: simulate realistic variance
    return Math.floor(Math.random() * 40) - 90;
  }

  function getNetworkType(): string {
    const conn = (navigator as any).connection;
    if (conn?.effectiveType) return conn.effectiveType.toUpperCase();
    return "4G";
  }

  async function logReading(lat: number, lng: number) {
    const signal = getSignalStrength();
    setCurrentSignal(signal);
    try {
      await api.submitReading({
        latitude: lat,
        longitude: lng,
        signal_strength: signal,
        network_type: getNetworkType(),
        operator: "unknown",
        device_type: /Android/i.test(navigator.userAgent) ? "android" : "other",
        gps_accuracy: 10,
      });
      setSessionCount((c) => c + 1);
      setStatus(`Logged · ${getSignalLabel(signal)}`);
      fetchHeatmap();
    } catch (e) {
      setStatus("Log failed");
    }
  }

  function startLogging() {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported");
      return;
    }
    setLogging(true);
    setStatus("Logging...");

    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => logReading(pos.coords.latitude, pos.coords.longitude),
        () => setStatus("GPS error"),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }, 10000);
  }

  function stopLogging() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setLogging(false);
    setStatus("Session ended");
  }

  async function handleAreaClick(lat: number, lng: number) {
    setStatus(`Checking area at ${lat.toFixed(4)}, ${lng.toFixed(4)}...`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div
        style={{
          background: "rgba(20,28,20,0.6)",
          border: "1px solid rgba(34,197,94,0.18)",
          borderLeft: "4px solid #22c55e",
          borderRadius: "16px",
          padding: "24px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <p style={{ color: "#22c55e", fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>
            Live Signal Heatmap
          </p>
          <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
            Network Coverage Map
          </h1>
          <p style={{ color: "#a3b899", marginTop: "6px", fontSize: "14px" }}>
            {readings.length} points mapped · Auto-refreshes every 15s
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Status pill */}
          {/* Replace the status pill with this */}
<div style={{
  background: logging ? "rgba(34,197,94,0.15)" : "rgba(20,28,20,0.8)",
  border: `1px solid ${logging ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
  borderRadius: "999px",
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 700,
  color: logging ? "#4ade80" : "#a3b899",
  display: "flex",
  alignItems: "center",
  gap: "8px",
}}>
  <span style={{
    width: "8px", height: "8px", borderRadius: "50%",
    background: logging ? "#22c55e" : "#6b7280",
    display: "inline-block",
    animation: logging ? "pulse 1.5s infinite" : "none",
  }} />
  {status}
</div>

          {/* Session count */}
          {sessionCount > 0 && (
            <div style={{
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: "12px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 700,
              color: "#4ade80",
            }}>
              {sessionCount} logged this session
            </div>
          )}

          {/* Log button */}
          <button
            onClick={logging ? stopLogging : startLogging}
            style={{
              background: logging
                ? "linear-gradient(135deg, #ef4444, #dc2626)"
                : "linear-gradient(135deg, #22c55e, #16a34a)",
              border: "none",
              borderRadius: "12px",
              padding: "12px 24px",
              color: "#fff",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: logging
                ? "0 8px 20px rgba(239,68,68,0.2)"
                : "0 8px 20px rgba(34,197,94,0.2)",
              transition: "all 0.2s ease",
            }}
          >
            {logging ? "⏹ Stop Logging" : "▶ Start Logging"}
          </button>
        </div>
      </div>

      {/* Signal legend */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {[
          { label: "Excellent", color: "#22c55e", range: "≥ -70 dBm" },
          { label: "Good", color: "#84cc16", range: "-70 to -85" },
          { label: "Moderate", color: "#f59e0b", range: "-85 to -100" },
          { label: "Weak", color: "#ef4444", range: "-100 to -110" },
          { label: "Dead Zone", color: "#6b7280", range: "< -110 dBm" },
        ].map((item) => (
          <div key={item.label} style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "rgba(20,28,20,0.6)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "10px",
            padding: "8px 14px",
          }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: item.color, display: "inline-block" }} />
            <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600 }}>{item.label}</span>
            <span style={{ color: "#6b7f65", fontSize: "12px" }}>{item.range}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <div style={{
        borderRadius: "16px",
        overflow: "hidden",
        border: "1px solid rgba(34,197,94,0.18)",
        height: "580px",
      }}>
        <MapContainer
          center={[19.076, 72.8777]}
          zoom={12}
          style={{ height: "100%", width: "100%", background: "#0a0f0a" }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          <MapClickHandler onAreaClick={handleAreaClick} />
          {readings.map((r) => (
            <CircleMarker
              key={r.id}
              center={[r.latitude, r.longitude]}
              radius={8}
              pathOptions={{
                color: getSignalColor(r.signal_strength),
                fillColor: getSignalColor(r.signal_strength),
                fillOpacity: 0.8,
                weight: 1.5,
              }}
            >
              <Popup>
                <div style={{ background: "#141c14", color: "#fff", borderRadius: "8px", padding: "12px", minWidth: "160px", fontSize: "13px" }}>
                  <p style={{ color: "#22c55e", fontWeight: 800, marginBottom: "8px" }}>{getSignalLabel(r.signal_strength)}</p>
                  <p><strong>Signal:</strong> {r.signal_strength} dBm</p>
                  <p><strong>Network:</strong> {r.network_type}</p>
                  <p><strong>Operator:</strong> {r.operator}</p>
                  <p style={{ color: "#6b7f65", marginTop: "6px", fontSize: "11px" }}>
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}