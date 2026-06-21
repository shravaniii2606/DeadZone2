const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const api = {
  async submitReading(data: object) {
    const res = await fetch(`${BASE_URL}/api/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getHeatmap() {
    const res = await fetch(`${BASE_URL}/api/heatmap`);
    return res.json();
  },

  async getAreaReport(lat: number, lng: number, radius = 100) {
    const res = await fetch(`${BASE_URL}/api/area-report?lat=${lat}&lng=${lng}&radius=${radius}`);
    return res.json();
  },

  async getRoute(fromLat: number, fromLng: number, toLat: number, toLng: number) {
    const res = await fetch(`${BASE_URL}/api/route?from_lat=${fromLat}&from_lng=${fromLng}&to_lat=${toLat}&to_lng=${toLng}`);
    return res.json();
  },

  async getRouteInsight(routes: object[], fromPlace: string, toPlace: string) {
    const res = await fetch(`${BASE_URL}/api/route/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routes, from_place: fromPlace, to_place: toPlace }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Could not generate insight.");
    }
    return data;
  },
};
