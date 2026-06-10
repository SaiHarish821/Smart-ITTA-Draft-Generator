/**
 * app.js — Smart ITTA Draft Generator
 * Single-page application using Vanilla JS.
 * Manages routing, API calls, and all UI rendering.
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────
const API = {
  health:    '/api/health',
  docs:      '/api/documents/',
  upload:    '/api/documents/upload',
  docStats:  '/api/documents/stats/index',
  generate:  '/api/itta/generate',
  drafts:    '/api/itta/',
  // Feature 1 & 2 & 3 endpoints
  editDraft:        (id) => `/api/itta/${id}/edit`,
  approveDraft:     (id) => `/api/itta/${id}/approve`,
  requestChanges:   (id) => `/api/itta/${id}/request-changes`,
  citations:        (id) => `/api/itta/${id}/citations`,
};

const TOWERS = [
  'Cloud', 'Security', 'Infrastructure', 'Network', 'Database',
  'Applications', 'End User Computing', 'Governance & Compliance',
  'Monitoring & Observability', 'Integration & Middleware',
];

const TOWER_ICONS = {
  'Cloud': '☁️', 'Security': '🔒', 'Infrastructure': '🏗️',
  'Network': '🌐', 'Database': '🗄️', 'Applications': '📦',
  'End User Computing': '💻', 'Governance & Compliance': '📋',
  'Monitoring & Observability': '📊', 'Integration & Middleware': '🔗',
};

// ── State ────────────────────────────────────────────────────────────────
const state = {
  currentPage: 'dashboard',
  documents: [],
  drafts: [],
  currentDraft: null,
  selectedTowers: new Set(),
  azureOnline: false,
  loading: false,
  docCount: 0,
  chunkCount: 0,
  // Feature 1: Edit mode state
  editMode: false,
  pendingEdits: {},       // Tracks unsaved in-memory edits keyed by field
  // Feature 3: Citations cache
  citationsCache: {},     // { draftId: [citations] }
};

// ── Router ───────────────────────────────────────────────────────────────
function navigate(page, data = null) {
  state.currentPage = page;
  if (data) state.currentDraft = data;
  if (page !== 'result') state.editMode = false;  // Reset edit mode on nav

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Show Review nav item only when a current draft exists
  const reviewNav = document.getElementById('nav-review');
  if (reviewNav) {
    reviewNav.style.display = state.currentDraft ? 'flex' : 'none';
  }

  renderPage(page);
}

// ── API helpers ───────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  try {
    const resp = await fetch(url, options);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return await resp.json();
  } catch (err) {
    if (err.name === 'TypeError') throw new Error('Network error – is the server running?');
    throw err;
  }
}

// ── Toast notifications ───────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Loading overlay ───────────────────────────────────────────────────────
function showLoading(title, sub) {
  document.getElementById('loading-title').textContent = title;
  document.getElementById('loading-sub').textContent = sub;
  document.getElementById('loading-overlay').style.display = 'flex';
  state.loading = true;
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
  state.loading = false;
}

// ── Health check ──────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const data = await apiFetch(API.health);
    state.azureOnline = data.azure_configured;
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-label');
    if (data.azure_configured) {
      dot.className = 'status-dot online';
      label.textContent = 'Azure Connected';
    } else {
      dot.className = 'status-dot offline';
      label.textContent = 'Offline Mode';
    }
  } catch (e) {
    document.getElementById('status-label').textContent = 'Server Error';
  }
}

// ── Load data ─────────────────────────────────────────────────────────────
async function loadDocuments() {
  try {
    const data = await apiFetch(API.docs);
    state.documents = data.documents || [];
    state.docCount = data.total || 0;
    const stats = await apiFetch(API.docStats).catch(() => ({ total_chunks: 0 }));
    state.chunkCount = stats.total_chunks || 0;
    updateNavBadge('documents', state.docCount);
  } catch (e) { /* silently fail */ }
}

async function loadDrafts() {
  try {
    const data = await apiFetch(API.drafts);
    state.drafts = data.drafts || [];
    updateNavBadge('history', data.total || 0);
  } catch (e) { /* silently fail */ }
}

function updateNavBadge(page, count) {
  const item = document.querySelector(`[data-page="${page}"] .nav-badge`);
  if (item) item.textContent = count;
}

// ── Page: Dashboard ───────────────────────────────────────────────────────
function renderDashboard() {
  const readyDocs = state.documents.filter(d => d.status === 'ready').length;
  return `
    <div class="page-header fade-in">
      <div>
        <div class="page-title">ITTA <span>Command Centre</span></div>
        <div class="page-subtitle">AI-powered Initial Tower Technical Assessment generator</div>
      </div>
      <button class="btn btn-primary btn-lg" onclick="navigate('generate')">
        ⚡ New ITTA Draft
      </button>
    </div>

    <div class="stats-grid fade-in">
      <div class="stat-card">
        <div class="stat-value">${state.docCount}</div>
        <div class="stat-label">Historical ITTAs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${readyDocs}</div>
        <div class="stat-label">Indexed Documents</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.chunkCount}</div>
        <div class="stat-label">Knowledge Chunks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.drafts.length}</div>
        <div class="stat-label">Drafts Generated</div>
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-header">
        <div class="card-title">📚 Knowledge Base</div>
        <button class="btn btn-secondary" onclick="navigate('documents')">Manage →</button>
      </div>
      ${state.documents.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <div class="empty-title">No historical ITTAs uploaded</div>
          <div class="empty-sub">Upload PDF/DOCX files to enrich generation with real-world patterns.<br>The system works in best-practice mode without any uploads.</div>
        </div>
      ` : renderDocListCompact(state.documents.slice(0, 5))}
    </div>

    <div class="card fade-in">
      <div class="card-header">
        <div class="card-title">📄 Recent Drafts</div>
        <button class="btn btn-secondary" onclick="navigate('history')">View All →</button>
      </div>
      ${state.drafts.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">⚡</div>
          <div class="empty-title">No drafts yet</div>
          <div class="empty-sub">Generate your first ITTA draft to get started.</div>
        </div>
      ` : renderDraftListCompact(state.drafts.slice(0, 3))}
    </div>
  `;
}

function renderDocListCompact(docs) {
  return `<div class="doc-list">${docs.map(d => `
    <div class="doc-item">
      <div class="doc-icon">${d.original_name.endsWith('.pdf') ? '📕' : '📘'}</div>
      <div class="doc-info">
        <div class="doc-name">${escHtml(d.original_name)}</div>
        <div class="doc-meta">${d.page_count} pages · ${d.chunk_count} chunks</div>
      </div>
      <div class="doc-status ${d.status}">${d.status}</div>
    </div>
  `).join('')}</div>`;
}

function renderDraftListCompact(drafts) {
  return `<div class="doc-list">${drafts.map(d => `
    <div class="doc-item" style="cursor:pointer" onclick="viewDraft('${d.id}')">
      <div class="doc-icon">📋</div>
      <div class="doc-info">
        <div class="doc-name">${escHtml(d.demand_title)}</div>
        <div class="doc-meta">${d.towers.length} towers · ${formatDate(d.generated_at)}</div>
      </div>
      <span class="mode-badge mode-${d.generation_mode}">${d.generation_mode.replace('_', ' ')}</span>
    </div>
  `).join('')}</div>`;
}

// ── Page: Documents ───────────────────────────────────────────────────────
function renderDocuments() {
  return `
    <div class="page-header fade-in">
      <div>
        <div class="page-title">Knowledge <span>Base</span></div>
        <div class="page-subtitle">Upload historical ITTA documents to ground AI generation in real patterns</div>
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-header">
        <div class="card-title">📤 Upload Documents</div>
      </div>
      <div class="upload-zone" id="upload-zone"
           ondragover="handleDragOver(event)"
           ondragleave="handleDragLeave(event)"
           ondrop="handleDrop(event)">
        <input type="file" class="upload-input" id="file-input"
               accept=".pdf,.docx,.doc" multiple
               onchange="handleFileSelect(event)">
        <div class="upload-icon">📎</div>
        <div class="upload-title">Drop files here or click to browse</div>
        <div class="upload-sub">Accepts PDF and DOCX · Max ${50} MB per file</div>
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-header">
        <div class="card-title">📚 Uploaded Documents (${state.documents.length})</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text-muted)">
          ${state.chunkCount} knowledge chunks indexed
        </div>
      </div>
      ${state.documents.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <div class="empty-title">No documents uploaded yet</div>
          <div class="empty-sub">ITTA generation works in enterprise best-practice mode without uploads.</div>
        </div>
      ` : `
        <div class="doc-list" id="doc-list">
          ${state.documents.map(renderDocItem).join('')}
        </div>
      `}
    </div>
  `;
}

function renderDocItem(doc) {
  const icon = doc.original_name.toLowerCase().endsWith('.pdf') ? '📕' : '📘';
  const towers = doc.towers_detected?.length > 0
    ? `<div class="tower-chips">${doc.towers_detected.slice(0, 5).map(t =>
        `<span class="tower-chip">${t}</span>`).join('')}</div>`
    : '';
  return `
    <div class="doc-item" id="doc-${doc.id}">
      <div class="doc-icon">${icon}</div>
      <div class="doc-info">
        <div class="doc-name">${escHtml(doc.original_name)}</div>
        <div class="doc-meta">
          ${doc.page_count} pages · ${doc.chunk_count} chunks · ${formatDate(doc.uploaded_at)}
        </div>
        ${doc.error ? `<div style="color:var(--red);font-size:11px;margin-top:4px">${escHtml(doc.error)}</div>` : ''}
        ${towers}
      </div>
      <div class="doc-status ${doc.status}">${doc.status}</div>
      <button class="btn-icon" onclick="deleteDocument('${doc.id}', '${escHtml(doc.original_name)}')" title="Delete">🗑</button>
    </div>
  `;
}

// ── Page: Generate ────────────────────────────────────────────────────────
function renderGenerate() {
  const towerCheckboxes = TOWERS.map(t => `
    <label class="tower-checkbox ${state.selectedTowers.has(t) ? 'selected' : ''}"
           onclick="toggleTower('${t}', this)">
      <input type="checkbox" value="${t}" ${state.selectedTowers.has(t) ? 'checked' : ''}>
      ${TOWER_ICONS[t] || '🔹'} ${t}
    </label>
  `).join('');

  return `
    <div class="page-header fade-in">
      <div>
        <div class="page-title">Generate <span>ITTA Draft</span></div>
        <div class="page-subtitle">
          ${state.docCount > 0
            ? `Using ${state.docCount} historical ITTAs (${state.chunkCount} chunks) + best practices`
            : 'Running in enterprise best-practice mode (no historical ITTAs uploaded)'}
        </div>
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-header">
        <div class="card-title">📋 Demand Details</div>
      </div>
      <div class="form-section">
        <div class="form-group">
          <label class="form-label">Demand Title *</label>
          <input type="text" class="form-input" id="demand-title"
                 placeholder="e.g. Migrate ERP system to Azure cloud-native architecture"
                 maxlength="200">
        </div>
        <div class="form-group">
          <label class="form-label">Demand Description *</label>
          <textarea class="form-textarea" id="demand-desc" rows="6"
                    placeholder="Describe the business or technical initiative in detail. Include objectives, constraints, expected scale, compliance requirements, and any known technical dependencies..."></textarea>
          <div class="form-hint">Minimum 20 characters. More context → better recommendations.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Business Context <span class="optional">(optional)</span></label>
          <textarea class="form-textarea" id="business-context" rows="3"
                    placeholder="Organisation type, industry, current tech landscape, budget constraints..."></textarea>
        </div>
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-header">
        <div class="card-title">🏗️ Target Towers</div>
        <button class="btn btn-secondary" onclick="clearTowerSelection()">Auto-detect</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
        Leave all unchecked to let AI auto-detect impacted towers from the demand description.
      </p>
      <div class="tower-select-grid" id="tower-grid">
        ${towerCheckboxes}
      </div>
    </div>

    <div style="display:flex;gap:12px;justify-content:flex-end" class="fade-in">
      <button class="btn btn-secondary" onclick="navigate('dashboard')">Cancel</button>
      <button class="btn btn-primary btn-lg" id="generate-btn" onclick="generateITTA()">
        ⚡ Generate ITTA
      </button>
    </div>
  `;
}

function toggleTower(tower, el) {
  if (state.selectedTowers.has(tower)) {
    state.selectedTowers.delete(tower);
    el.classList.remove('selected');
  } else {
    state.selectedTowers.add(tower);
    el.classList.add('selected');
  }
}

function clearTowerSelection() {
  state.selectedTowers.clear();
  document.querySelectorAll('.tower-checkbox').forEach(el => el.classList.remove('selected'));
}

// ── Page: Result ──────────────────────────────────────────────────────────
function renderResult(draft) {
  if (!draft) { navigate('history'); return ''; }
  const modeLabel = { historical: 'Historical ITTA', best_practice: 'Best Practice', hybrid: 'Hybrid' };
  const riskColor = { High: 'red', Medium: 'amber', Low: 'green' };
  const riskKey = draft.overall_risk.split(' ')[0];
  const colorClass = riskColor[riskKey] || 'cyan';

  const reviewStatus = draft.review_status || 'generated';
  const isLocked = draft.is_locked || false;
  const isEditMode = state.editMode;

  // Status banners
  let statusBanner = '';
  if (isLocked) {
    statusBanner = `<div class="locked-banner">
      <span class="lock-icon">🔒</span>
      <div>
        <strong>Draft Approved &amp; Locked</strong> — Approved by <strong>${escHtml(draft.approved_by || 'EA')}</strong>
        ${draft.approved_at ? ` on ${formatDate(draft.approved_at)}` : ''}.
        No further edits are permitted.
      </div>
    </div>`;
  } else if (reviewStatus === 'changes_requested') {
    statusBanner = `<div class="changes-banner">
      <span style="font-size:16px">↩</span>
      <div>
        <strong>Changes Requested</strong> — This draft has been returned for edits.
        ${draft.review_comment ? `<div class="changes-comment">Comment: "${escHtml(draft.review_comment)}"</div>` : ''}
      </div>
    </div>`;
  }

  // Edit toolbar (only if not locked)
  let editToolbar = '';
  if (!isLocked) {
    editToolbar = `
      <div class="edit-toolbar">
        <span class="edit-label">${isEditMode ? '✏️ EDIT MODE' : '📄 VIEW MODE'}</span>
        <span class="edit-hint">${isEditMode ? 'Make changes inline, then click Save Draft Changes.' : 'Toggle edit mode to modify sections of this ITTA draft.'}</span>
        ${isEditMode
          ? `<button class="btn btn-secondary" style="padding:6px 14px;font-size:11px" onclick="cancelEditMode()">✕ Cancel</button>
             <button class="btn btn-primary" style="padding:6px 14px;font-size:11px" onclick="saveDraftChanges('${draft.id}')">💾 Save Draft Changes</button>`
          : `<button class="btn btn-secondary" style="padding:6px 14px;font-size:11px;border-color:rgba(245,158,11,0.4);color:var(--amber)" onclick="enableEditMode()">✏️ Edit Draft</button>`
        }
        <span class="save-indicator" id="save-indicator">✓ Saved</span>
      </div>`;
  }

  return `
    <div class="page-header fade-in">
      <div>
        <div class="page-title">ITTA <span>Draft</span></div>
        <div class="page-subtitle">${escHtml(draft.demand_title)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="review-badge ${reviewStatus}">${reviewStatus.replace('_', ' ')}</span>
        <button class="btn btn-secondary" onclick="navigate('history')">← Back</button>
        ${!isLocked ? `<button class="btn btn-secondary" style="border-color:rgba(139,92,246,0.4);color:var(--purple)" onclick="navigate('review', state.currentDraft)">🔍 Review</button>` : ''}
        <button class="btn btn-primary" onclick="exportDraft('${draft.id}')">⬇ Export</button>
      </div>
    </div>

    ${statusBanner}
    ${editToolbar}

    <div class="result-meta fade-in">
      <div class="meta-item">
        <div class="meta-key">Draft ID</div>
        <div class="meta-val" style="font-family:'IBM Plex Mono',monospace;font-size:11px">${draft.id.slice(0,8)}…</div>
      </div>
      <div class="meta-item">
        <div class="meta-key">Generated</div>
        <div class="meta-val">${formatDate(draft.generated_at)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-key">Towers Assessed</div>
        <div class="meta-val cyan">${draft.towers.length}</div>
      </div>
      <div class="meta-item">
        <div class="meta-key">Overall Risk</div>
        <div class="meta-val ${colorClass}">${escHtml(riskKey)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-key">Generation Mode</div>
        <div class="meta-val"><span class="mode-badge mode-${draft.generation_mode}">${modeLabel[draft.generation_mode] || draft.generation_mode}</span></div>
      </div>
      <div class="meta-item">
        <div class="meta-key">Last Modified</div>
        <div class="meta-val">${draft.last_modified_at ? formatDate(draft.last_modified_at) : '—'}</div>
      </div>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="overview" onclick="switchTab(this)">Overview</div>
      <div class="tab" data-tab="towers" onclick="switchTab(this)">Tower Assessments</div>
      <div class="tab" data-tab="traceability" onclick="switchTab(this)">Traceability</div>
    </div>

    <!-- Overview Tab -->
    <div id="tab-overview" class="tab-content ${isEditMode ? 'edit-mode' : ''} fade-in">
      <div class="exec-box">
        <div class="field-label">Executive Summary</div>
        <div class="field-text-view exec-text">${escHtml(draft.executive_summary)}</div>
        <div class="editable-field field-text-edit">
          <textarea id="edit-executive_summary" rows="5">${escHtml(draft.executive_summary)}</textarea>
          <div class="field-edit-hint">Edit the executive summary directly. Changes save when you click "Save Draft Changes".</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="field-label">Scope Statement</div>
        <div class="field-text-view field-text">${escHtml(draft.scope_statement)}</div>
        <div class="editable-field field-text-edit">
          <textarea id="edit-scope_statement" rows="3">${escHtml(draft.scope_statement)}</textarea>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="field-label">Overall Risk</div>
        <div class="field-text-view field-text"><span class="meta-val ${colorClass}">${escHtml(draft.overall_risk)}</span></div>
        <div class="editable-field field-text-edit">
          <input type="text" id="edit-overall_risk" value="${escHtml(draft.overall_risk)}">
          <div class="field-edit-hint">e.g. "High – legacy dependency risk" or "Medium – mitigated by phased rollout"</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="field-label">Timeline Overview</div>
        <div class="field-text-view field-text">${escHtml(draft.timeline_overview)}</div>
        <div class="editable-field field-text-edit">
          <textarea id="edit-timeline_overview" rows="3">${escHtml(draft.timeline_overview)}</textarea>
        </div>
      </div>
      <div class="card">
        <div class="field-label" style="margin-bottom:12px">Recommended Next Steps</div>
        <div class="field-text-view next-steps">
          ${draft.next_steps.map((s, i) => `
            <div class="next-step">
              <span class="step-num">${String(i + 1).padStart(2, '0')}</span>
              <span>${escHtml(s)}</span>
            </div>
          `).join('')}
        </div>
        <div class="field-text-edit">
          <div id="edit-next_steps-container">
            ${draft.next_steps.map((s, i) => `
              <div class="editable-list-item" id="next-step-item-${i}">
                <textarea oninput="syncNextStep(${i}, this.value)">${escHtml(s)}</textarea>
                <button class="btn-remove-item" onclick="removeNextStep(${i})">✕ Remove</button>
              </div>
            `).join('')}
          </div>
          <button class="btn-add-item" onclick="addNextStep()">+ Add Next Step</button>
        </div>
      </div>
    </div>

    <!-- Towers Tab -->
    <div id="tab-towers" class="tab-content ${isEditMode ? 'edit-mode' : ''}" style="display:none">
      ${draft.towers.map(t => renderTowerSection(t, isEditMode, isLocked)).join('')}
    </div>

    <!-- Traceability Tab -->
    <div id="tab-traceability" class="tab-content" style="display:none">
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div class="card-title">🔬 Explainability &amp; Traceability Sheet</div>
        </div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
          Shows how each tower was identified and what sources informed the recommendations.
        </p>
        <div class="trace-grid">
          ${draft.traceability.map(renderTraceItem).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderTowerSection(tower, isEditMode = false, isLocked = false) {
  const icon = TOWER_ICONS[tower.tower] || '🔹';
  const towerKey = tower.tower.replace(/[^a-zA-Z0-9]/g, '_');
  const recs = tower.recommendations.map(r => `
    <div class="rec-item"><span class="rec-bullet">▶</span><span>${escHtml(r)}</span></div>
  `).join('');
  const risks = tower.risks.map(r => `
    <div class="risk-item"><span class="risk-bullet">⚠</span><span>${escHtml(r)}</span></div>
  `).join('');
  const deps = tower.dependencies.map(d => `
    <span class="tower-chip">${escHtml(d)}</span>
  `).join('');
  const refs = tower.source_references.map(r => `
    <span class="tower-chip" style="border-color:rgba(139,92,246,0.3);color:var(--purple)">${escHtml(r)}</span>
  `).join('');

  // Editable versions of recommendations and risks
  const editableRecs = tower.recommendations.map((r, i) => `
    <div class="editable-list-item" id="tower-rec-${towerKey}-${i}">
      <textarea oninput="syncTowerField('${tower.tower}','recommendations',${i},this.value)">${escHtml(r)}</textarea>
      <button class="btn-remove-item" onclick="removeTowerListItem('${tower.tower}','recommendations',${i})">✕</button>
    </div>
  `).join('');
  const editableRisks = tower.risks.map((r, i) => `
    <div class="editable-list-item" id="tower-risk-${towerKey}-${i}">
      <textarea oninput="syncTowerField('${tower.tower}','risks',${i},this.value)">${escHtml(r)}</textarea>
      <button class="btn-remove-item" onclick="removeTowerListItem('${tower.tower}','risks',${i})">✕</button>
    </div>
  `).join('');

  return `
    <div class="section-block fade-in ${isEditMode ? 'edit-mode' : ''}">
      <div class="section-header" onclick="toggleSection(this)">
        <div class="section-title-wrap">
          <span style="font-size:18px">${icon}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:700">${escHtml(tower.tower)}</span>
          <span class="impact-badge impact-${tower.impact_level}">${tower.impact_level} Impact</span>
        </div>
        <span style="color:var(--text-muted);font-size:16px" class="toggle-arrow">▼</span>
      </div>
      <div class="section-body">
        <div>
          <div class="field-label">Summary</div>
          <div class="field-text-view field-text">${escHtml(tower.summary)}</div>
          <div class="editable-field field-text-edit">
            <textarea rows="3" oninput="syncTowerTextField('${tower.tower}','summary',this.value)">${escHtml(tower.summary)}</textarea>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div class="field-label">Current State</div>
            <div class="field-text-view field-text" style="font-size:12px">${escHtml(tower.current_state)}</div>
            <div class="editable-field field-text-edit">
              <textarea rows="3" style="font-size:12px" oninput="syncTowerTextField('${tower.tower}','current_state',this.value)">${escHtml(tower.current_state)}</textarea>
            </div>
          </div>
          <div>
            <div class="field-label">Gap Analysis</div>
            <div class="field-text-view field-text" style="font-size:12px">${escHtml(tower.gap_analysis)}</div>
            <div class="editable-field field-text-edit">
              <textarea rows="3" style="font-size:12px" oninput="syncTowerTextField('${tower.tower}','gap_analysis',this.value)">${escHtml(tower.gap_analysis)}</textarea>
            </div>
          </div>
        </div>
        <div>
          <div class="field-label">Recommendations</div>
          <div class="field-text-view rec-list">${recs}</div>
          <div class="field-text-edit">
            <div id="tower-recs-${towerKey}">${editableRecs}</div>
            <button class="btn-add-item" onclick="addTowerListItem('${tower.tower}','recommendations')">+ Add Recommendation</button>
          </div>
        </div>
        <div>
          <div class="field-label">Risks</div>
          <div class="field-text-view risk-list">${risks}</div>
          <div class="field-text-edit">
            <div id="tower-risks-${towerKey}">${editableRisks}</div>
            <button class="btn-add-item" onclick="addTowerListItem('${tower.tower}','risks')">+ Add Risk</button>
          </div>
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <div>
            <div class="field-label">Effort Estimate</div>
            <div class="field-text-view" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--amber)">${escHtml(tower.effort_estimate)}</div>
            <div class="editable-field field-text-edit" style="max-width:300px">
              <input type="text" value="${escHtml(tower.effort_estimate)}" oninput="syncTowerTextField('${tower.tower}','effort_estimate',this.value)">
            </div>
          </div>
          ${tower.dependencies.length > 0 ? `
            <div>
              <div class="field-label">Dependencies</div>
              <div class="tower-chips">${deps}</div>
            </div>
          ` : ''}
          ${tower.source_references.length > 0 ? `
            <div>
              <div class="field-label">Sources</div>
              <div class="tower-chips">${refs}</div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderTraceItem(entry) {
  const pct = Math.round(entry.confidence * 100);
  return `
    <div class="trace-item">
      <div class="trace-header">
        <span class="trace-tower">${escHtml(entry.tower)}</span>
        <div class="trace-badges">
          <span class="source-badge source-${entry.source_type}">${entry.source_type.replace(/_/g, ' ')}</span>
          <div class="confidence-bar-wrap">
            <span class="confidence-label">${pct}%</span>
            <div class="confidence-track">
              <div class="confidence-fill" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="trace-signal">Signal: ${escHtml(entry.signal)}</div>
      ${entry.evidence_snippets.map(s => `
        <div class="evidence-snippet">${escHtml(s.slice(0, 300))}${s.length > 300 ? '…' : ''}</div>
      `).join('')}
    </div>
  `;
}

// ── Page: History ─────────────────────────────────────────────────────────
function renderHistory() {
  return `
    <div class="page-header fade-in">
      <div>
        <div class="page-title">Draft <span>History</span></div>
        <div class="page-subtitle">${state.drafts.length} ITTA drafts generated</div>
      </div>
      <button class="btn btn-primary" onclick="navigate('generate')">⚡ New Draft</button>
    </div>

    <div class="card fade-in">
      ${state.drafts.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No drafts generated yet</div>
          <div class="empty-sub">Your ITTA history will appear here after generation.</div>
        </div>
      ` : `
        <table class="history-table">
          <thead>
            <tr>
              <th>Demand</th>
              <th>Towers</th>
              <th>Mode</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Generated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.drafts.map(d => `
              <tr>
                <td>
                  <div style="font-weight:500;color:var(--text-primary)">${escHtml(d.demand_title)}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escHtml(d.demand_description.slice(0,80))}…</div>
                </td>
                <td>
                  <div class="tower-chips">
                    ${d.towers.slice(0,3).map(t => `<span class="tower-chip">${escHtml(t.tower)}</span>`).join('')}
                    ${d.towers.length > 3 ? `<span class="tower-chip">+${d.towers.length-3}</span>` : ''}
                  </div>
                </td>
                <td><span class="mode-badge mode-${d.generation_mode}">${d.generation_mode.replace('_',' ')}</span></td>
                <td style="font-family:'IBM Plex Mono',monospace;font-size:12px">${escHtml(d.overall_risk.split(' ')[0])}</td>
                <td><span class="review-badge ${d.review_status || 'generated'}" style="font-size:9px;padding:3px 8px">${(d.review_status || 'generated').replace('_',' ')}</span></td>
                <td style="font-size:12px;color:var(--text-secondary)">${formatDate(d.generated_at)}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-secondary" style="padding:6px 12px;font-size:10px" onclick="viewDraft('${d.id}')">View</button>
                    <button class="btn btn-secondary" style="padding:6px 10px;font-size:10px;border-color:rgba(139,92,246,0.4);color:var(--purple)" onclick="openReviewFromHistory('${d.id}')">Review</button>
                    <button class="btn-icon" onclick="deleteDraft('${d.id}')" title="Delete">🗑</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

// ── Actions ───────────────────────────────────────────────────────────────
async function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  for (const file of files) await uploadFile(file);
}

function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('upload-zone')?.classList.add('dragover');
}

function handleDragLeave(event) {
  document.getElementById('upload-zone')?.classList.remove('dragover');
}

async function handleDrop(event) {
  event.preventDefault();
  document.getElementById('upload-zone')?.classList.remove('dragover');
  const files = Array.from(event.dataTransfer.files).filter(f =>
    f.name.match(/\.(pdf|docx|doc)$/i)
  );
  for (const file of files) await uploadFile(file);
}

async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  try {
    const data = await apiFetch(API.upload, { method: 'POST', body: form });
    toast(`"${file.name}" uploaded, processing…`, 'success');
    await loadDocuments();
    if (state.currentPage === 'documents') renderPage('documents');
    // Poll for processing completion
    pollDocStatus(data.doc_id);
  } catch (e) {
    toast(`Upload failed: ${e.message}`, 'error');
  }
}

function pollDocStatus(docId) {
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts++;
    if (attempts > 30) { clearInterval(timer); return; }
    try {
      const doc = await apiFetch(`${API.docs}${docId}`);
      if (doc.status === 'ready' || doc.status === 'failed') {
        clearInterval(timer);
        await loadDocuments();
        if (state.currentPage === 'documents') renderPage('documents');
        if (doc.status === 'ready') toast(`"${doc.original_name}" indexed (${doc.chunk_count} chunks)`, 'success');
        else toast(`Processing failed for "${doc.original_name}"`, 'error');
      }
    } catch { clearInterval(timer); }
  }, 2000);
}

async function deleteDocument(docId, name) {
  if (!confirm(`Delete "${name}" and remove from knowledge base?`)) return;
  try {
    await apiFetch(`${API.docs}${docId}`, { method: 'DELETE' });
    toast(`"${name}" deleted`, 'info');
    await loadDocuments();
    if (state.currentPage === 'documents') renderPage('documents');
  } catch (e) {
    toast(`Delete failed: ${e.message}`, 'error');
  }
}

async function generateITTA() {
  const title = document.getElementById('demand-title')?.value?.trim();
  const desc  = document.getElementById('demand-desc')?.value?.trim();
  const ctx   = document.getElementById('business-context')?.value?.trim();

  if (!title || title.length < 5) { toast('Demand title must be at least 5 characters', 'error'); return; }
  if (!desc  || desc.length  < 20) { toast('Demand description must be at least 20 characters', 'error'); return; }

  const payload = {
    demand_title: title,
    demand_description: desc,
    business_context: ctx || null,
    target_towers: state.selectedTowers.size > 0
      ? Array.from(state.selectedTowers)
      : null,
  };

  showLoading('Generating ITTA Draft', 'Analysing demand · Retrieving knowledge · Assessing towers…');

  try {
    const data = await apiFetch(API.generate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    hideLoading();
    toast('ITTA draft generated successfully!', 'success');
    await loadDrafts();
    state.selectedTowers.clear();
    // Show Review nav item now that we have a current draft
    const reviewNav = document.getElementById('nav-review');
    if (reviewNav) reviewNav.style.display = 'flex';
    navigate('result', data.itta);
  } catch (e) {
    hideLoading();
    toast(`Generation failed: ${e.message}`, 'error');
  }
}

async function viewDraft(draftId) {
  try {
    const draft = await apiFetch(`${API.drafts}${draftId}`);
    // Show Review nav item now that we have a current draft
    const reviewNav = document.getElementById('nav-review');
    if (reviewNav) reviewNav.style.display = 'flex';
    navigate('result', draft);
  } catch (e) {
    toast(`Could not load draft: ${e.message}`, 'error');
  }
}

async function deleteDraft(draftId) {
  if (!confirm('Delete this ITTA draft?')) return;
  try {
    await apiFetch(`${API.drafts}${draftId}`, { method: 'DELETE' });
    toast('Draft deleted', 'info');
    await loadDrafts();
    if (state.currentPage === 'history') renderPage('history');
  } catch (e) {
    toast(`Delete failed: ${e.message}`, 'error');
  }
}

/** Load a draft from history and go directly to its review page. */
async function openReviewFromHistory(draftId) {
  try {
    const draft = await apiFetch(`${API.drafts}${draftId}`);
    state.currentDraft = draft;
    const reviewNav = document.getElementById('nav-review');
    if (reviewNav) reviewNav.style.display = 'flex';
    navigate('review', draft);
  } catch (e) {
    toast(`Could not load draft: ${e.message}`, 'error');
  }
}

function exportDraft(draftId) {
  // Build a printable HTML export
  const draft = state.currentDraft;
  if (!draft) return;
  const win = window.open('', '_blank');
  win.document.write(buildExportHtml(draft));
  win.document.close();
  win.print();
}

function buildExportHtml(draft) {
  const towers = draft.towers.map(t => `
    <h3>${t.tower} — ${t.impact_level} Impact</h3>
    <p><strong>Summary:</strong> ${escHtml(t.summary)}</p>
    <p><strong>Current State:</strong> ${escHtml(t.current_state)}</p>
    <p><strong>Gap Analysis:</strong> ${escHtml(t.gap_analysis)}</p>
    <p><strong>Recommendations:</strong></p>
    <ul>${t.recommendations.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
    <p><strong>Risks:</strong></p>
    <ul>${t.risks.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
    <p><strong>Effort:</strong> ${escHtml(t.effort_estimate)}</p>
    <hr>
  `).join('');

  return `<!DOCTYPE html><html><head><title>ITTA – ${escHtml(draft.demand_title)}</title>
    <style>body{font-family:sans-serif;max-width:900px;margin:40px auto;color:#111}
    h1{color:#0d3b6e}h2{color:#1a5c9a}hr{border-color:#ddd}</style></head>
    <body>
      <h1>ITTA Draft</h1>
      <p><strong>Demand:</strong> ${escHtml(draft.demand_title)}</p>
      <p><strong>Generated:</strong> ${formatDate(draft.generated_at)}</p>
      <p><strong>Mode:</strong> ${draft.generation_mode}</p>
      <h2>Executive Summary</h2><p>${escHtml(draft.executive_summary)}</p>
      <h2>Scope</h2><p>${escHtml(draft.scope_statement)}</p>
      <h2>Tower Assessments</h2>${towers}
      <h2>Timeline</h2><p>${escHtml(draft.timeline_overview)}</p>
      <h2>Next Steps</h2><ol>${draft.next_steps.map(s=>`<li>${escHtml(s)}</li>`).join('')}</ol>
    </body></html>`;
}

// ── UI helpers ────────────────────────────────────────────────────────────
function toggleSection(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector('.toggle-arrow');
  body.classList.toggle('hidden');
  if (arrow) arrow.textContent = body.classList.contains('hidden') ? '▶' : '▼';
}

function switchTab(tabEl) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  tabEl.classList.add('active');
  const target = document.getElementById(`tab-${tabEl.dataset.tab}`);
  if (target) { target.style.display = 'block'; target.classList.add('fade-in'); }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ── Render dispatcher ─────────────────────────────────────────────────────
function renderPage(page) {
  const content = document.getElementById('main-content');
  let html = '';
  switch (page) {
    case 'dashboard':   html = renderDashboard(); break;
    case 'documents':   html = renderDocuments();  break;
    case 'generate':    html = renderGenerate();   break;
    case 'result':      html = renderResult(state.currentDraft); break;
    case 'history':     html = renderHistory();    break;
    case 'review':      html = renderReview(state.currentDraft); break;
    default:            html = renderDashboard();
  }
  content.innerHTML = html;

  // Post-render: async load citations for review page
  if (page === 'review' && state.currentDraft) {
    loadReviewCitations(state.currentDraft.id);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 1: Inline Editing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enable edit mode – re-renders result page with edit fields visible.
 * Also initialises in-memory pending edits from current draft.
 */
function enableEditMode() {
  if (!state.currentDraft || state.currentDraft.is_locked) return;
  state.editMode = true;
  // Seed pendingEdits with current draft values
  state.pendingEdits = {
    executive_summary: state.currentDraft.executive_summary,
    scope_statement:   state.currentDraft.scope_statement,
    overall_risk:      state.currentDraft.overall_risk,
    timeline_overview: state.currentDraft.timeline_overview,
    next_steps:        [...(state.currentDraft.next_steps || [])],
    tower_edits: {},
  };
  // Seed tower edits
  (state.currentDraft.towers || []).forEach(t => {
    state.pendingEdits.tower_edits[t.tower] = {
      summary:       t.summary,
      current_state: t.current_state,
      gap_analysis:  t.gap_analysis,
      recommendations: [...t.recommendations],
      risks:         [...t.risks],
      effort_estimate: t.effort_estimate,
    };
  });
  renderPage('result');
}

/** Cancel edit mode without saving. */
function cancelEditMode() {
  state.editMode = false;
  state.pendingEdits = {};
  renderPage('result');
}

// ── Sync helpers called by oninput handlers ─────────────────────────────

function syncNextStep(idx, value) {
  if (!state.pendingEdits.next_steps) return;
  state.pendingEdits.next_steps[idx] = value;
}

function addNextStep() {
  if (!state.pendingEdits.next_steps) state.pendingEdits.next_steps = [];
  state.pendingEdits.next_steps.push('');
  const container = document.getElementById('edit-next_steps-container');
  if (!container) return;
  const idx = state.pendingEdits.next_steps.length - 1;
  const div = document.createElement('div');
  div.className = 'editable-list-item';
  div.id = `next-step-item-${idx}`;
  div.innerHTML = `
    <textarea oninput="syncNextStep(${idx}, this.value)"></textarea>
    <button class="btn-remove-item" onclick="removeNextStep(${idx})">✕ Remove</button>
  `;
  container.appendChild(div);
  div.querySelector('textarea').focus();
}

function removeNextStep(idx) {
  if (!state.pendingEdits.next_steps) return;
  state.pendingEdits.next_steps.splice(idx, 1);
  const el = document.getElementById(`next-step-item-${idx}`);
  if (el) el.remove();
  // Re-index remaining items
  const container = document.getElementById('edit-next_steps-container');
  if (container) {
    container.querySelectorAll('.editable-list-item').forEach((el, i) => {
      el.id = `next-step-item-${i}`;
      const ta = el.querySelector('textarea');
      if (ta) ta.setAttribute('oninput', `syncNextStep(${i}, this.value)`);
      const btn = el.querySelector('button');
      if (btn) btn.setAttribute('onclick', `removeNextStep(${i})`);
    });
  }
}

function syncTowerTextField(towerName, field, value) {
  if (!state.pendingEdits.tower_edits) return;
  if (!state.pendingEdits.tower_edits[towerName]) state.pendingEdits.tower_edits[towerName] = {};
  state.pendingEdits.tower_edits[towerName][field] = value;
}

function syncTowerField(towerName, listField, idx, value) {
  if (!state.pendingEdits.tower_edits) return;
  if (!state.pendingEdits.tower_edits[towerName]) state.pendingEdits.tower_edits[towerName] = {};
  if (!state.pendingEdits.tower_edits[towerName][listField]) {
    // Copy from current draft
    const t = state.currentDraft.towers.find(t => t.tower === towerName);
    state.pendingEdits.tower_edits[towerName][listField] = t ? [...t[listField]] : [];
  }
  state.pendingEdits.tower_edits[towerName][listField][idx] = value;
}

function addTowerListItem(towerName, listField) {
  const towerKey = towerName.replace(/[^a-zA-Z0-9]/g, '_');
  const containerId = listField === 'recommendations'
    ? `tower-recs-${towerKey}`
    : `tower-risks-${towerKey}`;
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!state.pendingEdits.tower_edits[towerName]) state.pendingEdits.tower_edits[towerName] = {};
  if (!state.pendingEdits.tower_edits[towerName][listField]) {
    const t = state.currentDraft.towers.find(t => t.tower === towerName);
    state.pendingEdits.tower_edits[towerName][listField] = t ? [...t[listField]] : [];
  }
  const idx = state.pendingEdits.tower_edits[towerName][listField].length;
  state.pendingEdits.tower_edits[towerName][listField].push('');

  const div = document.createElement('div');
  div.className = 'editable-list-item';
  div.id = `tower-${listField.slice(0,3)}-${towerKey}-${idx}`;
  div.innerHTML = `
    <textarea oninput="syncTowerField('${towerName}','${listField}',${idx},this.value)"></textarea>
    <button class="btn-remove-item" onclick="removeTowerListItem('${towerName}','${listField}',${idx})">✕</button>
  `;
  container.appendChild(div);
  div.querySelector('textarea').focus();
}

function removeTowerListItem(towerName, listField, idx) {
  if (!state.pendingEdits.tower_edits?.[towerName]?.[listField]) return;
  state.pendingEdits.tower_edits[towerName][listField].splice(idx, 1);
  const towerKey = towerName.replace(/[^a-zA-Z0-9]/g, '_');
  const prefix = listField === 'recommendations' ? 'rec' : 'risk';
  const el = document.getElementById(`tower-${prefix}-${towerKey}-${idx}`);
  if (el) el.remove();
}

/**
 * Collect current values from DOM inputs and merge into pendingEdits,
 * then POST to /api/itta/{id}/edit.
 */
async function saveDraftChanges(draftId) {
  const pe = state.pendingEdits;

  // Pull latest values from DOM for top-level text fields
  const fields = ['executive_summary', 'scope_statement', 'overall_risk', 'timeline_overview'];
  fields.forEach(f => {
    const el = document.getElementById(`edit-${f}`);
    if (el) pe[f] = el.value;
  });

  // Collect next_steps from textarea DOMs
  const nsContainer = document.getElementById('edit-next_steps-container');
  if (nsContainer) {
    pe.next_steps = Array.from(nsContainer.querySelectorAll('textarea')).map(ta => ta.value).filter(v => v.trim());
  }

  const payload = {
    executive_summary: pe.executive_summary || null,
    scope_statement:   pe.scope_statement   || null,
    overall_risk:      pe.overall_risk       || null,
    timeline_overview: pe.timeline_overview  || null,
    next_steps:        pe.next_steps         || null,
    tower_edits:       pe.tower_edits        || {},
    modified_by:       'EA',
  };

  try {
    const updated = await apiFetch(API.editDraft(draftId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Update state with server-saved version
    state.currentDraft = updated;
    state.editMode = false;
    state.pendingEdits = {};

    // Update draft list cache
    const idx = state.drafts.findIndex(d => d.id === draftId);
    if (idx !== -1) state.drafts[idx] = updated;

    renderPage('result');
    toast('Draft changes saved successfully!', 'success');

    // Flash the save indicator
    const indicator = document.getElementById('save-indicator');
    if (indicator) {
      indicator.classList.add('visible');
      setTimeout(() => indicator.classList.remove('visible'), 3000);
    }
  } catch (e) {
    toast(`Save failed: ${e.message}`, 'error');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 2: Review & Approval Workflow
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders the dedicated Review Page for EA manual approval workflow.
 * Shows: version history, citation summary, and approve/request-changes controls.
 */
function renderReview(draft) {
  if (!draft) {
    return `<div class="page-header fade-in"><div class="page-title">No Draft Selected</div></div>
      <div class="card"><div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No draft to review</div>
        <div class="empty-sub">Generate or open a draft first.</div>
      </div></div>`;
  }

  const reviewStatus = draft.review_status || 'generated';
  const isLocked = draft.is_locked || false;

  // Version history display
  const versionRows = (draft.version_history || []).map(v => `
    <div class="version-entry">
      <span class="version-tag ${v.version}">${v.version}</span>
      <span style="color:var(--text-secondary);flex:1">${escHtml(v.modified_by || 'System')}</span>
      <span style="color:var(--text-muted);font-size:11px;font-family:'IBM Plex Mono',monospace">${formatDate(v.timestamp)}</span>
    </div>
  `).join('') || `<div class="version-entry"><span class="version-tag generated">generated</span><span style="color:var(--text-secondary);flex:1">System</span><span style="color:var(--text-muted);font-size:11px">${formatDate(draft.generated_at)}</span></div>`;

  // Citation summary (will be loaded async below)
  const citationSummaryHtml = `
    <div id="citation-review-panel">
      <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">
        <div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto 8px"></div>
        Loading citations…
      </div>
    </div>`;

  const approvalSection = isLocked ? `
    <div class="locked-banner" style="margin:0">
      <span class="lock-icon">🔒</span>
      <div>
        <strong>Approved &amp; Locked</strong> — by <strong>${escHtml(draft.approved_by || 'EA')}</strong>
        ${draft.approved_at ? ` on ${formatDate(draft.approved_at)}` : ''}.
        This draft is finalised.
      </div>
    </div>
  ` : `
    <div class="review-actions">
      <div style="flex:1">
        <button class="btn-approve" onclick="approveDraft('${draft.id}')">
          ✅ Approve Draft
        </button>
      </div>
      <div style="flex:2">
        <button class="btn-request-changes" onclick="showRequestChangesForm('${draft.id}')">
          ↩ Request Changes
        </button>
        <div id="changes-form" style="display:none;margin-top:12px">
          <textarea class="review-comment-area" id="review-comment-input"
            placeholder="Describe what needs to be changed before this draft can be approved…"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">
            <button class="btn btn-secondary" style="font-size:11px;padding:6px 14px" onclick="hideRequestChangesForm()">Cancel</button>
            <button class="btn" style="font-size:11px;padding:6px 14px;background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.3)"
              onclick="submitRequestChanges('${draft.id}')">Submit Request</button>
          </div>
        </div>
      </div>
    </div>
  `;

  return `
    <div class="page-header fade-in">
      <div>
        <div class="page-title">EA <span>Review</span></div>
        <div class="page-subtitle">${escHtml(draft.demand_title)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="review-badge ${reviewStatus}">${reviewStatus.replace('_', ' ')}</span>
        <button class="btn btn-secondary" onclick="navigate('result', state.currentDraft)">← Back to Draft</button>
      </div>
    </div>

    <!-- Approval Panel -->
    <div class="review-panel fade-in">
      <div class="review-panel-title">🎯 Approval Decision</div>
      ${approvalSection}
    </div>

    <!-- Draft Summary -->
    <div class="review-panel fade-in">
      <div class="review-panel-title">📋 Draft Summary</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px">
        <div>
          <div class="field-label">Towers Assessed</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:18px;color:var(--cyan)">${draft.towers.length}</div>
        </div>
        <div>
          <div class="field-label">Overall Risk</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:18px;color:var(--amber)">${escHtml((draft.overall_risk || '').split(' ')[0])}</div>
        </div>
        <div>
          <div class="field-label">Generation Mode</div>
          <div><span class="mode-badge mode-${draft.generation_mode}">${draft.generation_mode.replace('_', ' ')}</span></div>
        </div>
      </div>
      <div>
        <div class="field-label" style="margin-bottom:8px">Executive Summary</div>
        <div class="field-text" style="font-size:13px;line-height:1.7">${escHtml(draft.executive_summary)}</div>
      </div>
    </div>

    <!-- Version History -->
    <div class="review-panel fade-in">
      <div class="review-panel-title">📜 Version History</div>
      <div class="version-history-list">${versionRows}</div>
    </div>

    <!-- Citations Panel (Feature 3) -->
    <div class="review-panel fade-in">
      <div class="review-panel-title">🔗 Source Citations &amp; Traceability</div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
        Each recommendation section is linked to the historical ITTA document that informed it.
        Expand a tower to see the source document, similarity score, and retrieved text chunk.
      </p>
      ${citationSummaryHtml}
    </div>
  `;
}

/** Load citations asynchronously and inject into the review page. */
async function loadReviewCitations(draftId) {
  try {
    let citData;
    if (state.citationsCache[draftId]) {
      citData = state.citationsCache[draftId];
    } else {
      citData = await apiFetch(API.citations(draftId));
      state.citationsCache[draftId] = citData;
    }
    const panel = document.getElementById('citation-review-panel');
    if (!panel) return;
    panel.innerHTML = renderCitationPanel(citData, state.currentDraft);
  } catch (e) {
    const panel = document.getElementById('citation-review-panel');
    if (panel) panel.innerHTML = `<div class="citation-empty">Could not load citations: ${escHtml(e.message)}</div>`;
  }
}

/**
 * Approve the draft via API.
 */
async function approveDraft(draftId) {
  if (!confirm('Approve this ITTA draft? This will lock it for further editing.')) return;
  try {
    const updated = await apiFetch(API.approveDraft(draftId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'EA' }),
    });
    state.currentDraft = updated;
    const idx = state.drafts.findIndex(d => d.id === draftId);
    if (idx !== -1) state.drafts[idx] = updated;
    toast('Draft approved and locked successfully!', 'success');
    renderPage('review');
  } catch (e) {
    toast(`Approval failed: ${e.message}`, 'error');
  }
}

function showRequestChangesForm(draftId) {
  const form = document.getElementById('changes-form');
  if (form) form.style.display = 'block';
}

function hideRequestChangesForm() {
  const form = document.getElementById('changes-form');
  if (form) form.style.display = 'none';
}

async function submitRequestChanges(draftId) {
  const comment = document.getElementById('review-comment-input')?.value?.trim() || '';
  try {
    const updated = await apiFetch(API.requestChanges(draftId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment, requested_by: 'EA' }),
    });
    state.currentDraft = updated;
    const idx = state.drafts.findIndex(d => d.id === draftId);
    if (idx !== -1) state.drafts[idx] = updated;
    toast('Changes requested. Draft returned to editable mode.', 'info');
    navigate('result', updated);
  } catch (e) {
    toast(`Request failed: ${e.message}`, 'error');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 3: Citation Panel Rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders the full citation panel grouped by tower.
 * @param {Object} citData - Response from /api/itta/{id}/citations
 * @param {Object} draft   - The current draft object
 */
function renderCitationPanel(citData, draft) {
  const citations = citData.citations || [];

  if (citations.length === 0) {
    // Best-practice mode: no historical docs, explain this clearly
    const traceEntries = (draft?.traceability || []);
    if (citData.generation_mode === 'best_practice' || traceEntries.length === 0) {
      return `
        <div class="citation-empty">
          <span class="citation-best-practice">📚 Best Practice Mode</span>
          <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">
            This draft was generated using enterprise best practices (ITIL v4, cloud-native frameworks, EA standards).
            Upload historical ITTA PDFs to the Knowledge Base to enable source citations from real past ITTAs.
          </div>
        </div>`;
    }
    return `<div class="citation-empty">No source citations available for this draft.</div>`;
  }

  // Group citations by tower
  const byTower = {};
  citations.forEach(c => {
    if (!byTower[c.tower]) byTower[c.tower] = [];
    byTower[c.tower].push(c);
  });

  return `<div class="citation-section">
    ${Object.entries(byTower).map(([tower, cits]) => `
      <div class="citation-tower-group">
        <div class="citation-tower-header" onclick="toggleCitationGroup(this)">
          <div class="citation-tower-name">
            ${TOWER_ICONS[tower] || '🔹'} ${escHtml(tower)}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="citation-count">${cits.length} source${cits.length > 1 ? 's' : ''}</span>
            <span style="color:var(--text-muted);font-size:12px">▼</span>
          </div>
        </div>
        <div class="citation-tower-body">
          ${cits.map(c => renderCitationCard(c)).join('')}
        </div>
      </div>
    `).join('')}
  </div>`;
}

/** Renders a single citation card. */
function renderCitationCard(c) {
  const pct = Math.round((c.similarity_score || 0) * 100);
  // Color code similarity: green ≥80%, amber ≥60%, red <60%
  const simColor = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)';
  const chunkPreview = (c.retrieved_chunk || '').slice(0, 350);

  return `
    <div class="citation-card">
      <div class="citation-card-header">
        <div>
          <div class="citation-doc-name">📄 ${escHtml(c.doc_name)}</div>
          <div class="citation-tower-source">↳ ${escHtml(c.tower_source)}</div>
        </div>
        <div class="citation-similarity">
          <span class="similarity-pct" style="color:${simColor}">${pct}%</span>
          <div class="similarity-bar">
            <div class="similarity-fill" style="width:${pct}%;background:${simColor}"></div>
          </div>
          <span style="font-size:10px;color:var(--text-muted);font-family:'IBM Plex Mono',monospace">similarity</span>
        </div>
      </div>
      ${chunkPreview ? `
        <div class="citation-chunk">${escHtml(chunkPreview)}${c.retrieved_chunk.length > 350 ? '…' : ''}</div>
      ` : ''}
    </div>`;
}

/** Toggle citation group expand/collapse. */
function toggleCitationGroup(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector('span[style*="color:var(--text-muted)"]');
  if (body) body.style.display = body.style.display === 'none' ? 'flex' : 'none';
  if (arrow) arrow.textContent = body.style.display === 'none' ? '▶' : '▼';
}


// ── Render dispatcher ─────────────────────────────────────────────────────

// ── Bootstrap ─────────────────────────────────────────────────────────────
async function init() {
  await checkHealth();
  await Promise.all([loadDocuments(), loadDrafts()]);
  renderPage('dashboard');
  // Auto-refresh processing docs
  setInterval(async () => {
    const hasProcessing = state.documents.some(d => d.status === 'processing');
    if (hasProcessing) {
      await loadDocuments();
      if (state.currentPage === 'documents') renderPage('documents');
    }
  }, 5000);
}

document.addEventListener('DOMContentLoaded', init);
