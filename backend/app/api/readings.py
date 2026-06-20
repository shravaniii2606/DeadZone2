from fastapi import APIRouter, HTTPException
from app.models.schemas import SignalReading
from app.db.supabase import supabase

router = APIRouter()

@router.post("/readings")
async def submit_reading(reading: SignalReading):
    try:
        data = {
            "latitude": reading.latitude,
            "longitude": reading.longitude,
            "signal_strength": reading.signal_strength,
            "network_type": reading.network_type,
            "operator": reading.operator,
            "device_type": reading.device_type,
            "gps_accuracy": reading.gps_accuracy,
            "download_speed": reading.download_speed,
            "upload_speed": reading.upload_speed,
            "latency": reading.latency,
        }
        result = supabase.table("signal_readings").insert(data).execute()
        return {"success": True, "data": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap")
async def get_heatmap(limit: int = 10000):
    try:
        result = (
            supabase.table("signal_readings")
            .select("id, latitude, longitude, signal_strength, network_type, operator, gps_accuracy, download_speed, latency, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"success": True, "count": len(result.data), "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
