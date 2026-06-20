from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import readings, area_report, route

app = FastAPI(
    title="DeadZone API",
    description="Crowdsourced Telecom Signal Mapping Platform",
    version="1.0.0"
)

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

@app.get("/")
def root():
    return {"status": "DeadZone API is live"}