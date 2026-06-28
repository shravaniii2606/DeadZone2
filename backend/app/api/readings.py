from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.models.schemas import SignalReading
from app.db.supabase import supabase
from app.ml.predictor import DeadZonePredictor

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.post("/readings")
@limiter.limit("30/minute")
async def submit_reading(request: Request, reading: SignalReading):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured.")
    try:
        data = {
            "latitude": reading.latitude,
            "longitude": reading.longitude,
            "signal_strength": reading.signal_strength,
            "network_type": (reading.network_type or "unknown").upper(), 
            "operator_name": reading.operator,
        }
        result = supabase.table("signal_readings").insert(data).execute()
        try:
            predictor = DeadZonePredictor.get()
            predictor.learn(
                lat=reading.latitude,
                lng=reading.longitude,
                network_type=reading.network_type or "unknown",
                downlink=getattr(reading, "download_speed", None) or 5.0,
                rtt=getattr(reading, "latency", None) or 50.0,
                is_dead_zone=(reading.signal_strength < -100)
            )
        except Exception:
            pass
        return {"success": True, "data": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap")
async def get_heatmap(limit: int = 10000):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured.")
    try:
        result = (
            supabase.table("signal_readings")
            .select("reading_id, latitude, longitude, signal_strength, network_type, operator_name, timestamp")
            .order("timestamp", desc=True)
            .limit(limit)
            .execute()
        )
        normalized = [
            {
                "id": row["reading_id"],
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "signal_strength": row["signal_strength"],
                "network_type": row["network_type"],
                "operator": row["operator_name"],
                "created_at": row["timestamp"],
            }
            for row in result.data
        ]
        try:
            predictor = DeadZonePredictor.get()
            model_info = {
                "model": "XGBoost-v1",
                "trained_on": predictor.total_trained_on,
                "buffer_size": len(predictor._X_buffer)
            }
        except Exception:
            model_info = {}
        return {"success": True, "count": len(normalized), "data": normalized, "model_info": model_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ml/status")
async def ml_status():
    try:
        predictor = DeadZonePredictor.get()
        return {
            "success": True,
            "model": "XGBoost-v1",
            "trained_on": predictor.total_trained_on,
            "buffer_pending": len(predictor._X_buffer),
            "retrains_at": 50,
            "status": "active",
            "metrics": predictor.metrics,
            "feature_importance": predictor.feature_importance,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))