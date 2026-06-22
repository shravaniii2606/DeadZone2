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

def get_route_name(route: dict) -> str:
    """Extract main road name from ORS route instructions"""
    try:
        segments = route.get("segments", [])
        if not segments:
            return "Unnamed Route"

        steps = segments[0].get("steps", [])

        # Pick the step with longest duration (main road)
        valid_steps = [s for s in steps if s.get("name", "").strip() not in ("", "-")]
        if not valid_steps:
            return "Unnamed Route"

        best_step = max(valid_steps, key=lambda s: s.get("duration", 0))
        main_road = best_step.get("name", "").strip()

        if main_road:
            return f"Via {main_road}"
        return "Unnamed Route"
    except:
        return "Unnamed Route"

def build_route_summary(routes: list[dict]) -> str:
    lines = []
    for index, route in enumerate(routes):
        name = route.get("route_name") or f"Route {index + 1}"
        lines.append(f"""
{name}:
- Signal Score: {route.get("signal_score")}%
- Avg Signal: {route.get("avg_signal_dbm")} dBm
- Distance: {route.get("distance_km")} km
- Duration: {route.get("duration_min")} min
- Dead Zone %: {route.get("dead_zone_pct")}%
- Breakdown: {route.get("breakdown")}
- Recommended: {route.get("recommended")}
""")
    return "\n".join(lines)


def parse_openrouter_response(data: dict) -> str | None:
    if not isinstance(data, dict):
        return None

    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0]
        if isinstance(first_choice, dict):
            message = first_choice.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()

            text = first_choice.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()

    for fallback_key in ("output_text", "completion", "result"):
        value = data.get(fallback_key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return None


def build_fallback_insight(routes: list[dict], from_place: str, to_place: str) -> str:
    if not routes:
        return (
            f"Travel from {from_place} to {to_place} with the available route data. "
            "No AI insight is available at the moment."
        )

    best_route = max(routes, key=lambda route: route.get("signal_score", 0))
    route_name = best_route.get("route_name") or f"Route {best_route.get('route_index', 0) + 1}"
    score = best_route.get("signal_score", 0)
    avg_signal = best_route.get("avg_signal_dbm", "N/A")
    dead_zone = best_route.get("dead_zone_pct", 0)
    dead_zone_note = (
        "Expect some dead-zone risk on this route." if dead_zone > 20 else "Dead-zone risk appears low."
    )

    return (
        f"I recommend {route_name} for travel from {from_place} to {to_place}. "
        f"It has the highest signal score at {score}% with an average signal strength of {avg_signal} dBm. "
        f"{dead_zone_note} Estimated dead-zone coverage is around {dead_zone}%.")


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
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured. Copy backend/.env.example to backend/.env and set SUPABASE_URL and SUPABASE_KEY")

    try:
        if not ORS_API_KEY:
            raise HTTPException(status_code=500, detail="ORS_API_KEY not set")

        headers = {
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json"
        }
        body = {
            "coordinates": [[from_lng, from_lat], [to_lng, to_lat]],
            "instructions": True,
            "alternative_routes": {
                "target_count": 3,
                "weight_factor": 1.4,
                "share_factor": 0.6
            }
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
            coords = decode_polyline(r["geometry"])
            signal_info = await get_signal_score_for_route(coords)
            summary = r["summary"]

            result.append({
                "route_index": i,
                "route_name": get_route_name(r),
                "distance_km": round(summary["distance"] / 1000, 2),
                "duration_min": round(summary["duration"] / 60, 1),
                "signal_score": signal_info["signal_score"],
                "avg_signal_dbm": signal_info["avg_signal_dbm"],
                "dead_zone_pct": signal_info["dead_zone_pct"],
                "breakdown": signal_info["breakdown"],
                "path": [[lat, lng] for lng, lat in coords],
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

        content = parse_openrouter_response(data)
        if content:
            return {"success": True, "insight": content}

        fallback_text = build_fallback_insight(payload.routes, payload.from_place, payload.to_place)
        return {"success": True, "insight": fallback_text}

    except httpx.HTTPStatusError as e:
        detail = e.response.text[:300] if e.response is not None else str(e)
        raise HTTPException(status_code=502, detail=f"OpenRouter API error: {detail}")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"OpenRouter API error: {str(e)}")
