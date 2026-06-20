import { useState } from "react";
import { api } from "../api";

interface BreakdownItem {
  label: string;
  color: string;
  pct: number;
}

interface ReportResult {
  total: number;
  zone_label: string;
  breakdown: Record<string, number>;
  center: { lat: number; lng: number };
  radius_meters: number;
}

function getZoneColor(label: string): string {
  switch (label.toLowerCase()) {
    case "excellent": return "#22c55e";
    case "good": return "#84cc16";
    case "moderate": return "#f59e0b";
    case "weak": return "#ef4444";
    case "dead": return "#6b7280";
    default: return "#a3b899";
  }
}

const BREAKDOWN_COLORS: Record<string, string> = {
  excellent: "#22c55e",
  good: "#84cc16",
  moderate: "#f59e0b",
  weak: "#ef4444",
  dead: "#6b7280",
};

export default function ReportPage() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");
  const [usingGPS, setUsingGPS] = useState(false);

  async function fetchMyLocation() {
    if (!navigator.geolocation) { setError("GPS not supported"); return; }
    setUsingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setUsingGPS(false);
      },
      () => { setError("Could not get location"); setUsingGPS(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function fetchReport() {
    if (!lat || !lng) { setError("Enter coordinates or use GPS"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await api.getAreaReport(parseFloat(lat), parseFloat(lng), parseInt(radius));
      if (res.success) {
        setResult(res);
      } else {
        setError("Failed to fetch report");
      }
    } catch {
      setError("API error — is backend running?");
    }
    setLoading(false);
  }

  const breakdownItems: BreakdownItem[] = result
    ? Object.entries(result.breakdown).map(([key, pct]) => ({
        label: key.charAt(0).toUpperCase() + key.slice(1),
        color: BREAKDOWN_COLORS[key] ?? "#a3b899",
        pct: pct as number,
      })).sort((a, b) => b.pct - a.pct)
    : [];

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Header */}
      <div style={{
        background: "rgba(20,28,20,0.6)",
        border: "1px solid rgba(34,197,94,0.18)",
        borderLeft: "4px solid #22c55e",
        borderRadius: "16px",
        padding: "24px 28px",
      }}>
        <p style={{ color: "#22c55e", fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>
          Area Network Report
        </p>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
          Signal Area Analysis
        </h1>
        <p style={{ color: "#a3b899", marginTop: "6px", fontSize: "14px" }}>
          Get a signal breakdown for any location within a selected radius
        </p>
      </div>

      {/* Input card */}
      <div style={{
        background: "rgba(20,28,20,0.6)",
        border: "1px solid rgba(34,197,94,0.18)",
        borderRadius: "16px",
        padding: "28px",
      }}>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: "16px", marginBottom: "20px" }}>
          Enter Location
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          {/* Lat */}
          <div>
            <label style={{ color: "#a3b899", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "8px" }}>
              Latitude
            </label>
            <input
              type="number"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="19.2183"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(10,15,10,0.7)",
                border: "1px solid rgba(34,197,94,0.18)",
                borderRadius: "12px",
                color: "#fff",
                fontSize: "14px",
                outline: "none",
              }}
            />
          </div>

          {/* Lng */}
          <div>
            <label style={{ color: "#a3b899", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "8px" }}>
              Longitude
            </label>
            <input
              type="number"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="72.9781"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(10,15,10,0.7)",
                border: "1px solid rgba(34,197,94,0.18)",
                borderRadius: "12px",
                color: "#fff",
                fontSize: "14px",
                outline: "none",
              }}
            />
          </div>

          {/* Radius */}
          <div>
            <label style={{ color: "#a3b899", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "8px" }}>
              Radius (meters)
            </label>
            <select
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(10,15,10,0.7)",
                border: "1px solid rgba(34,197,94,0.18)",
                borderRadius: "12px",
                color: "#fff",
                fontSize: "14px",
                outline: "none",
              }}
            >
              <option value="50">50m</option>
              <option value="100">100m</option>
              <option value="200">200m</option>
              <option value="500">500m</option>
              <option value="1000">1km</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={fetchMyLocation}
            disabled={usingGPS}
            style={{
              padding: "12px 20px",
              background: "transparent",
              border: "2px solid #22c55e",
              borderRadius: "12px",
              color: "#4ade80",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {usingGPS ? "Getting GPS..." : "📍 Use My Location"}
          </button>

          <button
            onClick={fetchReport}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 24px",
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              border: "none",
              borderRadius: "12px",
              color: "#fff",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(34,197,94,0.2)",
              transition: "all 0.2s ease",
            }}
          >
            {loading ? "Analyzing..." : "📊 Generate Report"}
          </button>
        </div>

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", marginTop: "12px", fontWeight: 600 }}>
            ⚠ {error}
          </p>
        )}
      </div>

      {/* Result */}
      {result && (
        <>
          {/* Zone label */}
          <div style={{
            background: `${getZoneColor(result.zone_label)}11`,
            border: `1px solid ${getZoneColor(result.zone_label)}44`,
            borderRadius: "16px",
            padding: "28px",
            textAlign: "center",
          }}>
            <p style={{ color: "#a3b899", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
              Overall Zone Classification
            </p>
            <p style={{ color: getZoneColor(result.zone_label), fontSize: "3rem", fontWeight: 900, lineHeight: 1 }}>
              {result.zone_label}
            </p>
            <p style={{ color: "#a3b899", fontSize: "14px", marginTop: "10px" }}>
              Based on {result.total} signal {result.total === 1 ? "point" : "points"} within {result.radius_meters}m radius
            </p>
          </div>

          {/* Breakdown bars */}
          <div style={{
            background: "rgba(20,28,20,0.6)",
            border: "1px solid rgba(34,197,94,0.18)",
            borderRadius: "16px",
            padding: "28px",
          }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "16px", marginBottom: "20px" }}>
              Signal Mix Breakdown
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {breakdownItems.map((item) => (
                <div key={item.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: item.color, display: "inline-block" }} />
                      <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>{item.label}</span>
                    </div>
                    <span style={{ color: item.color, fontSize: "14px", fontWeight: 700 }}>{item.pct}%</span>
                  </div>
                  <div style={{ height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${item.pct}%`,
                      background: item.color,
                      borderRadius: "999px",
                      transition: "width 0.6s ease",
                      boxShadow: `0 0 8px ${item.color}66`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coordinates */}
          <div style={{
            background: "rgba(20,28,20,0.4)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "12px",
            padding: "16px 20px",
            display: "flex",
            gap: "24px",
            flexWrap: "wrap",
          }}>
            <div>
              <span style={{ color: "#6b7f65", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>Center</span>
              <p style={{ color: "#fff", fontSize: "14px", fontWeight: 600, marginTop: "4px" }}>
                {result.center.lat.toFixed(6)}, {result.center.lng.toFixed(6)}
              </p>
            </div>
            <div>
              <span style={{ color: "#6b7f65", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>Radius</span>
              <p style={{ color: "#fff", fontSize: "14px", fontWeight: 600, marginTop: "4px" }}>{result.radius_meters}m</p>
            </div>
            <div>
              <span style={{ color: "#6b7f65", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>Data Points</span>
              <p style={{ color: "#22c55e", fontSize: "14px", fontWeight: 600, marginTop: "4px" }}>{result.total}</p>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div style={{
          background: "rgba(20,28,20,0.4)",
          border: "1px dashed rgba(34,197,94,0.2)",
          borderRadius: "16px",
          padding: "48px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "40px", marginBottom: "12px" }}>📡</p>
          <p style={{ color: "#a3b899", fontSize: "16px", fontWeight: 600 }}>No report generated yet</p>
          <p style={{ color: "#6b7f65", fontSize: "14px", marginTop: "6px" }}>Enter coordinates or use your GPS location above</p>
        </div>
      )}
    </div>
  );
}