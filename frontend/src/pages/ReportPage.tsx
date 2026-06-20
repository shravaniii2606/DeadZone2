import { useEffect, useRef, useState } from "react";
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
    default: return "#a7b8ad";
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
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");
  const [usingGPS, setUsingGPS] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ display_name: string; lat: number; lon: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<number | null>(null);

  async function geocode(place: string): Promise<{ lat: number; lng: number } | null> {
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

  async function searchLocations(place: string) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=5&countrycodes=in`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return [];
      return data.map((item: any) => ({ display_name: item.display_name, lat: parseFloat(item.lat), lon: parseFloat(item.lon) }));
    } catch {
      return [];
    }
  }

  useEffect(() => {
    if (!location.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (searchTimeout.current) {
      window.clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = window.setTimeout(async () => {
      if (location.trim().length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const results = await searchLocations(location.trim());
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 250);
  }, [location]);

  async function fetchMyLocation() {
    if (!navigator.geolocation) {
      setError("GPS is not supported in this browser.");
      return;
    }
    setError("");
    setUsingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setUsingGPS(false);
      },
      () => {
        setError("Could not get your location. You can still type coordinates manually or enter a place name.");
        setUsingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function fetchReport() {
    setError("");
    setLoading(true);

    let targetLat = lat;
    let targetLng = lng;

    if (location) {
      const geo = await geocode(location);
      if (!geo) {
        setError(`Could not find "${location}". Try a more specific place name or add Mumbai.`);
        setLoading(false);
        return;
      }
      targetLat = geo.lat.toFixed(6);
      targetLng = geo.lng.toFixed(6);
      setLat(targetLat);
      setLng(targetLng);
    }

    if (!targetLat || !targetLng) {
      setError("Enter a place name, coordinates, or use your current location first.");
      setLoading(false);
      return;
    }

    const parsedLat = parseFloat(targetLat);
    const parsedLng = parseFloat(targetLng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      setError("Enter valid coordinates or a valid place name.");
      setLoading(false);
      return;
    }

    try {
      const res = await api.getAreaReport(parsedLat, parsedLng, parseInt(radius));
      if (res.success) {
        setResult(res);
      } else {
        setError("No report was returned for this area.");
      }
    } catch {
      setError("API error. Check that the backend is running.");
    }
    setLoading(false);
  }

  const breakdownItems: BreakdownItem[] = result
    ? Object.entries(result.breakdown)
        .map(([key, pct]) => ({
          label: key.charAt(0).toUpperCase() + key.slice(1),
          color: BREAKDOWN_COLORS[key] ?? "#a7b8ad",
          pct: pct as number,
        }))
        .sort((a, b) => b.pct - a.pct)
    : [];

  return (
    <div className="page-stack narrow">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Area Network Report</p>
          <h1>Signal Area Analysis</h1>
          <p className="hero-copy">Choose a point and radius to see whether nearby readings show strong coverage or dead zones.</p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="panel-kicker">Step 1</p>
            <h2>Pick a location</h2>
          </div>
          <button className="secondary-button" onClick={fetchMyLocation} disabled={usingGPS}>
            {usingGPS ? "Getting GPS..." : "Use My Location"}
          </button>
        </div>

        <div className="form-grid">
          <label className="field autocomplete-field">
            <span>Location</span>
            <input
              type="text"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
              }}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Borivali Station, Mumbai"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="autocomplete-list">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.lat}-${suggestion.lon}-${index}`}
                    type="button"
                    className="autocomplete-item"
                    onMouseDown={() => {
                      setLocation(suggestion.display_name);
                      setLat(suggestion.lat.toFixed(6));
                      setLng(suggestion.lon.toFixed(6));
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                  >
                    {suggestion.display_name}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="field">
            <span>Latitude</span>
            <input type="number" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="19.218300" />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input type="number" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="72.978100" />
          </label>
          <label className="field">
            <span>Radius</span>
            <select value={radius} onChange={(e) => setRadius(e.target.value)}>
              <option value="50">50 m</option>
              <option value="100">100 m</option>
              <option value="200">200 m</option>
              <option value="500">500 m</option>
              <option value="1000">1 km</option>
            </select>
          </label>
        </div>

        <button className="primary-button full-width" onClick={fetchReport} disabled={loading}>
          {loading ? "Analyzing..." : "Generate Report"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>

      {result ? (
        <>
          <section className="result-hero" style={{ borderColor: `${getZoneColor(result.zone_label)}55`, background: `${getZoneColor(result.zone_label)}12` }}>
            <span>Overall Zone</span>
            <strong style={{ color: getZoneColor(result.zone_label) }}>{result.zone_label}</strong>
            <p>Based on {result.total} signal {result.total === 1 ? "point" : "points"} within {result.radius_meters} m.</p>
          </section>

          <section className="panel">
            <p className="panel-kicker">Signal Mix</p>
            <h2>Coverage breakdown</h2>
            <div className="breakdown-list">
              {breakdownItems.map((item) => (
                <div key={item.label}>
                  <div className="bar-label">
                    <span><i style={{ background: item.color }} />{item.label}</span>
                    <strong style={{ color: item.color }}>{item.pct}%</strong>
                  </div>
                  <div className="meter-track">
                    <div style={{ width: `${item.pct}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="details-strip">
            <div><span>Center</span><strong>{result.center.lat.toFixed(6)}, {result.center.lng.toFixed(6)}</strong></div>
            <div><span>Radius</span><strong>{result.radius_meters} m</strong></div>
            <div><span>Data Points</span><strong>{result.total}</strong></div>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <strong>No report generated yet</strong>
          <p>Use your GPS location or enter coordinates, then generate a report.</p>
        </section>
      )}
    </div>
  );
}
