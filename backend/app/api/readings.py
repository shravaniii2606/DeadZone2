from fastapi import APIRouter, HTTPException
from app.models.schemas import SignalReading
from app.db.supabase import supabase
from app.ml.predictor import DeadZonePredictor

router = APIRouter()

@router.post("/readings")
async def submit_reading(reading: SignalReading):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured.")

    try:
        data = {
            "latitude": reading.latitude,
            "longitude": reading.longitude,
            "signal_strength": reading.signal_strength,
            "network_type": reading.network_type,
            "operator_name": reading.operator,
        }
        result = supabase.table("signal_readings").insert(data).execute()

        # Incremental learning — model learns from every new reading
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
            pass  # never block a reading for ML

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

        # Include model stats in response
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
            "status": "active"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))