"""
services/document_intelligence.py
Wraps Azure Document Intelligence to extract structured text from
PDF and DOCX uploads.  Falls back to pure-Python extraction when
Azure credentials are not configured (offline / demo mode).
"""

from __future__ import annotations
import io
import logging
from pathlib import Path

import fitz                     # PyMuPDF  – fallback PDF
from docx import Document       # python-docx – fallback DOCX

from app.config import settings

logger = logging.getLogger(__name__)


# ── Azure client (lazy-init so import never crashes) ──────────────────────

_azure_client = None

def _get_azure_client():
    global _azure_client
    if _azure_client is not None:
        return _azure_client
    if not (settings.azure_docintel_endpoint and settings.azure_docintel_api_key):
        return None
    try:
        from azure.ai.documentintelligence import DocumentIntelligenceClient
        from azure.core.credentials import AzureKeyCredential
        _azure_client = DocumentIntelligenceClient(
            endpoint=settings.azure_docintel_endpoint,
            credential=AzureKeyCredential(settings.azure_docintel_api_key),
        )
        logger.info("Azure Document Intelligence client initialised.")
        return _azure_client
    except Exception as exc:
        logger.warning("Could not initialise Azure Doc Intelligence: %s", exc)
        return None


# ── Main extraction entry-point ────────────────────────────────────────────

async def extract_text_from_file(file_path: Path) -> tuple[str, int]:
    """
    Extract full text from a PDF or DOCX file.

    Returns
    -------
    (text, page_count)
    """
    suffix = file_path.suffix.lower()
    client = _get_azure_client()

    if client and suffix in (".pdf", ".docx"):
        try:
            return await _extract_via_azure(client, file_path)
        except Exception as exc:
            logger.warning("Azure extraction failed, falling back: %s", exc)

    # ── Fallback ──────────────────────────────────────────────────────────
    if suffix == ".pdf":
        return _extract_pdf_local(file_path)
    elif suffix == ".docx":
        return _extract_docx_local(file_path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


async def _extract_via_azure(client, file_path: Path) -> tuple[str, int]:
    """Use Azure Document Intelligence 'prebuilt-read' model."""
    import asyncio

    file_bytes = file_path.read_bytes()

    # Azure SDK is sync; run in thread pool so we don't block the event loop
    def _sync_analyse():
        from azure.ai.documentintelligence.models import AnalyzeDocumentRequest
        poller = client.begin_analyze_document(
            "prebuilt-read",
            AnalyzeDocumentRequest(bytes_source=file_bytes),
        )
        return poller.result()

    result = await asyncio.get_event_loop().run_in_executor(None, _sync_analyse)

    pages = result.pages or []
    page_count = len(pages)

    # Build clean text preserving paragraph flow
    paragraphs = []
    for para in result.paragraphs or []:
        text = para.content.strip()
        if text:
            paragraphs.append(text)

    full_text = "\n\n".join(paragraphs)
    logger.info("Azure extracted %d pages, %d chars", page_count, len(full_text))
    return full_text, page_count


def _extract_pdf_local(file_path: Path) -> tuple[str, int]:
    """Pure-Python PDF extraction via PyMuPDF."""
    doc = fitz.open(str(file_path))
    pages_text = []
    for page in doc:
        pages_text.append(page.get_text("text"))
    doc.close()
    return "\n\n".join(pages_text), len(pages_text)


def _extract_docx_local(file_path: Path) -> tuple[str, int]:
    """Pure-Python DOCX extraction via python-docx."""
    doc = Document(str(file_path))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    # Treat every 30 paragraphs as roughly 1 page
    estimated_pages = max(1, len(paragraphs) // 30)
    return "\n\n".join(paragraphs), estimated_pages
