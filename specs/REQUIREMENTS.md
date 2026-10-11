# Requirements Specification

> **Document role:** Approved requirements baseline (2026-06-11). Completion
> and evidence are maintained separately in [TRACEABILITY.md](TRACEABILITY.md)
> so the original scope is not silently rewritten after implementation.

## AI Cloud Document Vault

**Project:** Final Year Project — Software Design with AI for Cloud Computing (Level 8)  
**Institution:** TUS Athlone  
**Version:** 1.0  
**Date:** 2026-06-11

---

## 1. Introduction

### 1.1 Purpose

This document defines the functional and non-functional requirements for the AI Cloud Document Vault — a cloud-based application that allows users to digitise, organise, and intelligently query physical documents (manuals, warranties, guides) using AI.

### 1.2 Scope

The system will provide:
- Document capture via camera or file upload
- AI-powered OCR and text extraction
- Intelligent auto-categorisation
- Full-text and semantic search
- Natural language Q&A over stored documents
- Cloud synchronisation across devices

### 1.3 Definitions

| Term | Definition |
|------|-----------|
| OCR | Optical Character Recognition — extracting text from images |
| RAG | Retrieval-Augmented Generation — answering questions using retrieved document context |
| Embedding | A numerical vector representation of text for similarity comparison |
| Chunk | A segment of a document (~500 tokens) stored for retrieval |

---

## 2. User Stories

### 2.1 Core User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | homeowner | snap a photo of my appliance manual | I have a digital copy I can't lose |
| US-02 | user | search across all my documents by keyword | I can quickly find specific information |
| US-03 | user | ask a question in plain English about my documents | I get an answer without reading the whole manual |
| US-04 | user | access my documents from any device | I'm not tied to one phone or computer |
| US-05 | user | have my documents automatically categorised | I don't have to manually organise everything |
| US-06 | user | view the original scan alongside extracted text | I can verify the AI read it correctly |
| US-07 | tenant | store my lease and utility docs | everything is in one searchable place |
| US-08 | user | get notified before my warranty expires | I can make claims before it's too late |
| US-09 | user | delete my account and all data | I maintain control over my personal information |
| US-10 | user | use the app offline | I can access my documents without internet |

### 2.2 Administrative Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-11 | developer | deploy the entire system with one command | the infrastructure is reproducible |
| US-12 | developer | have automated tests run on every push | I catch regressions early |
| US-13 | developer | monitor system health and errors | I know when something breaks |

---

## 3. Functional Requirements

### 3.1 Authentication & User Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-01 | Users shall register with email and password | Must |
| FR-02 | Users shall authenticate via JWT tokens | Must |
| FR-03 | Users shall be able to reset their password | Must |
| FR-04 | Users shall be able to delete their account and all associated data | Must |
| FR-05 | Users may authenticate via Google/Apple OAuth | Could |

### 3.2 Document Capture

| ID | Requirement | Priority |
|----|------------|----------|
| FR-06 | Users shall upload documents as images (JPEG, PNG) or PDF | Must |
| FR-07 | Users shall capture documents using device camera | Must |
| FR-08 | The system shall pre-process images (deskew, crop, enhance contrast) | Should |
| FR-09 | The system shall support multi-page document scanning | Should |
| FR-10 | The system shall show a camera overlay guide for alignment | Could |

### 3.3 OCR & Text Extraction

| ID | Requirement | Priority |
|----|------------|----------|
| FR-11 | The system shall extract text from uploaded images using OCR | Must |
| FR-12 | The system shall identify document structure (headings, sections, tables) | Should |
| FR-13 | The system shall display extracted text alongside the original image | Must |
| FR-14 | Users shall be able to manually correct OCR errors | Should |
| FR-15 | The system shall handle multi-column layouts | Could |

### 3.4 AI Categorisation

| ID | Requirement | Priority |
|----|------------|----------|
| FR-16 | The system shall auto-detect product brand and model from document text | Should |
| FR-17 | The system shall assign a category (e.g., Appliances > Kitchen > Oven) | Should |
| FR-18 | The system shall suggest a document title | Should |
| FR-19 | Users shall be able to override AI-assigned categories | Must |
| FR-20 | Users shall be able to create custom categories | Must |

### 3.5 Search

| ID | Requirement | Priority |
|----|------------|----------|
| FR-21 | Users shall search documents by keyword (full-text search) | Must |
| FR-22 | Users shall search documents by meaning (semantic search) | Should |
| FR-23 | Search results shall show matching excerpts with highlights | Must |
| FR-24 | Users shall filter search by category, brand, or date | Should |

### 3.6 AI Q&A (RAG)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-25 | Users shall ask natural language questions about their documents | Should |
| FR-26 | The system shall return answers grounded in stored document content | Should |
| FR-27 | Answers shall cite the source document and section | Should |
| FR-28 | The system shall respond "I don't have information about that" when the answer isn't in stored documents | Should |
| FR-29 | Users shall see the relevant document chunks used to generate the answer | Could |

### 3.7 Document Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-30 | Users shall view a list of all stored documents | Must |
| FR-31 | Users shall edit document title, category, and tags | Must |
| FR-32 | Users shall delete documents | Must |
| FR-33 | Users shall view document details (original image, text, metadata) | Must |
| FR-34 | Documents shall display date scanned and last accessed | Must |

### 3.8 Warranty Tracking

| ID | Requirement | Priority |
|----|------------|----------|
| FR-35 | Users shall manually set warranty expiry dates on documents | Should |
| FR-36 | The system shall send notifications before warranty expiry | Could |
| FR-37 | The system shall attempt to extract warranty dates from scanned receipts | Could |

### 3.9 Cloud Sync & Offline

| ID | Requirement | Priority |
|----|------------|----------|
| FR-38 | Documents shall sync to the cloud automatically after upload | Must |
| FR-39 | Users shall access their documents from multiple devices | Must |
| FR-40 | The app shall cache recently viewed documents for offline access | Could |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|----|------------|--------|
| NFR-01 | Document upload and OCR processing time | < 30 seconds |
| NFR-02 | Search response time | < 2 seconds |
| NFR-03 | AI Q&A response time | < 8 seconds |
| NFR-04 | Page load time (web app) | < 3 seconds |
| NFR-05 | System shall support at least 50 concurrent users | 50 users |

### 4.2 Security

| ID | Requirement |
|----|------------|
| NFR-06 | All data in transit shall be encrypted (TLS 1.2+) |
| NFR-07 | All data at rest shall be encrypted (AES-256) |
| NFR-08 | Users shall only access their own documents (row-level isolation) |
| NFR-09 | API keys and secrets shall be stored in a managed secrets service |
| NFR-10 | The system shall implement rate limiting to prevent abuse |
| NFR-11 | File uploads shall be validated for type and size (max 20MB per file) |

### 4.3 Scalability

| ID | Requirement |
|----|------------|
| NFR-12 | The system shall scale horizontally to handle increased load |
| NFR-13 | Storage shall scale automatically with user uploads |
| NFR-14 | The architecture shall support adding new AI models without redesign |

### 4.4 Reliability

| ID | Requirement | Target |
|----|------------|--------|
| NFR-15 | System uptime | > 99% during evaluation period |
| NFR-16 | Data durability (no document loss) | 99.99% |
| NFR-17 | Automated backups of database | Daily |

### 4.5 Usability

| ID | Requirement |
|----|------------|
| NFR-18 | The app shall be usable on mobile and desktop |
| NFR-19 | Core workflows (scan, search, ask) shall require < 3 taps/clicks |
| NFR-20 | The app shall meet WCAG 2.1 AA accessibility standards |
| NFR-21 | The UI shall provide clear feedback during processing (loading states, progress) |

### 4.6 Maintainability

| ID | Requirement |
|----|------------|
| NFR-22 | Code shall be documented and follow consistent style guidelines |
| NFR-23 | The system shall be deployable from source with a single command |
| NFR-24 | Infrastructure shall be defined as code (reproducible environments) |
| NFR-25 | CI/CD pipeline shall run tests and deploy automatically |

---

## 5. Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| C-01 | Budget limited to AWS Free Tier + ~€50/month | Student project |
| C-02 | Single developer | FYP is individual work |
| C-03 | 24-week timeline | Academic year schedule |
| C-04 | Must use cloud deployment (not local-only) | Course requirement |
| C-05 | Must incorporate AI meaningfully | Course requirement |
| C-06 | Must demonstrate software design principles | Course requirement |
| C-07 | OpenAI API dependency for LLM features | Requires API key and budget management |

---

## 6. Assumptions

1. Users have a smartphone with a camera capable of taking readable photos of documents
2. Documents are primarily in English (multi-language is stretch goal)
3. Documents are printed text (handwriting recognition is out of scope for MVP)
4. Users have internet connectivity for initial upload (offline access is read-only)
5. AWS services used will remain available and within free-tier/budget limits

---

## 7. Acceptance Criteria Summary

| Feature | Acceptance Criteria |
|---------|-------------------|
| Document capture | User can photograph a document and see it stored within 30 seconds |
| OCR | Extracted text is > 90% accurate on clear printed documents |
| Search | Searching for a known keyword returns the correct document in top 3 results |
| AI Q&A | Asking a question about a stored manual returns a relevant, sourced answer > 80% of the time |
| Auto-categorisation | AI correctly identifies brand/product type > 85% of the time |
| Multi-device | Document uploaded on phone appears on web within 10 seconds |
| Security | User A cannot see or access User B's documents under any circumstance |
