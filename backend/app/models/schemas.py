from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SignalReading(BaseModel):
    latitude: float
    longitude: float
    signal_strength: int
    network_type: Optional[str] = "unknown"
    operator: Optional[str] = "unknown"
    device_type: Optional[str] = "unknown"
    gps_accuracy: Optional[float] = None
    download_speed: Optional[float] = None
    upload_speed: Optional[float] = None
    latency: Optional[int] = None

class SignalReadingResponse(BaseModel):
    id: str
    latitude: float
    longitude: float
    signal_strength: int
    network_type: Optional[str]
    operator: Optional[str]
    created_at: datetime