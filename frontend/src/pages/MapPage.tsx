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
}

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
  };
};

const signalLegend = [
  { label: "Excellent", color: "#22c55e", range: ">= -70 dBm" },
  { label: "Good", color: "#84cc16", range: "-70 to -85" },
  { label: "Moderate", color: "#f59e0b", range: "-85 to -100" },
  { label: "Weak", color: "#ef4444", range: "-100 to -110" },
  { label: "Dead Zone", color: "#6b7280", range: "< -110 dBm" },
];

function normalizeReading(reading: Partial<Reading> | null | undefined): Reading | null {
  if (!reading) return null;
  const latitude = Number(reading.latitude);
  const longitude = Number(reading.longitude);
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
  };
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchHeatmap();
    const refresh = setInterval(fetchHeatmap, 15000);
    return () => clearInterval(refresh);
  }, []);

  async function fetchHeatmap() {
    try {
      const res = await api.getHeatmap();
      if (res.success && Array.isArray(res.data)) {
        setReadings(
          (res.data as Partial<Reading>[])
            .map(normalizeReading)
            .filter((reading): reading is Reading => Boolean(reading))
        );
      }
    } catch (e) {
      console.error("Heatmap fetch failed", e);
    }
  }

  function getSignalStrength(): number {
    const conn = (navigator as NavigatorWithConnection).connection;
    if (conn) {
      const type = conn.effectiveType;
      if (type === "4g") return -65;
      if (type === "3g") return -85;
      if (type === "2g") return -100;
      return -110;
    }
    return Math.floor(Math.random() * 40) - 90;
  }

  function getNetworkType(): string {
    const conn = (navigator as NavigatorWithConnection).connection;
    if (conn?.effectiveType) return conn.effectiveType.toUpperCase();
    return "4G";
  }

  async function logReading(lat: number, lng: number) {
    const signal = getSignalStrength();
    try {
      const res = await api.submitReading({
        latitude: lat,
        longitude: lng,
        signal_strength: signal,
        network_type: getNetworkType(),
        operator: "unknown",
        device_type: /Android/i.test(navigator.userAgent) ? "android" : "other",
        gps_accuracy: 10,
      });
      const savedReading = normalizeReading(res.data) ?? normalizeReading({
        latitude: lat,
        longitude: lng,
        signal_strength: signal,
        network_type: getNetworkType(),
        operator: "unknown",
        created_at: new Date().toISOString(),
      });
      if (savedReading) {
        setReadings((current) => [
          savedReading,
          ...current.filter((reading) => reading.id !== savedReading.id),
        ]);
        setFocusPoint([savedReading.latitude, savedReading.longitude]);
      }
      setSessionCount((c) => c + 1);
      setStatus(`Logged - ${getSignalLabel(signal)}`);
      fetchHeatmap();
    } catch {
      setStatus("Log failed");
    }
  }

  function startLogging() {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported");
      return;
    }
    setLogging(true);
    setStatus("Logging every 10 seconds");

    navigator.geolocation.getCurrentPosition(
      (pos) => logReading(pos.coords.latitude, pos.coords.longitude),
      () => setStatus("GPS error"),
      { enableHighAccuracy: true, timeout: 5000 }
    );

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
          <div className={`status-pill ${logging ? "active" : ""}`}>
            <span aria-hidden="true" />
            {status}
          </div>
          <button className={`primary-button ${logging ? "danger" : ""}`} onClick={logging ? stopLogging : startLogging}>
            {logging ? "Stop Logging" : "Start Logging"}
          </button>
        </div>
      </section>

      <section className="quick-start">
        <div className="quick-step">
          <span>1</span>
          <strong>Allow GPS</strong>
          <p>Your browser asks once so DeadZone can place readings accurately.</p>
        </div>
        <div className="quick-step">
          <span>2</span>
          <strong>Start logging</strong>
          <p>A reading is saved now and then every 10 seconds until you stop.</p>
        </div>
        <div className="quick-step">
          <span>3</span>
          <strong>Read the colors</strong>
          <p>Green is strong coverage, red or gray means weak or dead-zone signal.</p>
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
                  <p>Operator: {r.operator}</p>
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
