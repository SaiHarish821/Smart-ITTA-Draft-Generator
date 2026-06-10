# Smart ITTA Draft Generator

AI-powered Initial Tower Technical Assessment generator using **Azure AI Foundry**, **Azure Document Intelligence**, and **FAISS** vector search.

---

## Architecture

```
smart-itta/
├── main.py                          # FastAPI app entry point
├── requirements.txt
├── .env.example                     # Copy to .env and fill credentials
├── app/
│   ├── config.py                    # Settings (pydantic-settings)
│   ├── models.py                    # All Pydantic data models
│   ├── api/
│   │   ├── documents.py             # Upload / list / delete documents
│   │   └── itta.py                  # Generate / view / history drafts
│   └── services/
│       ├── document_intelligence.py # Azure Doc Intelligence + PyMuPDF fallback
│       ├── vector_store.py          # FAISS index + Azure OpenAI embeddings
│       ├── itta_generator.py        # Core AI generation logic
│       └── storage.py               # Local JSON file persistence
├── static/
│   ├── index.html                   # SPA shell
│   ├── css/styles.css               # Full UI styles
│   └── js/app.js                    # Vanilla JS SPA
├── uploads/                         # Uploaded ITTA files (auto-created)
└── db/                              # FAISS index + JSON store (auto-created)
```

---

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your Azure credentials
```

### 3. Run
```bash
python main.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Open browser
```
http://localhost:8000
```

---

## Azure Setup

### Azure AI Foundry
1. Go to [Azure AI Foundry](https://ai.azure.com)
2. Create a project and deploy:
   - **Chat model**: `gpt-4o` (deployment name)
   - **Embedding model**: `text-embedding-3-small`
3. Copy the endpoint and API key to `.env`

### Azure Document Intelligence
1. Create an Azure Document Intelligence resource
2. Copy the endpoint and key to `.env`

---

## Works Without Azure

The system runs fully in **offline / best-practice mode** when Azure credentials are not configured:
- Document text extraction falls back to **PyMuPDF** (PDF) and **python-docx** (DOCX)
- Embeddings fall back to deterministic hash-based pseudo-vectors
- ITTA generation uses built-in enterprise knowledge templates
- All features remain functional — just without AI-enhanced recommendations

---

## Generation Modes

| Mode | When Used | Quality |
|------|-----------|---------|
| `best_practice` | No historical ITTAs uploaded | Enterprise framework-based |
| `historical` | Historical ITTAs indexed | Grounded in real patterns |
| `hybrid` | Partial historical coverage | Mix of both |

---

## API Reference

```
GET  /api/health               System health + Azure status
POST /api/documents/upload     Upload PDF/DOCX historical ITTA
GET  /api/documents/           List all documents
GET  /api/documents/{id}       Document status
DEL  /api/documents/{id}       Delete document + remove from index
GET  /api/documents/stats/index FAISS index stats

POST /api/itta/generate        Generate new ITTA draft
GET  /api/itta/                List all drafts
GET  /api/itta/{id}            Get specific draft
DEL  /api/itta/{id}            Delete draft

Swagger UI: http://localhost:8000/api/docs
```

---

## IT Towers Covered

Cloud · Security · Infrastructure · Network · Database · Applications · End User Computing · Governance & Compliance · Monitoring & Observability · Integration & Middleware

---

## Local Storage

All data is stored locally:
- `db/documents.json` — document metadata
- `db/drafts.json` — generated ITTA drafts
- `db/faiss.index` — FAISS vector index
- `db/faiss_meta.json` — chunk metadata
- `uploads/` — uploaded files
