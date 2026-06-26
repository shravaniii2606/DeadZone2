import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";
import { debounce } from "../api";
interface Reading {
  id: string;
  latitude: number;
  longitude: number;
  signal_strength: number;
  network_type: string;
  operator: string;
  created_at: string;
  gps_accuracy?: number | null;
  download_speed?: number | null;
  latency?: number | null;
  synced?: boolean;
}

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
};

type NetworkGeneration = "AUTO" | "3G" | "4G" | "5G";

const signalLegend = [
  { label: "Excellent", color: "#22c55e", range: ">= 70" },
  { label: "Good",      color: "#84cc16", range: "50–70" },
  { label: "Moderate",  color: "#f59e0b", range: "30–50" },
  { label: "Weak",      color: "#ef4444", range: "15–30" },
  { label: "Dead Zone", color: "#6b7280", range: "< 15"  },
];
const LOCAL_READINGS_KEY = "deadzone.localReadings";

type ReadingPayload = Partial<Reading> & {
  lat?: number | string;
  lng?: number | string;
  reading_id?: string;
  operator_name?: string;
  timestamp?: string;
};

function normalizeReading(reading: ReadingPayload | null | undefined): Reading | null {
  if (!reading) return null;
  const latitude = Number(reading.latitude ?? reading.lat);
  const longitude = Number(reading.longitude ?? reading.lng);
  const signalStrength = Number(reading.signal_strength);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(signalStrength)) {
    return null;
  }

  return {
    id:
      reading.id ??
      reading.reading_id ??
      `${latitude}-${longitude}-${Date.now()}`,
    latitude,
    longitude,
    signal_strength: signalStrength,
    network_type: reading.network_type ?? "unknown",
    operator: reading.operator ?? reading.operator_name ?? "unknown",
    created_at: reading.created_at ?? reading.timestamp ?? new Date().toISOString(),
    gps_accuracy: reading.gps_accuracy ?? null,
    download_speed: reading.download_speed ?? null,
    latency: reading.latency ?? null,
    synced: reading.synced ?? true,
  };
}

function mergeReadings(primary: Reading[], secondary: Reading[]): Reading[] {
  const seen = new Set<string>();
  const merged: Reading[] = [];

  [...primary, ...secondary].forEach((reading) => {
    if (seen.has(reading.id)) return;
    seen.add(reading.id);
    merged.push(reading);
  });

  return merged;
}

function loadLocalReadings(): Reading[] {
  try {
    const stored = window.localStorage.getItem(LOCAL_READINGS_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeReading)
      .filter((reading): reading is Reading => Boolean(reading));
  } catch {
    return [];
  }
}

function saveLocalReadings(readings: Reading[]) {
  try {
    window.localStorage.setItem(LOCAL_READINGS_KEY, JSON.stringify(readings));
  } catch {
    // Storage can fail in private mode or when the quota is full.
  }
}

function getSignalColor(strength: number): string {
  if (strength >= -70) return "#22c55e";
  if (strength >= -85) return "#84cc16";
  if (strength >= -100) return "#f59e0b";
  if (strength >= -110) return "#ef4444";
  return "#6b7280";
}

function getSignalLabel(strength: number): string {
  if (strength >= -70) return "Excellent";
  if (strength >= -85) return "Good";
  if (strength >= -100) return "Moderate";
  if (strength >= -110) return "Weak";
  return "Dead Zone";
}
function getNetworkColor(networkType: string): string {
  const nt = networkType?.toLowerCase();
  if (nt === "5g") return "#a855f7";       // purple
  if (nt === "4g") return "#3b82f6";       // blue
  if (nt === "3g") return "#f59e0b";       // orange
  if (nt === "2g" || nt === "slow-2g") return "#ef4444"; // red
  return "#6b7280";                         // grey = unknown
}

function getNetworkLabel(networkType: string): string {
  const nt = networkType?.toLowerCase();
  if (nt === "5g") return "5G";
  if (nt === "4g") return "4G";
  if (nt === "3g") return "3G";
  if (nt === "2g") return "2G";
  if (nt === "slow-2g") return "Slow 2G";
  return networkType?.toUpperCase() ?? "Unknown";
}

function resolveNetworkGeneration(override: NetworkGeneration): string {
  if (override !== "AUTO") return override;

  const conn = (navigator as NavigatorWithConnection).connection;
  if (conn?.effectiveType) return conn.effectiveType.toUpperCase();
  return "UNKNOWN";
}

function getDownlink(): number {
  const conn = (navigator as NavigatorWithConnection).connection;
  return conn?.downlink ?? 0;
}

function getLatency(): number {
  const conn = (navigator as NavigatorWithConnection).connection;
  return conn?.rtt ?? 0;
}

function estimateSignalStrength(networkType: string, downlink: number, latency: number): number {
  const baseByNetwork: Record<string, number> = {
    "5G": -65, "4G": -75, "3G": -90, "2G": -105, "SLOW-2G": -112,
  };
  const base = baseByNetwork[networkType] ?? -95;
  const speedBoost = Math.min(12, Math.round(downlink * 1.5));
  const latencyPenalty = latency > 0 ? Math.min(18, Math.round(latency / 25)) : 5;
  return Math.max(-120, Math.min(-55, base + speedBoost - latencyPenalty));
}

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30000,
  timeout: 20000,
};

function getGpsErrorMessage(error: GeolocationPositionError): string {
  if (!window.isSecureContext) {
    return "GPS needs HTTPS or localhost";
  }

  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission denied";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "GPS position unavailable";
  }

  if (error.code === error.TIMEOUT) {
    return "GPS timed out, try again";
  }

  return "GPS error";
}

function MapClickHandler({ readings, onAreaClick }: {
  readings: Reading[];
  onAreaClick: (lat: number, lng: number, nearby: Reading[]) => void;
}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      const nearby = readings.filter(
        (r) => Math.abs(r.latitude - lat) < 0.005 && Math.abs(r.longitude - lng) < 0.005
      );
      onAreaClick(lat, lng, nearby);
    },
  });
  return null;
}

function MapFocusHandler({ focus }: { focus: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;
    map.flyTo(focus, Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [focus, map]);

  return null;
}
type MapColorMode = "signal" | "network";
type NetworkProviderQuality = {
  networkType: string;
  provider: string;
  total: number;
  avgSignal: number;
  quality: string;
};

export default function MapPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [logging, setLogging] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  const [networkGeneration, setNetworkGeneration] = useState<NetworkGeneration>("AUTO");
  const watchIdRef = useRef<number | null>(null);
  const lastLoggedLocationRef = useRef<{ lat: number; lng: number } | null>(null);

const [colorMode, setColorMode] = useState<MapColorMode>("signal");
const [networkFilter, setNetworkFilter] = useState<string>("ALL");
const [areaReport, setAreaReport] = useState<{
  lat: number; lng: number;
  avgSignal: number;
  dominantNetwork: string;
  dominantOperator: string;
  deadZones: number;
  total: number;
  networkCounts: Record<string, number>;
  networkProviderQuality: NetworkProviderQuality[];
  mlPrediction: {
    is_dead_zone: boolean;
    probability: number;
    risk_level: string;
    confidence: number;
    top_factor: string;
  } | null;
} | null>(null);
const [isLoadingReport, setIsLoadingReport] = useState(false);

  useEffect(() => {
  setReadings(loadLocalReadings());
  fetchHeatmap();
  const debouncedFetch = debounce(fetchHeatmap, 500);
  const refresh = setInterval(debouncedFetch, 15000);
  return () => clearInterval(refresh);
}, []);

  useEffect(() => {
    saveLocalReadings(readings);
  }, [readings]);

  async function fetchHeatmap() {
    try {
      const res = await api.getHeatmap();
      if (res.success && Array.isArray(res.data)) {
        const serverReadings = (res.data as ReadingPayload[])
            .map(normalizeReading)
            .filter((reading): reading is Reading => Boolean(reading))
            .map((reading) => ({ ...reading, synced: true }));

        setReadings((current) => mergeReadings(
          current,
          serverReadings
        ));
      }
    } catch (e) {
      console.error("Heatmap fetch failed", e);
    }
  }

  function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async function logReading(lat: number, lng: number, gpsAccuracy = 10) {
    const lastLocation = lastLoggedLocationRef.current;
    if (!lastLocation) {
      lastLoggedLocationRef.current = { lat, lng };
      setStatus("GPS locked - move 10m to log");
      return;
    }

    const moved = getDistanceMeters(lastLocation.lat, lastLocation.lng, lat, lng);
    if (moved < 10) {
      setStatus(`Awaiting movement (${Math.round(moved)}m)`);
      return;
    }

    const networkType = resolveNetworkGeneration(networkGeneration);
    const downlink = getDownlink();
    const latency = getLatency();
    const signal = estimateSignalStrength(networkType, downlink, latency);
    const localReading = normalizeReading({
      id: `local-${Date.now()}-${Math.round(lat * 100000)}-${Math.round(lng * 100000)}`,
      latitude: lat,
      longitude: lng,
      signal_strength: signal,
      network_type: networkType,
      operator: "unknown",
      gps_accuracy: gpsAccuracy,
      download_speed: downlink,
      latency,
      created_at: new Date().toISOString(),
      synced: false,
    });

    if (localReading) {
      lastLoggedLocationRef.current = { lat: localReading.latitude, lng: localReading.longitude };
      setReadings((current) => mergeReadings([localReading], current));
      setFocusPoint([localReading.latitude, localReading.longitude]);
    }

    try {
      const res = await api.submitReading({
        latitude: lat,
        longitude: lng,
        signal_strength: signal,
        network_type: networkType,
        operator: "unknown",
        device_type: /Android/i.test(navigator.userAgent) ? "android" : "other",
        gps_accuracy: gpsAccuracy,
        download_speed: downlink,
        latency,
      });
      if (!res.success) {
        throw new Error(res.detail ?? "Reading was not saved");
      }
      const savedReading = normalizeReading(res.data) ?? normalizeReading({
        latitude: lat,
        longitude: lng,
        signal_strength: signal,
        network_type: networkType,
        operator: "unknown",
        gps_accuracy: gpsAccuracy,
        download_speed: downlink,
        latency,
        created_at: new Date().toISOString(),
      });
      if (savedReading) {
        lastLoggedLocationRef.current = { lat: savedReading.latitude, lng: savedReading.longitude };
        setReadings((current) => [
          { ...savedReading, synced: true },
          ...current.filter((reading) => reading.id !== savedReading.id && reading.id !== localReading?.id),
        ]);
        setFocusPoint([savedReading.latitude, savedReading.longitude]);
      }
      setSessionCount((c) => c + 1);
      setStatus(`Logged - ${getSignalLabel(signal)}`);
      fetchHeatmap();
    } catch {
      setSessionCount((c) => c + 1);
      setStatus(`Mapped locally - ${getSignalLabel(signal)}`);
    }
  }

  function startLogging() {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported");
      return;
    }

    if (!window.isSecureContext) {
      setStatus("GPS needs HTTPS or localhost");
      return;
    }

    setLogging(true);
    lastLoggedLocationRef.current = null;
    setStatus("Getting GPS fix");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        logReading(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (error) => {
        setStatus(getGpsErrorMessage(error));
        setLogging(false);
      },
      { ...GPS_OPTIONS, maximumAge: 0 }
    );
  }

  function stopLogging() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setLogging(false);
    setStatus("Session ended");
  }

async function handleAreaClick(lat: number, lng: number, nearby: Reading[]) {
  if (nearby.length === 0) {
    setStatus(`No data at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    setAreaReport(null);
    return;
  }

  const avgSignal = nearby.reduce((s, r) => s + r.signal_strength, 0) / nearby.length;
  const networkCounts: Record<string, number> = {};
  const operatorCounts: Record<string, number> = {};
  const qualityGroups = new Map<string, {
    networkType: string;
    provider: string;
    total: number;
    signalSum: number;
  }>();
  nearby.forEach((r) => {
    const nt = r.network_type?.toLowerCase() ?? "unknown";
    const provider = r.operator || "unknown";
    networkCounts[nt] = (networkCounts[nt] ?? 0) + 1;
    operatorCounts[provider] = (operatorCounts[provider] ?? 0) + 1;
    const groupKey = `${nt}-${provider}`;
    const group = qualityGroups.get(groupKey) ?? {
      networkType: nt,
      provider,
      total: 0,
      signalSum: 0,
    };
    group.total += 1;
    group.signalSum += r.signal_strength;
    qualityGroups.set(groupKey, group);
  });
  const dominantNetwork = Object.entries(networkCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const dominantOperator = Object.entries(operatorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const networkProviderQuality = Array.from(qualityGroups.values())
    .map((group) => {
      const groupAvgSignal = group.signalSum / group.total;
      return {
        networkType: group.networkType,
        provider: group.provider,
        total: group.total,
        avgSignal: groupAvgSignal,
        quality: getSignalLabel(groupAvgSignal),
      };
    })
    .sort((a, b) => b.total - a.total);

  // Show optimistic UI immediately with local data
  setAreaReport({
    lat, lng, avgSignal, dominantNetwork, dominantOperator,
    deadZones: nearby.filter((r) => r.signal_strength < -100).length,
    total: nearby.length, networkCounts, networkProviderQuality, mlPrediction: null,
  });
  setStatus(`Area report: ${nearby.length} readings`);

  // Then fetch ML prediction in background
  setIsLoadingReport(true);
  try {
    const data = await api.getAreaReport(lat, lng, 500, dominantNetwork);
    setAreaReport((prev) => prev ? { ...prev, mlPrediction: data.ml_prediction ?? null } : prev);
  } catch {
    // ML failed silently — area report still shows without it
  } finally {
    setIsLoadingReport(false);
  }
}


  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Live Signal Heatmap</p>
          <h1>Network Coverage Map</h1>
          <p className="hero-copy">
            Start logging to add your current location to the map.
          </p>
        </div>
        <div className="hero-actions">
          <label className="network-picker">
            <span>Network</span>
            <select value={networkGeneration} onChange={(e) => setNetworkGeneration(e.target.value as NetworkGeneration)} disabled={logging}>
              <option value="AUTO">Auto</option>
              <option value="3G">3G</option>
              <option value="4G">4G</option>
              <option value="5G">5G</option>
            </select>
          </label>
          <div className={`status-pill ${logging ? "active" : ""}`}>
            <span aria-hidden="true" />
            {status}
          </div>
          <button className={`primary-button ${logging ? "danger" : ""}`} onClick={logging ? stopLogging : startLogging}>
            {logging ? "Stop Logging" : "Start Logging"}
          </button>
        </div>
      </section>

      <section className="panel toolbar-panel">
  <div>
    <p className="panel-kicker">Map Summary</p>
    <h2>{readings.length} points mapped</h2>
    <p>Marks the points if moved 10 meters or more. Click the map to copy a location into the status bar.</p>
  </div>
  {sessionCount > 0 && <div className="count-badge">{sessionCount} logged this session</div>}
</section>


{/* Color mode + network filter */}
<section className="panel" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", padding: "0.6rem 1rem" }}>
  <div style={{ display: "flex", gap: "0.4rem" }}>
    <span style={{ opacity: 0.5, fontSize: "0.8rem", alignSelf: "center" }}>Color by:</span>
    {(["signal", "network"] as MapColorMode[]).map((m) => (
      <button key={m} onClick={() => setColorMode(m)} style={{
        padding: "0.25rem 0.7rem", borderRadius: "999px", border: "1px solid",
        cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
        background: colorMode === m ? "#fff" : "transparent",
        color: colorMode === m ? "#000" : "#fff",
        borderColor: colorMode === m ? "#fff" : "#555",
      }}>
        {m === "signal" ? "📶 Signal" : "📡 Network Type"}
      </button>
    ))}
  </div>

  {colorMode === "network" && (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
      <span style={{ opacity: 0.5, fontSize: "0.8rem", alignSelf: "center" }}>Filter:</span>
      {["ALL", "5g", "4g", "3g", "slow-2g"].map((f) => (
        <button key={f} onClick={() => setNetworkFilter(f)} style={{
          padding: "0.25rem 0.7rem", borderRadius: "999px", border: "1px solid",
          cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
          background: networkFilter === f ? getNetworkColor(f) : "transparent",
          color: networkFilter === f ? "#fff" : "#aaa",
          borderColor: networkFilter === f ? getNetworkColor(f) : "#444",
        }}>
          {f === "ALL" ? "All" : f.toUpperCase()}
        </button>
      ))}
    </div>
  )}
</section>

     <section className="legend-row" aria-label="Signal strength legend">
  {colorMode === "signal" ? (
    signalLegend.map((item) => (
      <div className="legend-item" key={item.label}>
        <span style={{ background: item.color }} />
        <strong>{item.label}</strong>
        <small>{item.range}</small>
      </div>
    ))
  ) : (
    [
      { label: "5G", color: "#a855f7" },
      { label: "4G", color: "#3b82f6" },
      { label: "3G", color: "#f59e0b" },
      { label: "2G / Slow", color: "#ef4444" },
      { label: "Unknown", color: "#6b7280" },
    ].map((item) => (
      <div className="legend-item" key={item.label}>
        <span style={{ background: item.color }} />
        <strong>{item.label}</strong>
      </div>
    ))
  )}
</section>
{areaReport && (
  <section className="panel" style={{ margin: "0 1rem 0.5rem", borderLeft: `4px solid ${getSignalColor(areaReport.avgSignal)}`, padding: "0.75rem 1rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <p className="panel-kicker">📍 {areaReport.lat.toFixed(4)}, {areaReport.lng.toFixed(4)}</p>
          <p style={{ color: getSignalColor(areaReport.avgSignal), fontWeight: 700, margin: 0 }}>
            {getSignalLabel(areaReport.avgSignal)} — avg {areaReport.avgSignal.toFixed(0)}
          </p>
        </div>
        <div><small style={{ opacity: 0.6 }}>Dominant Network</small>
          <p style={{ fontWeight: 700, color: getNetworkColor(areaReport.dominantNetwork), margin: 0 }}>
            {areaReport.dominantNetwork.toUpperCase()}
          </p>
        </div>
        <div><small style={{ opacity: 0.6 }}>Operator</small>
          <p style={{ fontWeight: 700, margin: 0 }}>{areaReport.dominantOperator}</p>
        </div>
        <div><small style={{ opacity: 0.6 }}>Dead Zones</small>
          <p style={{ fontWeight: 700, color: "#ef4444", margin: 0 }}>{areaReport.deadZones} / {areaReport.total}</p>
        </div>
       {isLoadingReport ? (
  <div>
    <small style={{ opacity: 0.6 }}>🤖 ML Prediction</small>
    <p style={{ fontWeight: 700, margin: 0, opacity: 0.4 }}>Analyzing...</p>
  </div>
) : areaReport.mlPrediction ? (
  <div style={{ borderLeft: `3px solid ${areaReport.mlPrediction.risk_level === "HIGH" ? "#ef4444" : areaReport.mlPrediction.risk_level === "MEDIUM" ? "#f59e0b" : "#22c55e"}`, paddingLeft: "0.75rem" }}>
    <small style={{ opacity: 0.6 }}>🤖 ML Prediction</small>
    <p style={{
      fontWeight: 700, margin: 0,
      color: areaReport.mlPrediction.risk_level === "HIGH" ? "#ef4444" : areaReport.mlPrediction.risk_level === "MEDIUM" ? "#f59e0b" : "#22c55e"
    }}>
      {areaReport.mlPrediction.risk_level} RISK — {Math.round(areaReport.mlPrediction.probability * 100)}%
    </p>
    <small style={{ opacity: 0.5 }}>Confidence: {areaReport.mlPrediction.confidence}% · Key factor: {areaReport.mlPrediction.top_factor}</small>
  </div>
) : null}
        <div><small style={{ opacity: 0.6 }}>Breakdown</small>
          <p style={{ fontWeight: 600, fontSize: "0.8rem", margin: 0 }}>
            {Object.entries(areaReport.networkCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
              .join(" · ")}
          </p>
        </div>
      </div>
      <button onClick={() => setAreaReport(null)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "1.1rem" }}>✕</button>
    </div>
  </section>
)}
      <section className="map-panel">
  <MapContainer center={[19.076, 72.8777]} zoom={12} style={{ height: "100%", width: "100%", background: "#0a0f0a" }}>
    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
    <MapClickHandler readings={readings} onAreaClick={handleAreaClick} />
    <MapFocusHandler focus={focusPoint} />
    {readings
      .filter((r) => colorMode === "signal" || networkFilter === "ALL" || r.network_type?.toLowerCase() === networkFilter)
      .map((r) => {
        const color = colorMode === "network" ? getNetworkColor(r.network_type) : getSignalColor(r.signal_strength);
        return (
          <CircleMarker
            key={r.id}
            center={[r.latitude, r.longitude]}
            radius={8}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.82, weight: 1.5 }}
          >
            <Popup>
              <div className="map-popup">
                <strong style={{ color }}>{getSignalLabel(r.signal_strength)}</strong>
                <p>📡 Network: <strong>{getNetworkLabel(r.network_type)}</strong></p>
                <p>📶 Signal: {r.signal_strength}</p>
                {r.download_speed != null && <p>⬇ Downlink: {r.download_speed} Mbps</p>}
                {r.latency != null && <p>⏱ Latency: {r.latency} ms</p>}
                <p>🏢 Operator: {r.operator}</p>
                {!r.synced && <p>💾 Saved locally</p>}
                <small>{new Date(r.created_at).toLocaleString()}</small>
              </div>
            </Popup>
          </CircleMarker>
        );
      })
    }
  </MapContainer>
</section>
    </div>
  );
}
