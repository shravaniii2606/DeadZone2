from fastapi import APIRouter, HTTPException
from app.models.schemas import SignalReading
from app.db.supabase import supabase

router = APIRouter()

@router.post("/readings")
async def submit_reading(reading: SignalReading):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured. Copy backend/.env.example to backend/.env and set SUPABASE_URL and SUPABASE_KEY")

    try:
        data = {
            "latitude": reading.latitude,
            "longitude": reading.longitude,
            "signal_strength": reading.signal_strength,
            "network_type": reading.network_type,
            "operator_name": reading.operator,
        }
        result = supabase.table("signal_readings").insert(data).execute()
        return {"success": True, "data": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap")
async def get_heatmap(limit: int = 10000):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured. Copy backend/.env.example to backend/.env and set SUPABASE_URL and SUPABASE_KEY")

    try:
        result = (
            supabase.table("signal_readings")
            .select("reading_id, latitude, longitude, signal_strength, network_type, operator_name, timestamp")
            .order("timestamp", desc=True)
            .limit(limit)
            .execute()
        )
        # Normalize keys so frontend gets what it expects
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
        return {"success": True, "count": len(normalized), "data": normalized}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))