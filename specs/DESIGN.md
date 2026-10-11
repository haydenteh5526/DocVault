# Design Document

> **Document role:** Original design baseline (2026-06-11). This intentionally
> preserves early choices such as Cognito and OpenAI so the report can explain
> design evolution. It is not the current deployment description. See
> [ARCHITECTURE.md](ARCHITECTURE.md) for the as-built system and
> [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for verified status.

## AI Cloud Document Vault

**Project:** Final Year Project — Software Design with AI for Cloud Computing (Level 8)  
**Institution:** TUS Athlone  
**Version:** 1.0  
**Date:** 2026-06-11

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

The system follows a three-tier cloud-native architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                          │
│                                                                 │
│   ┌─────────────────┐         ┌─────────────────┐              │
│   │  Mobile App     │         │  Web App        │              │
│   │  React Native   │         │  React + TS     │              │
│   └────────┬────────┘         └────────┬────────┘              │
└────────────┼───────────────────────────┼────────────────────────┘
             │          HTTPS            │
             ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                           │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │              API Gateway (AWS)                            │  │
│   └─────────────────────────┬───────────────────────────────┘  │
│                             ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │           Backend API (Python FastAPI)                    │  │
│   │                                                          │  │
│   │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────┐  │  │
│   │  │   Auth    │ │ Documents │ │  Search   │ │  AI    │  │  │
│   │  │  Module   │ │  Module   │ │  Module   │ │ Module │  │  │
│   │  └───────────┘ └───────────┘ └───────────┘ └────────┘  │  │
│   └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
             │              │              │
             ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                │
│                                                                 │
│   ┌──────────┐   ┌──────────────┐   ┌────────────────────┐    │
│   │  AWS S3  │   │ PostgreSQL   │   │  External APIs     │    │
│   │ (files)  │   │ + pgvector   │   │  (OpenAI/Textract) │    │
│   └──────────┘   └──────────────┘   └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Architecture Principles

| Principle | Application |
|-----------|-------------|
| Separation of concerns | Distinct layers for presentation, logic, data |
| Stateless API | No session state on server; JWT-based auth |
| Infrastructure as Code | All AWS resources defined in Terraform |
| 12-Factor App | Config via env vars, disposable processes, dev/prod parity |
| API-first | Frontend and backend developed independently against API contract |

---

## 2. Technology Stack

### 2.1 Choices & Justification

| Component | Technology | Why |
|-----------|-----------|-----|
| Backend | Python 3.12 + FastAPI | Async performance, excellent AI/ML ecosystem, type hints |
| Web Frontend | React 19 + TypeScript | Component-based, type-safe, large ecosystem |
| Mobile Frontend | React Native | Code sharing with web, cross-platform from one codebase |
| Database | PostgreSQL 16 (AWS RDS) | ACID, full-text search, pgvector for embeddings |
| Vector Storage | pgvector extension | Avoids separate vector DB service, simplifies infra |
| Object Storage | AWS S3 | Industry standard for file storage, 99.999999999% durability |
| Auth | AWS Cognito | Managed auth, OAuth2, handles password reset/MFA |
| OCR | AWS Textract | High accuracy, table extraction, managed service |
| LLM | OpenAI GPT-4o-mini | Cost-effective, high quality for Q&A and categorisation |
| Embeddings | OpenAI text-embedding-3-small | Good accuracy, low cost, 1536 dimensions |
| Compute | AWS ECS Fargate | Serverless containers, no EC2 management |
| CDN | AWS CloudFront | Fast global delivery of images and static assets |
| IaC | Terraform | Cloud-agnostic syntax, mature ecosystem |
| CI/CD | GitHub Actions | Free for public repos, good AWS integration |
| Monitoring | AWS CloudWatch | Native integration, logs + metrics + alarms |
| Containerisation | Docker | Consistent dev/prod environments |

### 2.2 Local Development Stack

| Tool | Purpose |
|------|---------|
| Docker Compose | Run all services locally |
| LocalStack or MinIO | S3-compatible local storage |
| PostgreSQL (Docker) | Local database |
| Ollama | Local LLM for development (saves OpenAI costs) |
| Tesseract | Local OCR fallback |

---

## 3. Component Design

### 3.1 Backend API (FastAPI)

```
backend/
├── app/
│   ├── main.py                 # FastAPI app entry point
│   ├── config.py               # Environment configuration
│   ├── dependencies.py         # Dependency injection
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── user.py
│   │   ├── document.py
│   │   └── category.py
│   ├── schemas/                # Pydantic request/response schemas
│   │   ├── document.py
│   │   ├── search.py
│   │   └── auth.py
│   ├── routers/                # API route handlers
│   │   ├── auth.py
│   │   ├── documents.py
│   │   ├── search.py
│   │   └── ai.py
│   ├── services/               # Business logic
│   │   ├── ocr_service.py
│   │   ├── ai_service.py
│   │   ├── search_service.py
│   │   ├── storage_service.py
│   │   └── document_service.py
│   ├── ai/                     # AI/ML pipeline
│   │   ├── ocr_pipeline.py
│   │   ├── categoriser.py
│   │   ├── embeddings.py
│   │   ├── rag.py
│   │   └── chunking.py
│   └── utils/
│       ├── image_processing.py
│       └── text_processing.py
├── tests/
├── Dockerfile
└── requirements.txt
```

**Design patterns used:**
- **Repository pattern** — data access abstracted behind interfaces
- **Service layer** — business logic separated from route handlers
- **Dependency injection** — FastAPI's `Depends()` for testability
- **Strategy pattern** — swappable OCR backends (Textract vs Tesseract)
- **Pipeline pattern** — document processing as sequential stages

### 3.2 OCR Processing Pipeline

```
Image Upload
     │
     ▼
┌─────────────────┐
│ Image Validation │  Validate file type, size, dimensions
└────────┬────────┘
         ▼
┌─────────────────┐
│ Pre-processing   │  Deskew, crop, enhance (OpenCV)
└────────┬────────┘
         ▼
┌─────────────────┐
│ OCR Extraction   │  AWS Textract → raw text + bounding boxes
└────────┬────────┘
         ▼
┌─────────────────┐
│ Text Structuring │  Identify headings, sections, tables
└────────┬────────┘
         ▼
┌─────────────────┐
│ Chunking         │  Split into ~500 token chunks with overlap
└────────┬────────┘
         ▼
┌─────────────────┐
│ Embedding        │  Generate vector embeddings per chunk
└────────┬────────┘
         ▼
┌─────────────────┐
│ Categorisation   │  AI identifies brand, model, category
└────────┬────────┘
         ▼
    Store all outputs
```

### 3.3 RAG Q&A Pipeline

```
User Question: "What temperature for delicates?"
     │
     ▼
┌─────────────────────┐
│ Embed Question       │  Convert to vector (same model as docs)
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Vector Search        │  Find top-5 most similar chunks (pgvector)
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Context Assembly     │  Combine chunks into prompt context
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ LLM Generation       │  GPT-4o-mini generates answer
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Response Formatting  │  Answer + source citations
└──────────┬──────────┘
           ▼
Return to user:
"Wash delicates at 30°C with a spin speed of 800rpm.
 Source: Samsung WW90T Manual, Section 4.2"
```

### 3.4 Frontend Architecture (React)

```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── DocumentCard.tsx
│   │   ├── SearchBar.tsx
│   │   ├── ChatMessage.tsx
│   │   └── CategoryTree.tsx
│   ├── pages/               # Route-level pages
│   │   ├── Dashboard.tsx
│   │   ├── DocumentView.tsx
│   │   ├── Search.tsx
│   │   ├── AskAI.tsx
│   │   └── Settings.tsx
│   ├── hooks/               # Custom React hooks
│   │   ├── useDocuments.ts
│   │   ├── useSearch.ts
│   │   └── useAuth.ts
│   ├── services/            # API client
│   │   └── api.ts
│   ├── store/               # State management
│   │   └── store.ts
│   └── types/               # TypeScript type definitions
│       └── index.ts
├── public/
└── package.json
```

---

## 4. Data Model

### 4.1 Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    users     │       │    documents     │       │  categories  │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ id (PK)      │──┐    │ id (PK)          │   ┌──│ id (PK)      │
│ cognito_id   │  │    │ user_id (FK)     │◄──┘  │ name         │
│ email        │  └───▶│ category_id (FK) │      │ parent_id    │
│ display_name │       │ title            │      │ user_id (FK) │
│ created_at   │       │ brand            │      │ icon         │
│ updated_at   │       │ model            │      └──────────────┘
└──────────────┘       │ document_type    │
                       │ raw_text         │
                       │ s3_key_original  │       ┌──────────────┐
                       │ s3_key_thumbnail │       │  doc_chunks  │
                       │ file_size        │       ├──────────────┤
                       │ page_count       │       │ id (PK)      │
                       │ ocr_confidence   │   ┌──▶│ document_id  │
                       │ created_at       │───┘   │ chunk_index  │
                       │ updated_at       │       │ chunk_text   │
                       └──────────────────┘       │ section_title│
                                                  │ embedding    │ (vector 1536)
                                                  └──────────────┘

                       ┌──────────────────┐
                       │   warranties     │
                       ├──────────────────┤
                       │ id (PK)          │
                       │ document_id (FK) │
                       │ purchase_date    │
                       │ expiry_date      │
                       │ notes            │
                       └──────────────────┘
```

### 4.2 Database Schema (SQL)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    parent_id UUID REFERENCES categories(id),
    icon VARCHAR(50),
    UNIQUE(user_id, name, parent_id)
);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    document_type VARCHAR(50),
    raw_text TEXT,
    s3_key_original VARCHAR(500) NOT NULL,
    s3_key_thumbnail VARCHAR(500),
    file_size INTEGER,
    page_count INTEGER DEFAULT 1,
    ocr_confidence FLOAT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE doc_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    section_title VARCHAR(255),
    embedding vector(1536)
);

CREATE TABLE warranties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    purchase_date DATE,
    expiry_date DATE,
    notes TEXT
);

-- Indexes
CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_category ON documents(category_id);
CREATE INDEX idx_documents_fulltext ON documents USING GIN(to_tsvector('english', raw_text));
CREATE INDEX idx_chunks_document ON doc_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON doc_chunks USING ivfflat(embedding vector_cosine_ops);
```

---

## 5. API Design

### 5.1 API Endpoints

**Authentication**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create new account |
| POST | `/api/v1/auth/login` | Authenticate, receive tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/forgot-password` | Initiate password reset |
| DELETE | `/api/v1/auth/account` | Delete account and all data |

**Documents**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/documents` | Upload and process new document |
| GET | `/api/v1/documents` | List documents (paginated, filterable) |
| GET | `/api/v1/documents/{id}` | Get document detail |
| PATCH | `/api/v1/documents/{id}` | Update metadata (title, category) |
| DELETE | `/api/v1/documents/{id}` | Delete document |
| POST | `/api/v1/documents/{id}/reprocess` | Re-run OCR/AI pipeline |
| GET | `/api/v1/documents/{id}/image` | Get pre-signed URL for image |

**Search**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/search?q={query}` | Full-text + semantic search |
| GET | `/api/v1/search/suggest?q={partial}` | Autocomplete suggestions |

**AI**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/ai/ask` | Ask a question (RAG Q&A) |
| GET | `/api/v1/ai/ask/{id}` | Get previous Q&A result |

**Categories**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List user's categories (tree) |
| POST | `/api/v1/categories` | Create category |
| PATCH | `/api/v1/categories/{id}` | Update category |
| DELETE | `/api/v1/categories/{id}` | Delete category |

**Warranties**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/warranties` | List warranties (sortable by expiry) |
| POST | `/api/v1/warranties` | Add warranty to document |
| PATCH | `/api/v1/warranties/{id}` | Update warranty dates |

### 5.2 Example Request/Response

**POST `/api/v1/documents`**

Request (multipart/form-data):
```
file: [binary image data]
title: "Washing Machine Manual" (optional — AI will suggest if omitted)
category_id: "uuid" (optional — AI will assign if omitted)
```

Response (202 Accepted):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "message": "Document uploaded. OCR and AI processing in progress.",
  "estimated_time_seconds": 15
}
```

**POST `/api/v1/ai/ask`**

Request:
```json
{
  "question": "What temperature should I wash delicates at?",
  "document_ids": null
}
```

Response:
```json
{
  "answer": "According to your Samsung WW90T manual, delicates should be washed at 30°C with a maximum spin speed of 800 RPM.",
  "sources": [
    {
      "document_id": "550e8400-e29b-41d4-a716-446655440000",
      "document_title": "Samsung WW90T — User Manual",
      "section": "Programme Guide",
      "chunk_text": "Delicates: Temperature 30°C, Spin 800rpm. For silk, lace, and lightweight fabrics...",
      "relevance_score": 0.92
    }
  ],
  "confidence": "high"
}
```

### 5.3 Error Handling

All errors follow a consistent format:
```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document with id '...' not found or access denied.",
    "status": 404
  }
}
```

Standard HTTP status codes:
| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted (async processing started) |
| 400 | Validation error |
| 401 | Unauthenticated |
| 403 | Forbidden (wrong user) |
| 404 | Not found |
| 413 | File too large |
| 429 | Rate limited |
| 500 | Server error |

---

## 6. Security Design

### 6.1 Authentication Flow

```
┌────────┐                    ┌─────────┐                  ┌─────────┐
│ Client │                    │   API   │                  │ Cognito │
└───┬────┘                    └────┬────┘                  └────┬────┘
    │  POST /auth/login            │                            │
    │─────────────────────────────▶│  Verify credentials        │
    │                              │───────────────────────────▶│
    │                              │  Return tokens              │
    │                              │◀───────────────────────────│
    │  {access_token, refresh}     │                            │
    │◀─────────────────────────────│                            │
    │                              │                            │
    │  GET /documents              │                            │
    │  Authorization: Bearer xxx   │                            │
    │─────────────────────────────▶│  Validate JWT              │
    │                              │───────────────────────────▶│
    │                              │  Valid                      │
    │                              │◀───────────────────────────│
    │  {documents: [...]}          │                            │
    │◀─────────────────────────────│                            │
```

### 6.2 Data Isolation

- Every database query includes `WHERE user_id = :current_user_id`
- S3 objects stored under `/users/{user_id}/` prefix
- Pre-signed URLs generated per user, expire after 15 minutes
- No shared resources between users

---

## 7. Infrastructure Design

### 7.1 AWS Resources (Terraform)

```
terraform/
├── main.tf
├── variables.tf
├── outputs.tf
├── modules/
│   ├── networking/     # VPC, subnets, security groups
│   ├── database/       # RDS PostgreSQL
│   ├── storage/        # S3 buckets, CloudFront
│   ├── compute/        # ECS Fargate cluster, task definitions
│   ├── auth/           # Cognito user pool
│   └── monitoring/     # CloudWatch dashboards, alarms
└── environments/
    ├── dev.tfvars
    └── prod.tfvars
```

### 7.2 CI/CD Pipeline

```
Push to GitHub
     │
     ▼
┌─────────────────┐
│ Run Tests        │  pytest + coverage
└────────┬────────┘
         ▼
┌─────────────────┐
│ Lint + Type Check│  ruff + mypy
└────────┬────────┘
         ▼
┌─────────────────┐
│ Build Docker     │  Build and push to ECR
└────────┬────────┘
         ▼
┌─────────────────┐
│ Deploy to ECS    │  Update task definition, rolling deploy
└────────┬────────┘
         ▼
┌─────────────────┐
│ Health Check     │  Verify deployment succeeded
└─────────────────┘
```

---

## 8. UI/UX Design

### 8.1 Key Screens

**Dashboard (Home)**
```
┌─────────────────────────────────────┐
│  🔍 Search your documents...        │
├─────────────────────────────────────┤
│                                     │
│  Recent Documents                   │
│  ┌─────┐ ┌─────┐ ┌─────┐          │
│  │ 📄  │ │ 📄  │ │ 📄  │          │
│  │Wash │ │Boiler│ │Router│          │
│  │Mach.│ │     │ │     │          │
│  └─────┘ └─────┘ └─────┘          │
│                                     │
│  Categories                         │
│  ├── 🏠 Appliances (12)            │
│  ├── 💻 Electronics (8)            │
│  └── 📋 Documents (3)              │
│                                     │
├─────────────────────────────────────┤
│  [📷 Scan]  [🏠 Home]  [💬 Ask AI] │
└─────────────────────────────────────┘
```

**Document View**
```
┌─────────────────────────────────────┐
│  ← Back          Samsung WW90T      │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │   [Original scanned image]  │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Image] [Text] [Info]              │
│                                     │
│  Extracted Text:                    │
│  "Programme Guide                   │
│   Cotton 60°C: For durable...      │
│   Delicates 30°C: For silk..."     │
│                                     │
│  Category: Appliances > Laundry     │
│  Brand: Samsung                     │
│  Model: WW90T554DAW                 │
│  Scanned: 11 Jun 2026              │
├─────────────────────────────────────┤
│  [💬 Ask about this document]       │
└─────────────────────────────────────┘
```

**Ask AI**
```
┌─────────────────────────────────────┐
│  ← Back              Ask AI         │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🤖 Ask me anything about    │   │
│  │    your stored documents    │   │
│  └─────────────────────────────┘   │
│                                     │
│  You: What temp for delicates?      │
│                                     │
│  🤖: Wash delicates at 30°C with   │
│  a spin speed of 800rpm.            │
│                                     │
│  📎 Source: Samsung WW90T Manual    │
│     Section: Programme Guide        │
│                                     │
├─────────────────────────────────────┤
│  [Type your question...        🔊] │
└─────────────────────────────────────┘
```

### 8.2 Design Principles

- **Mobile-first** — designed for phone screens first, scales up to desktop
- **Minimal taps** — scan a document in 2 taps (camera → confirm)
- **Progressive disclosure** — show summary first, details on demand
- **Clear feedback** — loading states, progress bars during OCR
- **Accessible** — proper contrast, screen reader support, touch targets ≥ 44px

---

## 9. Deployment Architecture

### 9.1 Environments

| Environment | Purpose | Infrastructure |
|-------------|---------|---------------|
| Local | Development | Docker Compose, LocalStack, Ollama |
| Dev | Integration testing | AWS (minimal resources, auto-teardown) |
| Prod | Demo and evaluation | AWS (full stack, persistent) |

### 9.2 Docker Compose (Local Development)

```yaml
services:
  api:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/docvault
      - S3_ENDPOINT=http://minio:9000
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on: [db, minio]

  db:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      - POSTGRES_DB=docvault
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  minio:
    image: minio/minio
    ports: ["9000:9000"]
    command: server /data

  web:
    build: ./frontend
    ports: ["3000:3000"]
```

---

## 10. Design Decisions Log

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Vector DB | Pinecone, Weaviate, pgvector | pgvector | Fewer services to manage; sufficient for personal-scale data (< 100k vectors) |
| Backend language | Node.js, Go, Python | Python | Best AI/ML library ecosystem; FastAPI is performant enough |
| OCR engine | Tesseract only, Textract only, both | Both (Textract primary, Tesseract fallback) | Textract is more accurate; Tesseract for local dev and cost saving |
| Auth | Self-built, Auth0, Cognito | Cognito | AWS-native, free tier generous, saves weeks of dev time |
| Frontend framework | Next.js, Vue, React | React + React Native | Maximise code sharing between web and mobile |
| Compute | Lambda, EC2, ECS Fargate | ECS Fargate | Lambda timeout too short for OCR; EC2 requires management; Fargate is middle ground |
| Database | DynamoDB, MongoDB, PostgreSQL | PostgreSQL | Need relational joins + full-text search + pgvector in one DB |
