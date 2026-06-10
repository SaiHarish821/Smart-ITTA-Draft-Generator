"""
models.py – All Pydantic data models used across the application.
"""

from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────

class ReviewStatus(str, Enum):
    GENERATED = "generated"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"


class ITTower(str, Enum):
    CLOUD = "Cloud"
    SECURITY = "Security"
    INFRASTRUCTURE = "Infrastructure"
    NETWORK = "Network"
    DATABASE = "Database"
    APPLICATIONS = "Applications"
    EUC = "End User Computing"
    GOVERNANCE = "Governance & Compliance"
    MONITORING = "Monitoring & Observability"
    INTEGRATION = "Integration & Middleware"


class DocumentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


# ── Stored document record ─────────────────────────────────────────────────

class DocumentRecord(BaseModel):
    id: str
    filename: str
    original_name: str
    status: DocumentStatus = DocumentStatus.PENDING
    page_count: int = 0
    chunk_count: int = 0
    towers_detected: list[str] = Field(default_factory=list)
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    error: Optional[str] = None


# ── Tower assessment section ───────────────────────────────────────────────

class TowerAssessment(BaseModel):
    tower: ITTower
    impact_level: str          # High / Medium / Low / None
    summary: str               # 2-3 sentence executive summary
    current_state: str         # What exists today
    gap_analysis: str          # Delta between current and required
    recommendations: list[str] # Concrete action items
    risks: list[str]           # Key risks if not addressed
    effort_estimate: str       # e.g. "3-6 months, 2 FTE"
    dependencies: list[str]    # Dependencies on other towers
    source_references: list[str]  # Which ITTA docs or best-practices informed this


class TraceabilityEntry(BaseModel):
    tower: str
    signal: str          # What in the demand triggered this tower
    source_type: str     # "historical_itta" | "best_practice" | "hybrid"
    confidence: float    # 0.0 – 1.0
    evidence_snippets: list[str]  # Verbatim excerpts or best-practice citations


# ── Citation entry – maps a draft section to a source document ─────────────

class CitationEntry(BaseModel):
    tower: str                     # Which tower this citation belongs to
    section: str                   # e.g. "recommendations", "risks", "summary"
    doc_id: str                    # Source document ID
    doc_name: str                  # Human-readable document name (filename)
    tower_source: str              # Source tower section in the historical doc
    similarity_score: float        # 0.0 – 1.0 cosine similarity
    retrieved_chunk: str           # The actual text chunk that was used


# ── Version history entry ─────────────────────────────────────────────────

class DraftVersionEntry(BaseModel):
    version: str                   # "generated" | "edited"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    modified_by: str = "EA"
    snapshot: Optional[dict] = None  # Stores field values at time of snapshot


# ── ITTA Draft ─────────────────────────────────────────────────────────────

class ITTADraft(BaseModel):
    id: str
    demand_title: str
    demand_description: str
    executive_summary: str
    scope_statement: str
    towers: list[TowerAssessment]
    traceability: list[TraceabilityEntry]
    overall_risk: str
    timeline_overview: str
    next_steps: list[str]
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    source_doc_ids: list[str] = Field(default_factory=list)
    generation_mode: str = "best_practice"  # "historical" | "best_practice" | "hybrid"

    # ── Feature 1: Editing & version history ──────────────────────────────
    review_status: ReviewStatus = ReviewStatus.GENERATED
    is_locked: bool = False                  # True after approval – no more edits
    last_modified_at: Optional[datetime] = None
    last_modified_by: str = "EA"
    version_history: list[DraftVersionEntry] = Field(default_factory=list)

    # ── Feature 2: Approval workflow ──────────────────────────────────────
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    review_comment: Optional[str] = None    # Comment on request-changes

    # ── Feature 3: Citations ──────────────────────────────────────────────
    citations: list[CitationEntry] = Field(default_factory=list)


# ── API request / response shapes ─────────────────────────────────────────

class GenerateRequest(BaseModel):
    demand_title: str = Field(min_length=5, max_length=200)
    demand_description: str = Field(min_length=20, max_length=5000)
    business_context: Optional[str] = Field(default=None, max_length=2000)
    target_towers: Optional[list[ITTower]] = None   # None = auto-detect


class GenerateResponse(BaseModel):
    draft_id: str
    status: str = "complete"
    itta: ITTADraft


class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    status: DocumentStatus
    message: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentRecord]
    total: int


class HistoryListResponse(BaseModel):
    drafts: list[ITTADraft]
    total: int


# ── Feature 1: Edit request ────────────────────────────────────────────────

class EditDraftRequest(BaseModel):
    """Payload for saving EA inline edits to a draft."""
    executive_summary: Optional[str] = None
    scope_statement: Optional[str] = None
    overall_risk: Optional[str] = None
    timeline_overview: Optional[str] = None
    next_steps: Optional[list[str]] = None
    # Tower-level edits keyed by tower name
    tower_edits: Optional[dict[str, dict]] = None  # {tower_name: {field: value}}
    modified_by: str = "EA"


# ── Feature 2: Review workflow requests ───────────────────────────────────

class ApproveRequest(BaseModel):
    approved_by: str = "EA"


class RequestChangesRequest(BaseModel):
    comment: str = ""
    requested_by: str = "EA"
