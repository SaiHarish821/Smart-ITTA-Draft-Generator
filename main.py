"""
main.py – FastAPI application entry point.
Registers routers, mounts static files, serves the SPA index.
"""

from __future__ import annotations
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.documents import router as doc_router
from app.api.itta import router as itta_router
from app.config import settings

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Smart ITTA Draft Generator",
    description="AI-powered Initial Tower Technical Assessment generator using Azure AI Foundry.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routers ────────────────────────────────────────────────────────────
app.include_router(doc_router)
app.include_router(itta_router)

# ── Static files ───────────────────────────────────────────────────────────
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# ── Health check ───────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "azure_configured": settings.azure_configured,
        "version": "1.0.0",
    }


# ── Serve SPA ──────────────────────────────────────────────────────────────
@app.get("/")
@app.get("/{full_path:path}")
async def serve_spa(full_path: str = ""):
    index_path = static_dir / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse({"error": "Frontend not found. Place index.html in static/"}, status_code=404)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=True,
    )
