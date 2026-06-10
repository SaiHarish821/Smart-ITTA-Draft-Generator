"""
services/storage.py
Simple local-file JSON storage for document records and ITTA drafts.
No external database required – everything persists in the db/ directory.
"""

from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Optional

from app.config import settings
from app.models import DocumentRecord, ITTADraft

logger = logging.getLogger(__name__)

_DOCS_FILE   = settings.db_dir / "documents.json"
_DRAFTS_FILE = settings.db_dir / "drafts.json"


# ── Generic helpers ────────────────────────────────────────────────────────

def _read_store(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Corrupt store %s – resetting. Error: %s", path, exc)
    return {}


def _write_store(path: Path, data: dict):
    path.write_text(json.dumps(data, default=str, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Document records ───────────────────────────────────────────────────────

def save_document(doc: DocumentRecord):
    store = _read_store(_DOCS_FILE)
    store[doc.id] = doc.model_dump(mode="json")
    _write_store(_DOCS_FILE, store)


def get_document(doc_id: str) -> Optional[DocumentRecord]:
    store = _read_store(_DOCS_FILE)
    data = store.get(doc_id)
    return DocumentRecord(**data) if data else None


def list_documents() -> list[DocumentRecord]:
    store = _read_store(_DOCS_FILE)
    docs = [DocumentRecord(**v) for v in store.values()]
    return sorted(docs, key=lambda d: d.uploaded_at, reverse=True)


def delete_document_record(doc_id: str):
    store = _read_store(_DOCS_FILE)
    store.pop(doc_id, None)
    _write_store(_DOCS_FILE, store)


# ── ITTA draft records ─────────────────────────────────────────────────────

def save_draft(draft: ITTADraft):
    store = _read_store(_DRAFTS_FILE)
    store[draft.id] = draft.model_dump(mode="json")
    _write_store(_DRAFTS_FILE, store)


def get_draft(draft_id: str) -> Optional[ITTADraft]:
    store = _read_store(_DRAFTS_FILE)
    data = store.get(draft_id)
    return ITTADraft(**data) if data else None


def list_drafts() -> list[ITTADraft]:
    store = _read_store(_DRAFTS_FILE)
    drafts = [ITTADraft(**v) for v in store.values()]
    return sorted(drafts, key=lambda d: d.generated_at, reverse=True)


def delete_draft(draft_id: str):
    store = _read_store(_DRAFTS_FILE)
    store.pop(draft_id, None)
    _write_store(_DRAFTS_FILE, store)
