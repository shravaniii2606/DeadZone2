from fastapi import APIRouter, HTTPException, Query
from app.db.supabase import supabase
import httpx
import os

router = APIRouter()

ORS_API_KEY = os.getenv("ORS_API_KEY")
ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car"

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

async def get_signal_score_for_route(coordinates: list) -> dict:
    """Sample points along route and check signal quality"""
    scores = []
    breakdown = {"excellent": 0, "good": 0, "moderate": 0, "weak": 0, "dead": 0}

    # Sample every 5th coordinate to avoid too many DB calls
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

        headers = {"Authorization": ORS_API_KEY, "Content-Type": "application/json"}
        body = {
            "coordinates": [[from_lng, from_lat], [to_lng, to_lat]],
            "alternative_routes": {"target_count": 2, "weight_factor": 1.4}
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(ORS_URL, json=body, headers=headers, timeout=10)
            resp.raise_for_status()
            ors_data = resp.json()

        routes = ors_data.get("routes", [])
        if not routes:
            raise HTTPException(status_code=404, detail="No routes found")

        result = []
        for i, r in enumerate(routes):
            coords = r["geometry"]["coordinates"]
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

        # Mark best signal route as recommended
        best = max(result, key=lambda x: x["signal_score"])
        best["recommended"] = True

        return {"success": True, "routes": result}

    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"ORS API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))