from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.api import readings, area_report, route
from app.ml.predictor import DeadZonePredictor
from app.db.supabase import supabase

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="DeadZone API",
    description="Crowdsourced Telecom Signal Mapping Platform",
    version="2.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(readings.router, prefix="/api", tags=["Readings"])
app.include_router(area_report.router, prefix="/api", tags=["Area Report"])
app.include_router(route.router, prefix="/api", tags=["Route"])

@app.get("/health")
async def health():
    try:
        predictor = DeadZonePredictor.get()
        db_status = "connected" if supabase else "disconnected"
        return {
            "status": "ok",
            "model": "XGBoost-v1",
            "trained_on": predictor.total_trained_on,
            "accuracy": predictor.metrics.get("accuracy"),
            "db": db_status,
            "version": "2.0.0"
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.get("/")
@limiter.limit("60/minute")
async def root(request: Request):
    return {"status": "DeadZone API is live"}