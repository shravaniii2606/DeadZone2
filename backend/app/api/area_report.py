from fastapi import APIRouter, HTTPException, Query
from app.db.supabase import supabase
from app.ml.predictor import DeadZonePredictor
from datetime import datetime

router = APIRouter()
SIGNAL_LABELS = ["excellent", "good", "moderate", "weak", "dead"]

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
    avg_signal: float | None = Query(None),
    bad_reading_ratio: float | None = Query(None),
    total_readings: int | None = Query(None),
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
        breakdown = {label: 0 for label in SIGNAL_LABELS}
        network_counts = {}
        network_signal = {}
        operator_counts = {}

        for r in readings:
            label = classify_signal(r["signal_strength"])
            breakdown[label] += 1
            nt = (r.get("network_type") or "unknown").lower()
            op = r.get("operator") or r.get("operator_name") or "unknown"
            network_counts[nt] = network_counts.get(nt, 0) + 1
            if nt not in network_signal:
                network_signal[nt] = {
                    "network_type": nt.upper(),
                    "total": 0,
                    "signal_sum": 0,
                    "breakdown": {signal_label: 0 for signal_label in SIGNAL_LABELS},
                    "providers": {},
                }
            network_signal[nt]["total"] += 1
            network_signal[nt]["signal_sum"] += r["signal_strength"]
            network_signal[nt]["breakdown"][label] += 1
            if op not in network_signal[nt]["providers"]:
                network_signal[nt]["providers"][op] = {
                    "provider": op,
                    "total": 0,
                    "signal_sum": 0,
                    "breakdown": {signal_label: 0 for signal_label in SIGNAL_LABELS},
                }
            network_signal[nt]["providers"][op]["total"] += 1
            network_signal[nt]["providers"][op]["signal_sum"] += r["signal_strength"]
            network_signal[nt]["providers"][op]["breakdown"][label] += 1
            operator_counts[op] = operator_counts.get(op, 0) + 1

        total = len(readings)
        avg_signal_value = (
            avg_signal
            if avg_signal is not None
            else (sum(r["signal_strength"] for r in readings) / total if total else None)
        )
        bad_count = sum(1 for r in readings if r["signal_strength"] < -100)
        bad_reading_ratio_value = (
            bad_reading_ratio
            if bad_reading_ratio is not None
            else (bad_count / total if total else None)
        )
        sample_size = total_readings if total_readings is not None else total
        breakdown_pct = {k: round((v / total) * 100, 1) for k, v in breakdown.items()} if total else {}
        dominant = max(breakdown, key=breakdown.get) if total else "no_data"
        dominant_network = max(network_counts, key=network_counts.get) if network_counts else network_type
        dominant_operator = max(operator_counts, key=operator_counts.get) if operator_counts else "unknown"
        network_signal_summary = []
        for nt, summary in network_signal.items():
            network_total = summary["total"]
            quality = max(summary["breakdown"], key=summary["breakdown"].get)
            providers = []
            for provider_summary in summary["providers"].values():
                provider_total = provider_summary["total"]
                provider_quality = max(provider_summary["breakdown"], key=provider_summary["breakdown"].get)
                providers.append({
                    "provider": provider_summary["provider"],
                    "total": provider_total,
                    "avg_signal": round(provider_summary["signal_sum"] / provider_total, 1),
                    "quality": provider_quality.upper(),
                    "breakdown": provider_summary["breakdown"],
                    "breakdown_pct": {
                        label: round((count / provider_total) * 100, 1)
                        for label, count in provider_summary["breakdown"].items()
                    },
                })
            providers.sort(key=lambda item: item["total"], reverse=True)
            network_signal_summary.append({
                "network_type": summary["network_type"],
                "total": network_total,
                "avg_signal": round(summary["signal_sum"] / network_total, 1),
                "quality": quality.upper(),
                "breakdown": summary["breakdown"],
                "breakdown_pct": {
                    label: round((count / network_total) * 100, 1)
                    for label, count in summary["breakdown"].items()
                },
                "providers": providers,
            })
        network_signal_summary.sort(key=lambda item: item["total"], reverse=True)

        # ML prediction
        hour = datetime.now().hour
        predictor = DeadZonePredictor.get()
        ml_result = predictor.predict(
            lat=lat, lng=lng,
            network_type=dominant_network,
            downlink=downlink,
            rtt=rtt,
            hour=hour,
            avg_signal=avg_signal_value,
            bad_reading_ratio=bad_reading_ratio_value,
            sample_size=sample_size
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
            "network_signal_summary": network_signal_summary,
            "operator_counts": operator_counts,
            "ml_prediction": ml_result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
