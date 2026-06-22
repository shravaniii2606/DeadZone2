from fastapi import APIRouter, HTTPException, Query
from app.db.supabase import supabase

router = APIRouter()

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

@router.get("/area-report")
async def get_area_report(
    lat: float = Query(..., description="Latitude of center point"),
    lng: float = Query(..., description="Longitude of center point"),
    radius: int = Query(100, description="Radius in meters")
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured. Copy backend/.env.example to backend/.env and set SUPABASE_URL and SUPABASE_KEY")

    try:
        # PostGIS spatial query via Supabase RPC
        result = supabase.rpc("get_readings_in_radius", {
            "center_lat": lat,
            "center_lng": lng,
            "radius_meters": radius
        }).execute()

        readings = result.data
        if not readings:
            return {
                "success": True,
                "total": 0,
                "center": {"lat": lat, "lng": lng},
                "radius_meters": radius,
                "breakdown": {},
                "zone_label": "No Data"
            }

        # Classify each reading
        breakdown = {"excellent": 0, "good": 0, "moderate": 0, "weak": 0, "dead": 0}
        for r in readings:
            label = classify_signal(r["signal_strength"])
            breakdown[label] += 1

        total = len(readings)
        breakdown_pct = {k: round((v / total) * 100, 1) for k, v in breakdown.items()}

        # Overall zone label based on dominant category
        dominant = max(breakdown, key=breakdown.get)

        return {
            "success": True,
            "total": total,
            "center": {"lat": lat, "lng": lng},
            "radius_meters": radius,
            "breakdown": breakdown_pct,
            "zone_label": dominant.upper()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))