const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

type AreaReportContext = {
  avgSignal?: number;
  badReadingRatio?: number;
  totalReadings?: number;
  downlink?: number;
  rtt?: number;
};

// ── Debounce utility ──────────────────────────────────────────
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

// ── Fetch with timeout + retry ────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000,
  retries = 1
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 400)); // wait before retry
    }
  }
  throw new Error("Max retries exceeded");
}

// ── API ───────────────────────────────────────────────────────
export const api = {
  async submitReading(data: object) {
    const res = await fetchWithTimeout(`${BASE_URL}/api/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }, 6000, 2); // 6s timeout, 2 retries for writes
    return res.json();
  },

  async getHeatmap() {
    const res = await fetchWithTimeout(`${BASE_URL}/api/heatmap`, {}, 10000, 1);
    return res.json();
  },

  async getAreaReport(
    lat: number,
    lng: number,
    radius = 500,
    networkType = "4g",
    context: AreaReportContext = {}
  ) {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radius),
      network_type: networkType,
    });

    if (context.avgSignal !== undefined) params.set("avg_signal", String(context.avgSignal));
    if (context.badReadingRatio !== undefined) params.set("bad_reading_ratio", String(context.badReadingRatio));
    if (context.totalReadings !== undefined) params.set("total_readings", String(context.totalReadings));
    if (context.downlink !== undefined) params.set("downlink", String(context.downlink));
    if (context.rtt !== undefined) params.set("rtt", String(context.rtt));

    const res = await fetchWithTimeout(
      `${BASE_URL}/api/area-report?${params.toString()}`,
      {}, 6000, 1
    );
    return res.json();
  },

  async getRoute(fromLat: number, fromLng: number, toLat: number, toLng: number) {
    const res = await fetchWithTimeout(
      `${BASE_URL}/api/route?from_lat=${fromLat}&from_lng=${fromLng}&to_lat=${toLat}&to_lng=${toLng}`,
      {}, 15000, 0 // route is slow, no retry
    );
    return res.json();
  },

  async getRouteInsight(routes: object[], fromPlace: string, toPlace: string) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/route/insight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ routes, from_place: fromPlace, to_place: toPlace }),
  }, 40000, 0); // bump to 40s
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Could not generate insight.");
  return data;
},
};
