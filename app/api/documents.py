"""
api/documents.py
Endpoints for uploading, listing, and deleting historical ITTA documents.
"""

from __future__ import annotations
import logging
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks

from app.config import settings
from app.models import (
    DocumentRecord, DocumentStatus,
    UploadResponse, DocumentListResponse,
)
from app.services import storage, vector_store
from app.services.document_intelligence import extract_text_from_file

router = APIRouter(prefix="/api/documents", tags=["Documents"])
logger = logging.getLogger(__name__)

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc"}


# ── Upload ─────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    # Validate extension
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type '{suffix}' not supported. Use PDF or DOCX.")

    # Validate size
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > settings.max_upload_bytes:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB limit.")

    doc_id = str(uuid.uuid4())
    safe_name = f"{doc_id}{suffix}"
    dest_path = settings.upload_dir / safe_name

    # Save to disk
    with dest_path.open("wb") as fout:
        shutil.copyfileobj(file.file, fout)

    # Create initial record
    record = DocumentRecord(
        id=doc_id,
        filename=safe_name,
        original_name=file.filename,
        status=DocumentStatus.PROCESSING,
    )
    storage.save_document(record)

    # Process in background so the response returns immediately
    background_tasks.add_task(_process_document, doc_id, dest_path)

    return UploadResponse(
        doc_id=doc_id,
        filename=file.filename,
        status=DocumentStatus.PROCESSING,
        message="Document received and is being processed.",
    )


async def _process_document(doc_id: str, file_path: Path):
    """Background task: extract text → embed → index."""
    record = storage.get_document(doc_id)
    if not record:
        return
    try:
        text, page_count = await extract_text_from_file(file_path)
        chunk_count = await vector_store.index_document(doc_id, text)
        towers = vector_store._detect_towers(text)

        record.status = DocumentStatus.READY
        record.page_count = page_count
        record.chunk_count = chunk_count
        record.towers_detected = towers
        storage.save_document(record)
        logger.info("Processed doc %s: %d pages, %d chunks", doc_id, page_count, chunk_count)
    except Exception as exc:
        logger.exception("Failed to process doc %s", doc_id)
        record.status = DocumentStatus.FAILED
        record.error = str(exc)
        storage.save_document(record)


# ── List ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=DocumentListResponse)
async def list_documents():
    docs = storage.list_documents()
    return DocumentListResponse(documents=docs, total=len(docs))


# ── Status ─────────────────────────────────────────────────────────────────

@router.get("/{doc_id}", response_model=DocumentRecord)
async def get_document(doc_id: str):
    doc = storage.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found.")
    return doc


# ── Delete ─────────────────────────────────────────────────────────────────

@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    doc = storage.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found.")

    # Remove file
    file_path = settings.upload_dir / doc.filename
    if file_path.exists():
        file_path.unlink()

    # Remove from FAISS
    await vector_store.delete_document(doc_id)

    # Remove record
    storage.delete_document_record(doc_id)
    return {"message": f"Document '{doc.original_name}' deleted."}


# ── Index stats ────────────────────────────────────────────────────────────

@router.get("/stats/index")
async def index_stats():
    return vector_store.index_stats()
