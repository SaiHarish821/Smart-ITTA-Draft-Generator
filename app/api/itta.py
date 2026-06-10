"""
api/itta.py
Endpoints for generating ITTA drafts and managing history.

New endpoints added:
  PATCH /api/itta/{draft_id}/edit          – Feature 1: EA inline editing
  POST  /api/itta/{draft_id}/approve       – Feature 2: Approve draft
  POST  /api/itta/{draft_id}/request-changes – Feature 2: Request changes
  GET   /api/itta/{draft_id}/citations     – Feature 3: Get citation data
"""

from __future__ import annotations
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.models import (
    GenerateRequest, GenerateResponse,
    HistoryListResponse, ITTADraft,
    EditDraftRequest, ApproveRequest, RequestChangesRequest,
    ReviewStatus, DraftVersionEntry,
)
from app.services import storage
from app.services.itta_generator import generate_itta

router = APIRouter(prefix="/api/itta", tags=["ITTA"])
logger = logging.getLogger(__name__)


# ── Generate ───────────────────────────────────────────────────────────────

@router.post("/generate", response_model=GenerateResponse)
async def generate_itta_draft(request: GenerateRequest):
    """
    Generate a full ITTA draft for a given business/technical demand.
    Uses historical ITTA knowledge from the vector store when available;
    falls back to enterprise best-practice mode otherwise.
    """
    try:
        draft = await generate_itta(request)
        storage.save_draft(draft)
        return GenerateResponse(draft_id=draft.id, itta=draft)
    except Exception as exc:
        logger.exception("ITTA generation failed")
        raise HTTPException(500, f"Generation failed: {exc}") from exc


# ── Get single draft ───────────────────────────────────────────────────────

@router.get("/{draft_id}", response_model=ITTADraft)
async def get_draft(draft_id: str):
    draft = storage.get_draft(draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found.")
    return draft


# ── History ────────────────────────────────────────────────────────────────

@router.get("/", response_model=HistoryListResponse)
async def list_drafts():
    drafts = storage.list_drafts()
    return HistoryListResponse(drafts=drafts, total=len(drafts))


# ── Delete ─────────────────────────────────────────────────────────────────

@router.delete("/{draft_id}")
async def delete_draft(draft_id: str):
    draft = storage.get_draft(draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found.")
    storage.delete_draft(draft_id)
    return {"message": "Draft deleted."}


# ── Feature 1: Inline Edit ─────────────────────────────────────────────────

@router.patch("/{draft_id}/edit", response_model=ITTADraft)
async def edit_draft(draft_id: str, request: EditDraftRequest):
    """
    Save EA inline edits to a generated draft.
    - Updates only the fields provided in the request.
    - Appends a version history entry with the "edited" snapshot.
    - Blocked if the draft is locked (approved status).
    """
    draft = storage.get_draft(draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found.")
    if draft.is_locked:
        raise HTTPException(403, "Draft is locked after approval. No further edits allowed.")

    # Snapshot current values before overwriting (only on first edit)
    needs_snapshot = not any(v.version == "edited" for v in draft.version_history)

    # Apply top-level field edits
    if request.executive_summary is not None:
        draft.executive_summary = request.executive_summary
    if request.scope_statement is not None:
        draft.scope_statement = request.scope_statement
    if request.overall_risk is not None:
        draft.overall_risk = request.overall_risk
    if request.timeline_overview is not None:
        draft.timeline_overview = request.timeline_overview
    if request.next_steps is not None:
        draft.next_steps = request.next_steps

    # Apply tower-level edits
    if request.tower_edits:
        for tower_assessment in draft.towers:
            tower_key = tower_assessment.tower.value
            if tower_key in request.tower_edits:
                edits = request.tower_edits[tower_key]
                if "summary" in edits:
                    tower_assessment.summary = edits["summary"]
                if "current_state" in edits:
                    tower_assessment.current_state = edits["current_state"]
                if "gap_analysis" in edits:
                    tower_assessment.gap_analysis = edits["gap_analysis"]
                if "recommendations" in edits:
                    tower_assessment.recommendations = edits["recommendations"]
                if "risks" in edits:
                    tower_assessment.risks = edits["risks"]
                if "effort_estimate" in edits:
                    tower_assessment.effort_estimate = edits["effort_estimate"]

    # Update metadata
    draft.last_modified_at = datetime.utcnow()
    draft.last_modified_by = request.modified_by or "EA"
    draft.review_status = ReviewStatus.UNDER_REVIEW

    # Append version history entry
    draft.version_history.append(DraftVersionEntry(
        version="edited",
        modified_by=request.modified_by or "EA",
        snapshot={
            "executive_summary": draft.executive_summary,
            "scope_statement": draft.scope_statement,
            "overall_risk": draft.overall_risk,
            "timeline_overview": draft.timeline_overview,
            "next_steps": draft.next_steps,
        },
    ))

    storage.save_draft(draft)
    logger.info("Draft %s edited by %s", draft_id, request.modified_by)
    return draft


# ── Feature 2: Approve ────────────────────────────────────────────────────

@router.post("/{draft_id}/approve", response_model=ITTADraft)
async def approve_draft(draft_id: str, request: ApproveRequest):
    """
    Approve a draft. Sets status to Approved, locks editing, records approver.
    """
    draft = storage.get_draft(draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found.")

    draft.review_status = ReviewStatus.APPROVED
    draft.is_locked = True
    draft.approved_at = datetime.utcnow()
    draft.approved_by = request.approved_by or "EA"
    draft.last_modified_at = datetime.utcnow()
    draft.review_comment = None  # Clear any previous request-changes comment

    storage.save_draft(draft)
    logger.info("Draft %s approved by %s", draft_id, draft.approved_by)
    return draft


# ── Feature 2: Request Changes ─────────────────────────────────────────────

@router.post("/{draft_id}/request-changes", response_model=ITTADraft)
async def request_changes(draft_id: str, request: RequestChangesRequest):
    """
    Return a draft to editable mode with a review comment.
    """
    draft = storage.get_draft(draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found.")

    draft.review_status = ReviewStatus.CHANGES_REQUESTED
    draft.is_locked = False
    draft.review_comment = request.comment
    draft.last_modified_at = datetime.utcnow()
    draft.approved_at = None
    draft.approved_by = None

    storage.save_draft(draft)
    logger.info("Draft %s returned for changes. Comment: %s", draft_id, request.comment)
    return draft


# ── Feature 3: Get Citations ───────────────────────────────────────────────

@router.get("/{draft_id}/citations")
async def get_citations(draft_id: str):
    """
    Return structured citation data for a draft's recommendations.
    Reuses the citation data already stored on the draft at generation time.
    """
    draft = storage.get_draft(draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found.")

    return {
        "draft_id": draft_id,
        "total": len(draft.citations),
        "citations": [c.model_dump() for c in draft.citations],
        "generation_mode": draft.generation_mode,
    }
