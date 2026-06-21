from fastapi import APIRouter, HTTPException, Query
from app.db.supabase import supabase
from pydantic import BaseModel
import httpx
import os

router = APIRouter()

ORS_API_KEY = os.getenv("ORS_API_KEY")
ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")


class RouteInsightRequest(BaseModel):
    routes: list[dict]
    from_place: str
    to_place: str

def decode_polyline(polyline_str):
    """Decode Google/ORS encoded polyline to list of [lng, lat]"""
    index, lat, lng = 0, 0, 0
    coordinates = []
    changes = {'lat': 0, 'lng': 0}

    while index < len(polyline_str):
        for unit in ['lat', 'lng']:
            shift, result = 0, 0
            while True:
                b = ord(polyline_str[index]) - 63
                index += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            if result & 1:
                changes[unit] = ~(result >> 1)
            else:
                changes[unit] = result >> 1

        lat += changes['lat']
        lng += changes['lng']
        coordinates.append([lng / 1e5, lat / 1e5])

    return coordinates

def classify_signal(dbm: int) -> str:
    if dbm >= -70:
        return "excellent"
    elif dbm >= -85:
        return "good"
    elif dbm >= -100:
        return "moderate"
    elif dbm >= -110:
        return "weak"
    else:
        return "dead"

def build_route_summary(routes: list[dict]) -> str:
    names = ["Route A", "Route B", "Route C"]
    lines = []

    for index, route in enumerate(routes):
        lines.append(f"""
{names[index] if index < len(names) else f"Route {index + 1}"}:
- Signal Score: {route.get("signal_score")}%
- Avg Signal: {route.get("avg_signal_dbm")} dBm
- Distance: {route.get("distance_km")} km
- Duration: {route.get("duration_min")} min
- Dead Zone %: {route.get("dead_zone_pct")}%
- Breakdown: {route.get("breakdown")}
- Recommended: {route.get("recommended")}
""")

    return "\n".join(lines)

async def get_signal_score_for_route(coordinates: list) -> dict:
    scores = []
    breakdown = {"excellent": 0, "good": 0, "moderate": 0, "weak": 0, "dead": 0}

    sampled = coordinates[::5] if len(coordinates) > 10 else coordinates

    for coord in sampled:
        lng, lat = coord[0], coord[1]
        result = supabase.rpc("get_readings_in_radius", {
            "center_lat": lat,
            "center_lng": lng,
            "radius_meters": 150
        }).execute()

        if result.data:
            avg_signal = sum(r["signal_strength"] for r in result.data) / len(result.data)
            label = classify_signal(int(avg_signal))
            breakdown[label] += 1
            scores.append(avg_signal)

    avg = sum(scores) / len(scores) if scores else -120
    dead_pct = round((breakdown["dead"] / max(sum(breakdown.values()), 1)) * 100, 1)

    return {
        "avg_signal_dbm": round(avg, 1),
        "breakdown": breakdown,
        "dead_zone_pct": dead_pct,
        "signal_score": max(0, min(100, int((avg + 120) / 50 * 100)))
    }

@router.get("/route")
async def compare_routes(
    from_lat: float = Query(...),
    from_lng: float = Query(...),
    to_lat: float = Query(...),
    to_lng: float = Query(...)
):
    try:
        if not ORS_API_KEY:
            raise HTTPException(status_code=500, detail="ORS_API_KEY not set")

        headers = {
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json"
        }
        body = {
            "coordinates": [[from_lng, from_lat], [to_lng, to_lat]],
            "instructions": False
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(ORS_URL, json=body, headers=headers, timeout=15)
            resp.raise_for_status()
            ors_data = resp.json()

        routes = ors_data.get("routes", [])
        if not routes:
            raise HTTPException(status_code=404, detail="No routes found")

        result = []
        for i, r in enumerate(routes):
            # Decode encoded polyline to coordinates
            coords = decode_polyline(r["geometry"])
            signal_info = await get_signal_score_for_route(coords)
            summary = r["summary"]

            result.append({
                "route_index": i,
                "distance_km": round(summary["distance"] / 1000, 2),
                "duration_min": round(summary["duration"] / 60, 1),
                "signal_score": signal_info["signal_score"],
                "avg_signal_dbm": signal_info["avg_signal_dbm"],
                "dead_zone_pct": signal_info["dead_zone_pct"],
                "breakdown": signal_info["breakdown"],
                "recommended": False
            })

        best = max(result, key=lambda x: x["signal_score"])
        best["recommended"] = True

        return {"success": True, "routes": result}

    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"ORS API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/route/insight")
async def route_insight(payload: RouteInsightRequest):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not set")

    route_summary = build_route_summary(payload.routes)
    prompt = f"""You are a telecom signal analyst. A user wants to travel from "{payload.from_place}" to "{payload.to_place}" in Mumbai, India.
Here is the signal quality data for available routes:

{route_summary}

Give a short, clear recommendation (3-4 sentences max) explaining which route to take, what connectivity to expect, and any dead-zone warning. Be direct and practical."""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "X-Title": "DeadZone Route Planner",
    }
    body = {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 200,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(OPENROUTER_URL, json=body, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()

        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        if not content:
            raise HTTPException(status_code=502, detail="OpenRouter returned no insight")

        return {"success": True, "insight": content}

    except httpx.HTTPStatusError as e:
        detail = e.response.text[:300] if e.response is not None else str(e)
        raise HTTPException(status_code=502, detail=f"OpenRouter API error: {detail}")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"OpenRouter API error: {str(e)}")
