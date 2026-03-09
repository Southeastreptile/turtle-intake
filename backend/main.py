"""
SERC Wildlife Intake — FastAPI back-end entry point.
"""

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.intake import router as intake_router

# Load .env before anything else
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SERC Wildlife Intake API",
    description="Back-end for the Southeastern Reptile Conservation volunteer intake app.",
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Allow the React dev server and the deployed front-end origin
_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(intake_router)


@app.get("/health")
async def health() -> dict:
    """Simple health-check endpoint."""
    return {"status": "ok", "service": "SERC Wildlife Intake API"}
