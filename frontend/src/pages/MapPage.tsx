import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
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
  { label: "Excellent", color: "#22c55e", range: ">= -70 dBm" },
  { label: "Good", color: "#84cc16", range: "-70 to -85" },
  { label: "Moderate", color: "#f59e0b", range: "-85 to -100" },
  { label: "Weak", color: "#ef4444", range: "-100 to -110" },
  { label: "Dead Zone", color: "#6b7280", range: "< -110 dBm" },
];

const LOCAL_READINGS_KEY = "deadzone.localReadings";

type ReadingPayload = Partial<Reading> & {
  lat?: number | string;
  lng?: number | string;
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
    id: reading.id ?? `${latitude}-${longitude}-${Date.now()}`,
    latitude,
    longitude,
    signal_strength: signalStrength,
    network_type: reading.network_type ?? "unknown",
    operator: reading.operator ?? "unknown",
    created_at: reading.created_at ?? new Date().toISOString(),
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

function getSignalColor(dbm: number): string {
  if (dbm >= -70) return "#22c55e";
  if (dbm >= -85) return "#84cc16";
  if (dbm >= -100) return "#f59e0b";
  if (dbm >= -110) return "#ef4444";
  return "#6b7280";
}

function getSignalLabel(dbm: number): string {
  if (dbm >= -70) return "Excellent";
  if (dbm >= -85) return "Good";
  if (dbm >= -100) return "Moderate";
  if (dbm >= -110) return "Weak";
  return "Dead Zone";
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
    "5G": -65,
    "4G": -75,
    "3G": -90,
    "2G": -105,
    "SLOW-2G": -112,
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

function MapClickHandler({ onAreaClick }: { onAreaClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onAreaClick(e.latlng.lat, e.latlng.lng);
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

export default function MapPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [logging, setLogging] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  const [networkGeneration, setNetworkGeneration] = useState<NetworkGeneration>("AUTO");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setReadings(loadLocalReadings());
    fetchHeatmap();
    const refresh = setInterval(fetchHeatmap, 15000);
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

  async function logReading(lat: number, lng: number, gpsAccuracy = 10) {
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
    setStatus("Getting GPS fix");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        logReading(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        setStatus("Logging every 10 seconds");
        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            (nextPos) => logReading(nextPos.coords.latitude, nextPos.coords.longitude, nextPos.coords.accuracy),
            (error) => setStatus(getGpsErrorMessage(error)),
            GPS_OPTIONS
          );
        }, 10000);
      },
      (error) => {
        setStatus(getGpsErrorMessage(error));
        setLogging(false);
      },
      GPS_OPTIONS
    );
  }

  function stopLogging() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setLogging(false);
    setStatus("Session ended");
  }

  function handleAreaClick(lat: number, lng: number) {
    setStatus(`Selected ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Live Signal Heatmap</p>
          <h1>Network Coverage Map</h1>
          <p className="hero-copy">
            View community signal readings around Mumbai. Start logging to add your current location to the map.
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
          <p>Auto-refreshes every 15 seconds. Click the map to copy a location into the status bar.</p>
        </div>
        {sessionCount > 0 && <div className="count-badge">{sessionCount} logged this session</div>}
      </section>

      <section className="legend-row" aria-label="Signal strength legend">
        {signalLegend.map((item) => (
          <div className="legend-item" key={item.label}>
            <span style={{ background: item.color }} />
            <strong>{item.label}</strong>
            <small>{item.range}</small>
          </div>
        ))}
      </section>

      <section className="map-panel">
        <MapContainer center={[19.076, 72.8777]} zoom={12} style={{ height: "100%", width: "100%", background: "#0a0f0a" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
          <MapClickHandler onAreaClick={handleAreaClick} />
          <MapFocusHandler focus={focusPoint} />
          {readings.map((r) => (
            <CircleMarker
              key={r.id}
              center={[r.latitude, r.longitude]}
              radius={8}
              pathOptions={{
                color: getSignalColor(r.signal_strength),
                fillColor: getSignalColor(r.signal_strength),
                fillOpacity: 0.82,
                weight: 1.5,
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong style={{ color: getSignalColor(r.signal_strength) }}>{getSignalLabel(r.signal_strength)}</strong>
                  <p>Signal: {r.signal_strength} dBm</p>
                  <p>Network: {r.network_type}</p>
                  {r.download_speed !== null && r.download_speed !== undefined && <p>Downlink: {r.download_speed} Mbps</p>}
                  {r.latency !== null && r.latency !== undefined && <p>Latency: {r.latency} ms</p>}
                  {r.gps_accuracy !== null && r.gps_accuracy !== undefined && <p>GPS: {r.gps_accuracy.toFixed(1)} m</p>}
                  <p>Operator: {r.operator}</p>
                  {!r.synced && <p>Saved on this device</p>}
                  <small>{new Date(r.created_at).toLocaleString()}</small>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </section>
    </div>
  );
}
