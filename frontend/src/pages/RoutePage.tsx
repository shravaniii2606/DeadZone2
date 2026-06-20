import { useState } from "react";
import { api } from "../api";

interface Route {
  route_index: number;
  distance_km: number;
  duration_min: number;
  signal_score: number;
  avg_signal_dbm: number;
  dead_zone_pct: number;
  breakdown: Record<string, number>;
  recommended: boolean;
}

const SIGNAL_COLORS: Record<string, string> = {
  excellent: "#22c55e",
  good: "#84cc16",
  moderate: "#f59e0b",
  weak: "#ef4444",
  dead: "#6b7280",
};

const ROUTE_NAMES = ["Route A", "Route B", "Route C"];

async function geocode(place: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1&countrycodes=in`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}
async function getAIInsight(routes: Route[], from: string, to: string): Promise<string> {
  try {
    const routeSummary = routes.map((r, i) => `
      ${ROUTE_NAMES[i]}:
      - Signal Score: ${r.signal_score}%
      - Avg Signal: ${r.avg_signal_dbm} dBm
      - Distance: ${r.distance_km} km
      - Duration: ${r.duration_min} min
      - Dead Zone %: ${r.dead_zone_pct}%
      - Breakdown: ${JSON.stringify(r.breakdown)}
      - Recommended: ${r.recommended}
    `).join("\n");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "user",
            content: `You are a telecom signal analyst. A user wants to travel from "${from}" to "${to}" in Mumbai, India.
Here is the signal quality data for available routes:

${routeSummary}

Give a short, clear recommendation (3-4 sentences max) explaining:
1. Which route to take and why
2. What kind of connectivity to expect
3. Any specific warning about dead zones

Be direct and practical. No bullet points, just natural language.`
          }
        ],
        max_tokens: 200,
      })
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "Could not generate insight.";
  } catch {
    return "AI insight unavailable.";
  }
}
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <svg width="90" height="90" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
      <circle
        cx="45" cy="45" r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
      <text x="45" y="45" textAnchor="middle" dominantBaseline="central" fill={color} fontSize="16" fontWeight="900">
        {score}%
      </text>
    </svg>
  );
}

export default function RoutePage() {
  const [fromPlace, setFromPlace] = useState("");
  const [toPlace, setToPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [error, setError] = useState("");
  const [gettingGPS, setGettingGPS] = useState(false);
  const [resolvedFrom, setResolvedFrom] = useState("");
  const [resolvedTo, setResolvedTo] = useState("");
  const [aiInsight, setAiInsight] = useState("");
const [aiLoading, setAiLoading] = useState(false);

  async function getMyLocation() {
    if (!navigator.geolocation) { setError("GPS not supported"); return; }
    setGettingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFromPlace(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        setGettingGPS(false);
      },
      () => { setError("Could not get location"); setGettingGPS(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function analyzeRoutes() {
    if (!fromPlace || !toPlace) {
      setError("Enter both locations");
      return;
    }
    setError("");
    setLoading(true);
    setRoutes([]);

    const [from, to] = await Promise.all([
      geocode(fromPlace),
      geocode(toPlace),
    ]);

    if (!from) { setError(`Could not find "${fromPlace}"`); setLoading(false); return; }
    if (!to) { setError(`Could not find "${toPlace}"`); setLoading(false); return; }

    setResolvedFrom(`${from.lat.toFixed(5)}, ${from.lng.toFixed(5)}`);
    setResolvedTo(`${to.lat.toFixed(5)}, ${to.lng.toFixed(5)}`);

    try {
      const res = await api.getRoute(from.lat, from.lng, to.lat, to.lng);
      if (res.success) {
  setRoutes(res.routes);
  setAiLoading(true);
  const insight = await getAIInsight(res.routes, fromPlace, toPlace);
  setAiInsight(insight);
  setAiLoading(false);
}
      else {
        setError("No routes found — try different locations");
      }
      
    } catch {
      setError("API error — is backend running?");
    }
    setLoading(false);
  }

  function getScoreColor(score: number): string {
    if (score >= 75) return "#22c55e";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  }

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
          Smart Route Recommender
        </p>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
          Signal-Aware Routing
        </h1>
        <p style={{ color: "#a3b899", marginTop: "6px", fontSize: "14px" }}>
          Compare routes by signal quality — choose the path with best connectivity
        </p>
      </div>

      {/* Input card */}
      <div style={{
        background: "rgba(20,28,20,0.6)",
        border: "1px solid rgba(34,197,94,0.18)",
        borderRadius: "16px",
        padding: "28px",
      }}>
        {/* From */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "15px" }}>📍 From</p>
            <button
              onClick={getMyLocation}
              disabled={gettingGPS}
              style={{
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid #22c55e",
                borderRadius: "10px",
                color: "#4ade80",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {gettingGPS ? "Getting GPS..." : "Use My Location"}
            </button>
          </div>
          <input
            type="text"
            value={fromPlace}
            onChange={(e) => setFromPlace(e.target.value)}
            placeholder="e.g. Borivali Station, Mumbai"
            style={{
              width: "100%",
              padding: "14px 18px",
              background: "rgba(10,15,10,0.7)",
              border: "1px solid rgba(34,197,94,0.18)",
              borderRadius: "12px",
              color: "#fff",
              fontSize: "15px",
              outline: "none",
            }}
          />
        </div>

        {/* Arrow */}
        <div style={{ textAlign: "center", margin: "8px 0" }}>
          <span style={{ color: "#22c55e", fontSize: "24px" }}>↓</span>
        </div>

        {/* To */}
        <div style={{ marginBottom: "24px" }}>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: "15px", marginBottom: "10px" }}>🏁 To</p>
          <input
            type="text"
            value={toPlace}
            onChange={(e) => setToPlace(e.target.value)}
            placeholder="e.g. St. Francis Institute of Technology, Mumbai"
            style={{
              width: "100%",
              padding: "14px 18px",
              background: "rgba(10,15,10,0.7)",
              border: "1px solid rgba(34,197,94,0.18)",
              borderRadius: "12px",
              color: "#fff",
              fontSize: "15px",
              outline: "none",
            }}
          />
        </div>

        <button
          onClick={analyzeRoutes}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            border: "none",
            borderRadius: "12px",
            color: "#fff",
            fontWeight: 800,
            fontSize: "15px",
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(34,197,94,0.2)",
            transition: "all 0.2s ease",
          }}
        >
          {loading ? "⏳ Finding best route..." : "📡 Analyze Signal Quality"}
        </button>

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", marginTop: "12px", fontWeight: 600 }}>
            ⚠ {error}
          </p>
        )}

        {/* Resolved coordinates */}
        {resolvedFrom && resolvedTo && (
          <div style={{
            marginTop: "14px",
            background: "rgba(34,197,94,0.06)",
            border: "1px solid rgba(34,197,94,0.15)",
            borderRadius: "10px",
            padding: "12px 16px",
            fontSize: "12px",
            color: "#6b7f65",
          }}>
            <p>📍 From: <span style={{ color: "#a3b899" }}>{resolvedFrom}</span></p>
            <p style={{ marginTop: "4px" }}>🏁 To: <span style={{ color: "#a3b899" }}>{resolvedTo}</span></p>
          </div>
        )}
      </div>
      {/* AI Insight */}
      {(aiInsight || aiLoading) && (
        <div style={{
          background: "rgba(139,92,246,0.08)",
          border: "1px solid rgba(139,92,246,0.3)",
          borderRadius: "16px",
          padding: "24px 28px",
          display: "flex",
          gap: "16px",
          alignItems: "flex-start",
        }}>
          <div style={{
            width: "40px",
            height: "40px",
            minWidth: "40px",
            borderRadius: "12px",
            background: "rgba(139,92,246,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
          }}>
            🤖
          </div>
          <div>
            <p style={{ color: "#c084fc", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
              AI Signal Analyst
            </p>
            {aiLoading ? (
              <p style={{ color: "#a3b899", fontSize: "14px" }}>Analyzing routes...</p>
            ) : (
              <p style={{ color: "#e2e8f0", fontSize: "15px", lineHeight: 1.7 }}>{aiInsight}</p>
            )}
          </div>
        </div>
      )}
      {/* Route results */}
      {routes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {routes.map((route) => {
            const scoreColor = getScoreColor(route.signal_score);
            return (
              <div
                key={route.route_index}
                style={{
                  background: route.recommended
                    ? "rgba(34,197,94,0.08)"
                    : "rgba(20,28,20,0.6)",
                  border: route.recommended
                    ? "2px solid rgba(34,197,94,0.5)"
                    : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px",
                  padding: "24px",
                  position: "relative",
                  transition: "all 0.2s ease",
                }}
              >
                {/* Badge */}
                {route.recommended ? (
                  <div style={{
                    position: "absolute",
                    top: "16px",
                    right: "16px",
                    background: "#22c55e",
                    color: "#000",
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>
                    ✓ Recommended
                  </div>
                ) : (
                  <div style={{
                    position: "absolute",
                    top: "16px",
                    right: "16px",
                    background: "rgba(239,68,68,0.15)",
                    color: "#ef4444",
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}>
                    ✕ Avoid
                  </div>
                )}

                <p style={{ color: "#a3b899", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                  {ROUTE_NAMES[route.route_index] ?? `Route ${route.route_index + 1}`}
                </p>

                {/* Score ring */}
                <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "20px" }}>
                  <ScoreRing score={route.signal_score} color={scoreColor} />
                  <div>
                    <p style={{ color: scoreColor, fontSize: "22px", fontWeight: 900, lineHeight: 1 }}>
                      {route.signal_score}%
                    </p>
                    <p style={{ color: "#a3b899", fontSize: "12px", marginTop: "4px" }}>Signal Score</p>
                    <p style={{ color: "#6b7f65", fontSize: "12px", marginTop: "2px" }}>
                      Avg {route.avg_signal_dbm} dBm
                    </p>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                  {[
                    { label: "Distance", value: `${route.distance_km} km`, color: "#fff" },
                    { label: "Duration", value: `${route.duration_min} min`, color: "#fff" },
                    { label: "Dead Zones", value: `${route.dead_zone_pct}%`, color: route.dead_zone_pct > 20 ? "#ef4444" : "#22c55e" },
                  ].map((s) => (
                    <div key={s.label} style={{
                      background: "rgba(10,15,10,0.5)",
                      borderRadius: "10px",
                      padding: "10px",
                      textAlign: "center",
                    }}>
                      <p style={{ color: "#6b7f65", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>
                        {s.label}
                      </p>
                      <p style={{ color: s.color, fontSize: "15px", fontWeight: 800 }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Breakdown pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {Object.entries(route.breakdown)
                    .filter(([, v]) => v > 0)
                    .map(([key, val]) => (
                      <span key={key} style={{
                        background: `${SIGNAL_COLORS[key]}18`,
                        border: `1px solid ${SIGNAL_COLORS[key]}44`,
                        color: SIGNAL_COLORS[key],
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: "999px",
                      }}>
                        {key.charAt(0).toUpperCase() + key.slice(1)}: {val}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {routes.length === 0 && !loading && (
        <div style={{
          background: "rgba(20,28,20,0.4)",
          border: "1px dashed rgba(34,197,94,0.2)",
          borderRadius: "16px",
          padding: "48px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "40px", marginBottom: "12px" }}>🛣️</p>
          <p style={{ color: "#a3b899", fontSize: "16px", fontWeight: 600 }}>No routes analyzed yet</p>
          <p style={{ color: "#6b7f65", fontSize: "14px", marginTop: "6px" }}>
            Type any two locations in Mumbai to compare signal quality
          </p>
          <div style={{ marginTop: "20px", display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "10px", padding: "10px 16px" }}>
              <p style={{ color: "#6b7f65", fontSize: "11px", marginBottom: "4px" }}>Example From</p>
              <p style={{ color: "#a3b899", fontSize: "13px", fontWeight: 600 }}>Borivali Station, Mumbai</p>
            </div>
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "10px", padding: "10px 16px" }}>
              <p style={{ color: "#6b7f65", fontSize: "11px", marginBottom: "4px" }}>Example To</p>
              <p style={{ color: "#a3b899", fontSize: "13px", fontWeight: 600 }}>SFIT Borivali, Mumbai</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}