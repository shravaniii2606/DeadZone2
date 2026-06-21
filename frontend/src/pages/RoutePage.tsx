import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";

interface Route {
  route_index: number;
  route_name?: string;
  distance_km: number;
  duration_min: number;
  signal_score: number;
  avg_signal_dbm: number;
  dead_zone_pct: number;
  breakdown: Record<string, number>;
  path?: [number, number][];
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
const ROUTE_COLORS = ["#22c55e", "#38bdf8", "#f59e0b", "#f472b6", "#a78bfa"];

const MUMBAI_LANDMARKS: Record<string, { lat: number; lng: number }> = {
  "sfit": { lat: 19.2090, lng: 72.8610 },
  "st francis institute of technology": { lat: 19.2090, lng: 72.8610 },
  "st. francis institute of technology": { lat: 19.2090, lng: 72.8610 },
  "kandivali station": { lat: 19.2043, lng: 72.8489 },
  "kandivali": { lat: 19.2043, lng: 72.8489 },
  "borivali station": { lat: 19.2307, lng: 72.8567 },
  "borivali": { lat: 19.2307, lng: 72.8567 },
  "andheri station": { lat: 19.1197, lng: 72.8464 },
  "andheri": { lat: 19.1197, lng: 72.8464 },
  "bandra station": { lat: 19.0596, lng: 72.8295 },
  "bandra": { lat: 19.0596, lng: 72.8295 },
  "powai": { lat: 19.1176, lng: 72.9060 },
  "dharavi": { lat: 19.0432, lng: 72.8540 },
  "dadar station": { lat: 19.0178, lng: 72.8478 },
  "dadar": { lat: 19.0178, lng: 72.8478 },
  "kurla station": { lat: 19.0728, lng: 72.8826 },
  "kurla": { lat: 19.0728, lng: 72.8826 },
  "colaba": { lat: 18.9067, lng: 72.8147 },
  "lower parel": { lat: 18.9941, lng: 72.8328 },
  "malad station": { lat: 19.1862, lng: 72.8481 },
  "malad": { lat: 19.1862, lng: 72.8481 },
  "goregaon station": { lat: 19.1663, lng: 72.8526 },
  "goregaon": { lat: 19.1663, lng: 72.8526 },
  "thane station": { lat: 19.2183, lng: 72.9781 },
  "thane": { lat: 19.2183, lng: 72.9781 },
  "bkc": { lat: 19.0693, lng: 72.8685 },
  "mankhurd": { lat: 19.0470, lng: 72.9326 },
};

async function geocode(place: string): Promise<{ lat: number; lng: number } | null> {
  const key = place.toLowerCase().trim()
    .replace(", mumbai", "")
    .replace(",mumbai", "")
    .trim();

  if (MUMBAI_LANDMARKS[key]) {
    return MUMBAI_LANDMARKS[key];
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1&countrycodes=in`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}
async function searchLocations(place: string): Promise<Array<{ display_name: string; lat: number; lon: number }>> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=5&countrycodes=in`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({ display_name: item.display_name, lat: parseFloat(item.lat), lon: parseFloat(item.lon) }));
  } catch {
    return [];
  }
}
async function getAIInsight(routes: Route[], from: string, to: string): Promise<string> {
  try {
    const data = await api.getRouteInsight(routes, from, to);
    return data.insight ?? data.detail ?? "Could not generate insight.";
  } catch (err) {
    return err instanceof Error ? err.message : "AI insight unavailable.";
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

function getRouteLineColor(route: Route, index: number): string {
  if (route.recommended) return "#22c55e";
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

function RouteMapFocus({ routes }: { routes: Route[] }) {
  const map = useMap();

  useEffect(() => {
    const coordinates = routes.flatMap((route) => route.path ?? []);
    if (coordinates.length === 0) return;

    map.fitBounds(coordinates, {
      padding: [28, 28],
      maxZoom: 15,
    });
  }, [map, routes]);

  return null;
}

function RouteMap({ routes }: { routes: Route[] }) {
  const drawableRoutes = routes.filter((route) => route.path && route.path.length > 1);
  const primaryPath = drawableRoutes[0]?.path ?? [];
  const start = primaryPath[0];
  const end = primaryPath[primaryPath.length - 1];

  if (!start || !end) return null;

  return (
    <section className="route-map-panel">
      <MapContainer center={start} zoom={13} style={{ height: "100%", width: "100%", background: "#0a0f0a" }}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
        <RouteMapFocus routes={routes} />

        {drawableRoutes.map((route, index) => {
          const color = getRouteLineColor(route, index);
          const label = route.route_name || ROUTE_NAMES[route.route_index] || `Route ${route.route_index + 1}`;

          return (
            <Polyline
              key={route.route_index}
              positions={route.path ?? []}
              pathOptions={{
                color,
                opacity: route.recommended ? 0.95 : 0.72,
                weight: route.recommended ? 7 : 5,
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong style={{ color }}>{label}</strong>
                  <p>{route.recommended ? "Recommended route" : "Alternate route"}</p>
                  <p>Signal: {route.signal_score}%</p>
                  <p>Distance: {route.distance_km} km</p>
                  <p>Duration: {route.duration_min} min</p>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        <CircleMarker center={start} radius={11} pathOptions={{ color: "#bbf7d0", fillColor: "#22c55e", fillOpacity: 0.95, weight: 3 }}>
          <Tooltip permanent direction="top" offset={[0, -10]} className="route-point-label">
            Start
          </Tooltip>
          <Popup>
            <div className="map-popup">
              <strong>Start</strong>
            </div>
          </Popup>
        </CircleMarker>
        <CircleMarker center={end} radius={11} pathOptions={{ color: "#fde68a", fillColor: "#f59e0b", fillOpacity: 0.95, weight: 3 }}>
          <Tooltip permanent direction="top" offset={[0, -10]} className="route-point-label end">
            End
          </Tooltip>
          <Popup>
            <div className="map-popup">
              <strong>Destination</strong>
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>
    </section>
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
  const [fromSuggestions, setFromSuggestions] = useState<Array<{ display_name: string; lat: number; lon: number }>>([]);
  const [toSuggestions, setToSuggestions] = useState<Array<{ display_name: string; lat: number; lon: number }>>([]);
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const fromSearchTimeout = useRef<number | null>(null);
  const toSearchTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (!fromPlace.trim()) {
      setFromSuggestions([]);
      setShowFromSuggestions(false);
      return;
    }

    if (fromSearchTimeout.current) {
      window.clearTimeout(fromSearchTimeout.current);
    }

    fromSearchTimeout.current = window.setTimeout(async () => {
      if (fromPlace.trim().length < 3) {
        setFromSuggestions([]);
        setShowFromSuggestions(false);
        return;
      }
      const results = await searchLocations(fromPlace.trim());
      setFromSuggestions(results);
      setShowFromSuggestions(results.length > 0);
    }, 250);
  }, [fromPlace]);

  useEffect(() => {
    if (!toPlace.trim()) {
      setToSuggestions([]);
      setShowToSuggestions(false);
      return;
    }

    if (toSearchTimeout.current) {
      window.clearTimeout(toSearchTimeout.current);
    }

    toSearchTimeout.current = window.setTimeout(async () => {
      if (toPlace.trim().length < 3) {
        setToSuggestions([]);
        setShowToSuggestions(false);
        return;
      }
      const results = await searchLocations(toPlace.trim());
      setToSuggestions(results);
      setShowToSuggestions(results.length > 0);
    }, 250);
  }, [toPlace]);

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
          <label className="field autocomplete-field">
            <span>From</span>
            <input
              type="text"
              value={fromPlace}
              onChange={(e) => setFromPlace(e.target.value)}
              onFocus={() => setShowFromSuggestions(fromSuggestions.length > 0)}
              onBlur={() => window.setTimeout(() => setShowFromSuggestions(false), 150)}
              placeholder="Borivali Station, Mumbai"
            />
            {showFromSuggestions && fromSuggestions.length > 0 && (
              <div className="autocomplete-list">
                {fromSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.lat}-${suggestion.lon}-${index}`}
                    type="button"
                    className="autocomplete-item"
                    onMouseDown={() => {
                      setFromPlace(suggestion.display_name);
                      setShowFromSuggestions(false);
                    }}
                  >
                    {suggestion.display_name}
                  </button>
                ))}
              </div>
            )}
          </label>
          <button className="secondary-button location-button" onClick={getMyLocation} disabled={gettingGPS}>
            {gettingGPS ? "Getting GPS..." : "Use My Location"}
          </button>
          <label className="field autocomplete-field">
            <span>To</span>
            <input
              type="text"
              value={toPlace}
              onChange={(e) => setToPlace(e.target.value)}
              onFocus={() => setShowToSuggestions(toSuggestions.length > 0)}
              onBlur={() => window.setTimeout(() => setShowToSuggestions(false), 150)}
              placeholder="SFIT Borivali, Mumbai"
            />
            {showToSuggestions && toSuggestions.length > 0 && (
              <div className="autocomplete-list">
                {toSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.lat}-${suggestion.lon}-${index}`}
                    type="button"
                    className="autocomplete-item"
                    onMouseDown={() => {
                      setToPlace(suggestion.display_name);
                      setShowToSuggestions(false);
                    }}
                  >
                    {suggestion.display_name}
                  </button>
                ))}
              </div>
            )}
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

      {routes.length > 0 && <RouteMap routes={routes} />}

      {routes.length > 0 ? (
        <section className="route-results">
          <div className="section-head">
            <div>
              <p className="panel-kicker">Available Routes</p>
              <h2>{routes.length} route{routes.length === 1 ? "" : "s"} found</h2>
            </div>
          </div>

          <div className="route-grid">
            {routes.map((route) => {
              const scoreColor = getScoreColor(route.signal_score);
              return (
                <article className={`route-card ${route.recommended ? "recommended" : ""}`} key={route.route_index}>
                  <div className="route-card-head">
                    <div>
                      <p className="panel-kicker">{route.route_name || ROUTE_NAMES[route.route_index] || `Route ${route.route_index + 1}`}</p>
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
          </div>
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
