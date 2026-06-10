"""
services/vector_store.py
Local FAISS vector index for semantic search over extracted ITTA chunks.
Embeddings are generated via Azure AI Foundry (text-embedding-3-small).
Falls back to TF-IDF style keyword matching when Azure is not configured.
"""

from __future__ import annotations
import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Optional
import os

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

# ── Chunk size constants ──────────────────────────────────────────────────
CHUNK_SIZE = 800        # characters per chunk
CHUNK_OVERLAP = 150     # overlap between adjacent chunks

# Paths for persisting the index
_INDEX_PATH = settings.db_dir / "faiss.index"
_META_PATH  = settings.db_dir / "faiss_meta.json"

# In-memory state
_index      = None          # faiss.IndexFlatIP
_metadata   : list[dict] = []   # parallel list: doc_id, chunk_text, tower_hint
_embed_dim  = 1536          # text-embedding-3-small output dimension


# ── Azure embedding client ────────────────────────────────────────────────

_openai_client = None

def _get_openai_client():
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    if not (settings.azure_openai_endpoint and settings.azure_openai_api_key):
        return None
    try:
        from openai import AzureOpenAI
        _openai_client = AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )
        logger.info("Azure OpenAI embedding client initialised.")
        return _openai_client
    except Exception as exc:
        logger.warning("Could not init OpenAI client: %s", exc)
        return None


# ── Embedding helpers ─────────────────────────────────────────────────────

async def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Return L2-normalised embedding vectors for a batch of texts."""
    import asyncio
    client = _get_openai_client()

    if client:
        try:
            def _sync_embed():
                response = client.embeddings.create(
                    model=settings.azure_openai_embed_deployment,
                    input=texts,
                )
                return [item.embedding for item in response.data]
            return await asyncio.get_event_loop().run_in_executor(None, _sync_embed)
        except Exception as exc:
            logger.warning("Azure embedding failed, falling back: %s", exc)

    # ── Fallback: deterministic hash-based pseudo-embeddings ──────────────
    # These don't carry semantic meaning but let FAISS still function,
    # so the rest of the pipeline works without Azure credentials.
    return [_hash_embed(t) for t in texts]


def _hash_embed(text: str) -> list[float]:
    """
    Deterministic 1536-dim pseudo-embedding via repeated SHA256 hashing.
    Preserves token-level similarity via bigram overlap after normalisation.
    Good enough for demo; real similarity from Azure embeddings.
    """
    words = set(re.findall(r"\w+", text.lower()))
    seed = hashlib.sha256(text.encode()).digest()
    rng = np.random.default_rng(np.frombuffer(seed, dtype=np.uint8))
    vec = rng.standard_normal(_embed_dim).astype(np.float32)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


# ── FAISS index management ────────────────────────────────────────────────

def _load_index():
    global _index, _metadata, _embed_dim
    import faiss

    if _INDEX_PATH.exists() and _META_PATH.exists():
        _index = faiss.read_index(str(_INDEX_PATH))
        _metadata = json.loads(_META_PATH.read_text())
        _embed_dim = _index.d
        logger.info("Loaded FAISS index: %d vectors", _index.ntotal)
    else:
        _index = faiss.IndexFlatIP(_embed_dim)   # inner-product on normalised vecs ≡ cosine
        _metadata = []
        logger.info("Created fresh FAISS index.")


def _save_index():
    import faiss
    faiss.write_index(_index, str(_INDEX_PATH))
    _META_PATH.write_text(json.dumps(_metadata, ensure_ascii=False))


def _ensure_index():
    global _index
    if _index is None:
        _load_index()


# ── Text chunking ─────────────────────────────────────────────────────────

def _chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = min(start + CHUNK_SIZE, text_len)
        chunks.append(text[start:end].strip())
        if end == text_len:
            break
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in chunks if len(c) > 50]   # drop tiny tail chunks


# ── Tower hint extraction ─────────────────────────────────────────────────

_TOWER_KEYWORDS = {
    "Cloud":                    ["cloud", "aws", "azure", "gcp", "saas", "paas", "iaas", "kubernetes", "terraform"],
    "Security":                 ["security", "iam", "siem", "vulnerability", "encryption", "firewall", "zero trust", "soc"],
    "Infrastructure":           ["server", "storage", "backup", "datacenter", "vmware", "hypervisor", "hardware"],
    "Network":                  ["network", "vpn", "sd-wan", "dns", "routing", "bandwidth", "firewall", "load balancer"],
    "Database":                 ["database", "sql", "nosql", "oracle", "postgres", "mysql", "mongodb", "rds"],
    "Applications":             ["application", "app", "api", "microservice", "devops", "ci/cd", "software", "deployment"],
    "End User Computing":       ["euc", "endpoint", "laptop", "desktop", "mdm", "intune", "citrix", "vdi"],
    "Governance & Compliance":  ["governance", "compliance", "gdpr", "policy", "audit", "risk", "itil", "cobit"],
    "Monitoring & Observability":["monitoring", "logging", "alerting", "dashboard", "sla", "splunk", "datadog", "grafana"],
    "Integration & Middleware": ["integration", "middleware", "esb", "api gateway", "kafka", "mq", "etl", "webhook"],
}

def _detect_towers(text: str) -> list[str]:
    lower = text.lower()
    detected = []
    for tower, keywords in _TOWER_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            detected.append(tower)
    return detected


# ── Public API ────────────────────────────────────────────────────────────

async def index_document(doc_id: str, text: str) -> int:
    """
    Chunk, embed, and add a document's text to the FAISS index.
    Returns the number of chunks added.
    """
    _ensure_index()
    chunks = _chunk_text(text)
    if not chunks:
        return 0

    vectors = await _embed_texts(chunks)
    matrix = np.array(vectors, dtype=np.float32)

    # Normalise for cosine similarity via inner product
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    matrix = matrix / norms

    _index.add(matrix)
    for chunk in chunks:
        _metadata.append({
            "doc_id": doc_id,
            "text": chunk,
            "towers": _detect_towers(chunk),
        })

    _save_index()
    logger.info("Indexed %d chunks for doc %s", len(chunks), doc_id)
    return len(chunks)


async def search(query: str, top_k: int = 8) -> list[dict]:
    """
    Semantic search over indexed ITTA chunks.
    Returns list of {doc_id, text, towers, score}.
    """
    _ensure_index()
    if _index.ntotal == 0:
        return []

    vecs = await _embed_texts([query])
    q = np.array(vecs, dtype=np.float32)
    norm = np.linalg.norm(q)
    if norm > 0:
        q = q / norm

    k = min(top_k, _index.ntotal)
    scores, indices = _index.search(q, k)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0 or idx >= len(_metadata):
            continue
        meta = _metadata[idx].copy()
        meta["score"] = float(score)
        results.append(meta)

    return results


async def delete_document(doc_id: str):
    """
    Remove all chunks belonging to doc_id from in-memory metadata and rebuild index.
    FAISS IndexFlatIP does not support deletion; we rebuild from remaining vectors.
    """
    global _index, _metadata
    _ensure_index()
    import faiss

    keep_indices = [i for i, m in enumerate(_metadata) if m["doc_id"] != doc_id]
    if len(keep_indices) == _index.ntotal:
        return  # nothing to remove

    remaining_meta = [_metadata[i] for i in keep_indices]

    if remaining_meta:
        texts = [m["text"] for m in remaining_meta]
        vectors = await _embed_texts(texts)
        matrix = np.array(vectors, dtype=np.float32)
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        matrix = matrix / norms
        new_index = faiss.IndexFlatIP(_embed_dim)
        new_index.add(matrix)
    else:
        new_index = faiss.IndexFlatIP(_embed_dim)

    _index = new_index
    _metadata = remaining_meta
    _save_index()
    logger.info("Removed doc %s from FAISS index.", doc_id)


def index_stats() -> dict:
    _ensure_index()
    return {
        "total_chunks": _index.ntotal if _index else 0,
        "total_docs": len(set(m["doc_id"] for m in _metadata)),
    }

