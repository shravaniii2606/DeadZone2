from fastapi import APIRouter, HTTPException, Query
from app.db.supabase import supabase
from app.ml.predictor import DeadZonePredictor
from datetime import datetime

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
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(100),
    network_type: str = Query("4g"),
    downlink: float = Query(5.0),
    rtt: float = Query(50.0),
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured.")

    try:
        result = supabase.rpc("get_readings_in_radius", {
            "center_lat": lat,
            "center_lng": lng,
            "radius_meters": radius
        }).execute()

        readings = result.data or []

        # Signal breakdown from real data
        breakdown = {"excellent": 0, "good": 0, "moderate": 0, "weak": 0, "dead": 0}
        network_counts = {}
        operator_counts = {}

        for r in readings:
            label = classify_signal(r["signal_strength"])
            breakdown[label] += 1
            nt = (r.get("network_type") or "unknown").lower()
            network_counts[nt] = network_counts.get(nt, 0) + 1
            op = r.get("operator") or "unknown"
            operator_counts[op] = operator_counts.get(op, 0) + 1

        total = len(readings)
        breakdown_pct = {k: round((v / total) * 100, 1) for k, v in breakdown.items()} if total else {}
        dominant = max(breakdown, key=breakdown.get) if total else "no_data"
        dominant_network = max(network_counts, key=network_counts.get) if network_counts else network_type
        dominant_operator = max(operator_counts, key=operator_counts.get) if operator_counts else "unknown"

        # ML prediction
        hour = datetime.now().hour
        predictor = DeadZonePredictor.get()
        ml_result = predictor.predict(
            lat=lat, lng=lng,
            network_type=dominant_network,
            downlink=downlink,
            rtt=rtt,
            hour=hour
        )

        return {
            "success": True,
            "total": total,
            "center": {"lat": lat, "lng": lng},
            "radius_meters": radius,
            "breakdown": breakdown_pct,
            "zone_label": dominant.upper(),
            "dominant_network": dominant_network.upper(),
            "dominant_operator": dominant_operator,
            "network_counts": network_counts,
            "operator_counts": operator_counts,
            "ml_prediction": ml_result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))