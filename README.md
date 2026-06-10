# ⚡ Smart ITTA Draft Generator

An AI-powered enterprise platform for generating **Initial Tower Technical Assessment (ITTA)** drafts using business demand inputs, historical assessment data, and enterprise architecture context.

Designed to simulate real-world **Enterprise Architect workflows**, the system generates structured, enterprise-grade ITTA documents with realistic technical assessments, impacted tower analysis, risks, dependencies, and architecture recommendations.

---

## 🚀 Features

* **AI-Powered ITTA Draft Generation**

  * Generate enterprise-grade ITTA documents from new business demands.

* **Historical Knowledge Base**

  * Leverages historical ITTA documents and category sheets for intelligent draft generation.

* **Tower-Level Technical Assessment**

  * Cloud
  * Security
  * Infrastructure
  * Network
  * Database
  * Applications
  * Monitoring & Observability
  * Governance & Compliance
  * Integration & Middleware

* **Enterprise Architecture Recommendations**

  * Generates realistic risks, assumptions, dependencies, and technical recommendations.

* **Draft Review Workflow**

  * Manual Enterprise Architect (EA) review and approval process.

* **Real-Time Editable Drafts**

  * Edit generated ITTA content before final approval.

* **Enterprise PDF Export**

  * Export professional ITTA documents in PDF format.

* **Azure AI Foundry Integration**

  * Uses enterprise AI orchestration for intelligent draft generation.

---

## 🏗️ Architecture Overview

**Frontend**

* HTML
* CSS
* JavaScript

**Backend**

* FastAPI (Python)

**AI Layer**

* Azure AI Foundry
* LLM-based document generation

**Storage**

* Local Storage
* Historical ITTA repository

**Document Processing**

* Azure Document Intelligence

---

## 📌 Use Cases

Smart ITTA Draft Generator supports enterprise transformation scenarios such as:

* Cloud Migration
* VMware to Azure Migration
* Hybrid Cloud Transformation
* Cybersecurity Transformation
* Zero Trust Implementation
* Datacenter Exit
* SAP / ERP Modernization
* Application Modernization
* Infrastructure Modernization
* Post-Merger IT Consolidation
* Monitoring / SOC Transformation
* Database Modernization

---

## 🖥️ Screens

* Dashboard
* Knowledge Base Management
* Generate ITTA
* Draft History
* Review & Approval Workflow

---

## ⚙️ Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-username/smart-itta-draft-generator.git
cd smart-itta-draft-generator
```

### 2. Create Virtual Environment

```bash
python -m venv venv
```

### 3. Activate Environment

**Windows**

```bash
venv\Scripts\activate
```

**Mac/Linux**

```bash
source venv/bin/activate
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Configure Environment Variables

Create a `.env` file:

```env
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=
AZURE_DOCUMENT_INTELLIGENCE_KEY=
```

### 6. Run Application

```bash
uvicorn main:app --reload
```

Open:

```text
http://localhost:8000
```

---

## 📂 Project Structure

```text
smart-itta-draft-generator/
│── main.py
│── requirements.txt
│── .env
│── static/
│── templates/
│── uploads/
│── generated_drafts/
│── knowledge_base/
│── services/
│── utils/
```

---

## 🎯 Objective

The goal of this project is to reduce manual effort in ITTA creation by automating enterprise technical assessment generation while preserving realistic architecture standards, governance considerations, and enterprise documentation quality.

---

## 📜 License

This project is intended for educational, enterprise architecture learning, and research purposes.
