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
        messages: [{
          role: "user",
          content: `You are a telecom signal analyst. A user wants to travel from "${from}" to "${to}" in Mumbai, India.
Here is the signal quality data for available routes:

${routeSummary}

Give a short, clear recommendation (3-4 sentences max) explaining which route to take, what connectivity to expect, and any dead-zone warning. Be direct and practical.`,
        }],
        max_tokens: 200,
      }),
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
    <svg className="score-ring" width="90" height="90" viewBox="0 0 90 90" aria-label={`${score}% signal score`}>
      <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
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
    if (!navigator.geolocation) {
      setError("GPS is not supported in this browser.");
      return;
    }
    setError("");
    setGettingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFromPlace(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        setGettingGPS(false);
      },
      () => {
        setError("Could not get your location. Type a starting place instead.");
        setGettingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function analyzeRoutes() {
    if (!fromPlace || !toPlace) {
      setError("Enter both starting point and destination.");
      return;
    }
    setError("");
    setLoading(true);
    setRoutes([]);
    setAiInsight("");

    const [from, to] = await Promise.all([geocode(fromPlace), geocode(toPlace)]);

    if (!from) {
      setError(`Could not find "${fromPlace}". Try adding Mumbai to the place name.`);
      setLoading(false);
      return;
    }
    if (!to) {
      setError(`Could not find "${toPlace}". Try adding Mumbai to the place name.`);
      setLoading(false);
      return;
    }

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
      } else {
        setError("No routes found. Try different locations.");
      }
    } catch {
      setError("API error. Check that the backend is running.");
    }
    setLoading(false);
  }

  function getScoreColor(score: number): string {
    if (score >= 75) return "#22c55e";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Smart Route Recommender</p>
          <h1>Signal-Aware Routing</h1>
          <p className="hero-copy">Compare routes by connectivity quality, dead-zone risk, distance, and travel time.</p>
        </div>
      </section>

      <section className="panel">
        <div className="route-form">
          <label className="field">
            <span>From</span>
            <input type="text" value={fromPlace} onChange={(e) => setFromPlace(e.target.value)} placeholder="Borivali Station, Mumbai" />
          </label>
          <button className="secondary-button location-button" onClick={getMyLocation} disabled={gettingGPS}>
            {gettingGPS ? "Getting GPS..." : "Use My Location"}
          </button>
          <label className="field">
            <span>To</span>
            <input type="text" value={toPlace} onChange={(e) => setToPlace(e.target.value)} placeholder="SFIT Borivali, Mumbai" />
          </label>
        </div>

        <button className="primary-button full-width" onClick={analyzeRoutes} disabled={loading}>
          {loading ? "Finding Best Route..." : "Analyze Signal Quality"}
        </button>
        {error && <p className="error-text">{error}</p>}

        {resolvedFrom && resolvedTo && (
          <div className="resolved-box">
            <p>From: <span>{resolvedFrom}</span></p>
            <p>To: <span>{resolvedTo}</span></p>
          </div>
        )}
      </section>

      {(aiInsight || aiLoading) && (
        <section className="insight-panel">
          <div className="insight-icon">AI</div>
          <div>
            <p className="panel-kicker">Signal Analyst</p>
            <h2>Recommendation</h2>
            <p>{aiLoading ? "Analyzing routes..." : aiInsight}</p>
          </div>
        </section>
      )}

      {routes.length > 0 ? (
        <section className="route-grid">
          {routes.map((route) => {
            const scoreColor = getScoreColor(route.signal_score);
            return (
              <article className={`route-card ${route.recommended ? "recommended" : ""}`} key={route.route_index}>
                <div className="route-card-head">
                  <div>
                    <p className="panel-kicker">{ROUTE_NAMES[route.route_index] ?? `Route ${route.route_index + 1}`}</p>
                    <h2>{route.recommended ? "Best Connectivity" : "Alternate Route"}</h2>
                  </div>
                  <span className={route.recommended ? "badge good" : "badge warn"}>{route.recommended ? "Recommended" : "Compare"}</span>
                </div>

                <div className="score-row">
                  <ScoreRing score={route.signal_score} color={scoreColor} />
                  <div>
                    <strong style={{ color: scoreColor }}>{route.signal_score}%</strong>
                    <span>Signal score</span>
                    <p>Average {route.avg_signal_dbm} dBm</p>
                  </div>
                </div>

                <div className="mini-stats">
                  <div><span>Distance</span><strong>{route.distance_km} km</strong></div>
                  <div><span>Duration</span><strong>{route.duration_min} min</strong></div>
                  <div><span>Dead Zones</span><strong style={{ color: route.dead_zone_pct > 20 ? "#ef4444" : "#22c55e" }}>{route.dead_zone_pct}%</strong></div>
                </div>

                <div className="breakdown-pills">
                  {Object.entries(route.breakdown)
                    .filter(([, v]) => v > 0)
                    .map(([key, val]) => (
                      <span key={key} style={{ borderColor: `${SIGNAL_COLORS[key]}55`, color: SIGNAL_COLORS[key] }}>
                        {key.charAt(0).toUpperCase() + key.slice(1)}: {val}
                      </span>
                    ))}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="empty-state">
          <strong>No routes analyzed yet</strong>
          <p>Enter two Mumbai locations to compare route signal quality.</p>
          <div className="example-row">
            <span>Borivali Station, Mumbai</span>
            <span>SFIT Borivali, Mumbai</span>
          </div>
        </section>
      )}
    </div>
  );
}
