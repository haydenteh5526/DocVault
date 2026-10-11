# Context — AI Cloud Document Vault

Historical handover notes first written 2026-07-29. Machine-transfer details and
decision history remain useful, but live status is maintained in
`specs/IMPLEMENTATION_STATUS.md` and current priorities in `TODO.md`.

**Repo:** https://github.com/haydenteh5526/DocVault

DocVault starts with a fresh Git history copied from the FYP working tree on
2026-10-11, including its pending CI and end-to-end test changes. Historical
commit, PR and experiment-tag references below belong to the original
https://github.com/haydenteh5526/FYP repository, which is retained for reference.
**Timeline:** Sep 2026 – May 2027 (TUS Athlone, Software Design with AI for Cloud Computing, L8)

---

## 1. Do these before you lose the laptop

### `.env` — the only thing that can't be stored in this repo

**This repository is public.** Committing `.env` would expose your API keys to
automated scrapers within minutes, so it must not go in git — `.gitignore` now
blocks `.env` *and* every variant (`.env.local`, `.env.enc`, …) to prevent
accidents. Verified: `.env` has never been committed in any history, so nothing
is currently exposed.

Only five values actually matter. Everything else in `.env` is non-secret local
config already present in `.env.example`.

| Setting | If lost |
|---------|---------|
| `GROQ_API_KEY` | Re-issue free — console.groq.com |
| `GEMINI_API_KEY` | Re-issue free — Google AI Studio |
| `MISTRAL_API_KEY` | Re-issue free — console.mistral.ai |
| `RESEND_API_KEY` | Re-issue free — resend.com |
| `JWT_SECRET` | Any long random string; changing it only invalidates existing sessions |

Pick one:

1. **Password manager** (recommended) — paste the file contents into a secure note.
2. **Private GitHub gist**, retrievable from any machine with `gh`:
   ```bash
   gh gist create --secret .env --desc "FYP .env backup"
   gh gist list                      # later, on the new machine
   gh gist view <id> > .env
   ```
   Note: a "secret" gist is *unlisted*, not encrypted — anyone with the URL can
   read it. Fine for free re-issuable keys; weaker than a password manager.
3. **Re-issue all four keys** on the new machine. Takes ~10 minutes, all free.

Prefer option 3 if the keys were created under a work email or work-linked
account — those may not survive the internship, and re-creating them under
personal accounts avoids copying credentials off a work machine.

### `reference/` — already stored

Restored by script rather than vendored (~317 MB of third-party code, and
committing GPL/MIT projects into an academic repo invites licensing questions):

```bash
bash scripts/fetch-reference.sh    # Git Bash on Windows
```

Clones paperless-ngx, docling, quivr and kreuzberg **at the exact commits
reviewed**, so citations and line references in the report stay valid.

### Other

| # | Action | Why |
|---|--------|-----|
| 1 | Confirm your **personal** GitHub account owns/can access the repo | If access came via a work identity you could lose the remote. |
| 2 | Note any **Google OAuth** client config | `GOOGLE_CLIENT_ID`/`SECRET` and the redirect URI live in Google Cloud Console under whichever account created them. |
| 3 | ✅ *Done* — experiment branches preserved as tags | See §7. They existed only on this laptop. |

**Lost and unimportant:** Docker volumes (`pgdata`, `miniodata`) holding test
documents — re-upload a few and run `make smoke`; `node_modules` — reinstalled by
`npm install`.

---

## 2. Setup on a new machine

Prerequisites: Docker Desktop, Node.js 20+, Git, `gh` CLI.

```bash
git clone https://github.com/haydenteh5526/DocVault.git && cd DocVault

# Set a personal identity for this repo. Most existing history was authored with
# a work email that will stop existing — use a personal address going forward.
git config user.name  "Hayden"
git config user.email "your-personal@email.com"

cp .env.example .env          # then paste your saved keys in
docker compose up --build     # API :8000, db, redis, minio, ollama, worker
cd frontend && npm install && npm run dev   # http://localhost:3000
```

`.env.example` is accurate as of PR #104 — it documents the real providers and
precedence. Only `GROQ_API_KEY` and `JWT_SECRET` matter for a working demo.

### Verification commands (all confirmed working)

```bash
# Backend — 161 tests at the 2026-09-15 baseline.
docker compose exec -T api pip install -q -r dev-requirements.txt
docker compose exec -T api python -m pytest tests/ -q

# Backend lint. MUST use `python -m ruff` + `--no-cache`: the container runs as
# non-root `appuser`, so the ruff console script isn't on PATH and
# /app/.ruff_cache isn't writable.
docker compose exec -T api python -m ruff check --no-cache app/ tests/

# Frontend — 25 tests. `tsc -b` matches CI (not --noEmit).
cd frontend && npx tsc -b && npm test && npm run build

# End-to-end pipeline: register→upload→OCR→categorise→search→AI→export→cleanup (12 checks)
docker compose exec -T api python scripts/e2e_smoke.py     # or: make smoke

# Terraform (CLI not installed locally — use Docker)
docker run --rm -v "$PWD/terraform:/tf" -w /tf hashicorp/terraform:1.9 init -backend=false
docker run --rm -v "$PWD/terraform:/tf" -w /tf hashicorp/terraform:1.9 validate
docker run --rm -v "$PWD/terraform:/tf" -w /tf hashicorp/terraform:1.9 fmt -check -recursive
# then delete only terraform/.terraform; retain the committed provider lock file
```

**PowerShell notes** (if staying on Windows): `<` redirection is unsupported — use
`Get-Content file | docker compose exec -T ...`. Use `Select-Object` / `Select-String`
for filtering.

### Last verified state (2026-09-15)

| Check | Result |
|-------|--------|
| main CI | success |
| Backend | ruff clean · **161** pytest pass · 72.71% coverage (65% floor) |
| Frontend | `tsc -b` exit 0 · **25** vitest pass · build passes |
| E2E | Playwright **8** scenarios (3 axe WCAG scans) · smoke **12/12** |
| Terraform | `validate` + `fmt -check` pass (**never applied**) |
| Mobile | TypeScript clean · Expo Doctor **21/21** · CI job enabled |

---

## 3. Working practices used throughout

- **Never push directly to `main`.** Always branch → commit → PR → watch CI green →
  `gh pr merge --merge --delete-branch`. Branch protection requires `backend` +
  `frontend` checks and is `strict` (branch must be up to date).
- Verify with real tool output before claiming something works.
- Dependabot PR automation is disabled at the owner's request (2026-10-01):
  `.github/dependabot.yml` is removed and GitHub's automatic security updates
  setting is disabled. Do not recreate the schedule without an explicit request.
  Review dependency advisories manually and ship necessary updates through a
  tested maintenance PR; CI dependency audits remain enabled. Upgrade Expo
  packages together using `npx expo install --fix`, keeping React Native aligned
  with the installed Expo SDK.

---

## 4. Where deployment stands

**Nothing is deployed.** Terraform is complete and statically validated but
`apply` has never run, so none of it is confirmed against live AWS.

`terraform/` provisions: VPC (no NAT gateway), RDS Postgres 16, ECS Fargate API +
ARQ worker, ElastiCache Redis, S3 documents bucket, Secrets Manager, least-privilege
IAM (incl. Textract), an **ALB**, and an **`edge` module** (S3 frontend bucket +
CloudFront). See `terraform/COST_REVIEW.md` for the full breakdown.

### Key design decision: why CloudFront fronts everything

A public **ACM certificate can only be issued for a domain you control**, so TLS
would normally mean buying a domain. Instead CloudFront uses its default
`*.cloudfront.net` certificate — **free HTTPS, no domain**. Because the React app
calls the API with same-origin relative paths (`const BASE = '/api/v1'` in
`frontend/src/lib/api.ts`), routing `/api/*` through the same distribution also
means **no CORS config and no mixed-content errors**, and needed zero frontend changes.

### Cost reality

~$76–80/mo always-on (≈$64–68 with RDS Free Tier) — but that's the wrong frame.
Hourly it's about **$0.11**, so:

- 6-hour evidence session: **under $1**
- Full day live for the demo: **~$2.50**

**Burst-deploy**: apply → capture evidence (screenshots, CloudWatch logs, `/metrics`,
load-test output) → `terraform destroy`. Teardown is clean (`force_destroy` on both
buckets, `skip_final_snapshot` on RDS). **Set an AWS Budget alert before the first
apply.** The ALB (~$16–18/mo) is the one charge that isn't Free-Tier eligible.

### Two-phase first apply

CloudFront's domain doesn't exist until after the first apply, so:

1. `terraform apply` with `frontend_url = ""`
2. `terraform output app_url` → e.g. `https://dxxxx.cloudfront.net`
3. Put it in `terraform.tfvars` and re-apply (sets `FRONTEND_URL` for OAuth
   redirects and verification emails). Register the same URL in Google Cloud Console.

Then add GitHub repo **Variables** `FRONTEND_BUCKET` and `CLOUDFRONT_DISTRIBUTION_ID`
(from the matching `terraform output`s), **Secrets** `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY`, and set `DEPLOY_ENABLED=true`. The `deploy` job is inert
until then. Full checklist in `TODO.md` §4.

### Runtime differences on AWS

Ollama isn't deployed, so `EMBEDDING_PROVIDER=gemini`; and `OCR_BACKEND=textract`
makes OCR **pay-per-page** instead of local Tesseract. Re-run the smoke test after
deploying — behaviour differs from local.

---

## 5. Free hosting — the analysis, so you don't redo it

**First action: ask your supervisor whether TUS provides AWS/Azure credits for FYPs.**
Many departments do (AWS Academy, Azure for Education, GitHub Student Developer Pack).
That's free money that keeps you on the graded architecture.

What any free host must satisfy — this rules most of them out:

1. **pgvector** — the DB image is `pgvector/pgvector:pg16`; semantic search needs the extension
2. **Tesseract** — `backend/Dockerfile` apt-installs `tesseract-ocr` + `poppler-utils`, so you need Docker or apt access
3. **Two long-running processes** — API *and* the ARQ worker; most free tiers give one
4. Ollama wants ~1–2 GB RAM, avoidable via `EMBEDDING_PROVIDER=gemini`

### Option A — one free VM running the existing compose stack (recommended)

Simplest by far: `docker-compose.yml` already runs all 7 services, so one VM with
Docker hosts the whole app with **no code changes and one origin**.

- **Oracle Cloud Always Free** — most generous allowance (ARM Ampere, always free,
  enough RAM for Ollama too). Caveats: images must build for `arm64`, and ARM
  capacity is often exhausted in popular regions.
- **AWS Free Tier EC2 `t3.micro`** (750 h/mo for 12 months) — keeps you on AWS,
  but 1 GB RAM is tight; drop Ollama and consider offloading Postgres.

Honest trade-off: a VM running compose is **not cloud-native**. Fine as an always-on
demo host; weak as your *only* cloud story — which is why the AWS burst matters.

### Option B — managed free pieces (Neon/Supabase + Upstash + R2 + Pages)

More cloud-native, but rejected for now because:

1. **Origin split** — frontend and API on different hosts breaks the relative
   `/api/v1` assumption → absolute URL + CORS + code changes. *(Mitigation: Vercel/
   Pages rewrites can proxy `/api/*` to the backend, preserving same-origin.)*
2. **The worker has nowhere free to live.** The inline fallback exists
   (`task_queue.enqueue_document_processing()` returns `False` → `documents.py`
   processes in-request) but the pipeline takes ~25 s, which risks free-tier request
   timeouts on the most important demo action, and deletes the background-processing
   architecture the README highlights.
3. **ARQ polls Redis continuously**, burning command-quota-based free Redis tiers even when idle.
4. **Sleeping/pausing** free services = cold start or paused DB mid-viva.
5. It's a *third* architecture to defend (compose local, ECS Terraform graded, free-tier prod).

### Vercel + Supabase specifically

- **Vercel for the frontend: yes.** Free, HTTPS, CDN, and rewrites keep same-origin.
- **Vercel for the API: no.** No apt layer for Tesseract/poppler, OpenCV strains
  bundle limits, function duration caps are below the ~25 s pipeline, and there's no
  second always-on process for the worker.
- **Supabase Postgres: legitimate** — free tier has pgvector, drop-in `DATABASE_URL`,
  Alembic migrations run normally. Two gotchas: free projects **pause on inactivity**
  (wake + smoke-test before demo day), and **asyncpg + the transaction-mode pooler**
  don't get along (no prepared statements — use the direct port or disable the
  statement cache).

Free-tier terms change and couldn't be verified from this session — confirm before committing.

---

## 6. Why not Next.js / Supabase / Convex

The stack is already current: React 19.2.8, TypeScript 6, Vite 8, Tailwind v4,
FastAPI, Postgres 16 + pgvector. Next.js vs Vite is SSR-vs-SPA, not modernity — and
an authenticated vault has no SEO surface.

**You already tried it.** Tag `experiment/supabase-nextjs` (§7) is the migration.
It deleted all 13 page components (~3,400 lines: Dashboard 765, DocumentDetail 661,
Landing 520, Auth 250, AskAI 222, Search 201…), replaced them with ~220 lines of
app-router scaffolding, removed the **Playwright e2e suite** and `vitest.config.ts`,
deleted custom auth (`routers/auth.py` 264 lines + `auth_service.py`) — and never
touched `terraform/`, stranding the IaC on an architecture the app no longer used.

The structural reason: BaaS platforms **abstract away exactly what this degree
assesses** — VPC design, IaC, container orchestration, IAM, queue/worker
architecture, auth implementation. Your hand-rolled JWT rotation + TOTP + bcrypt +
rate limiting is the substance of a security chapter; Supabase Auth would delete it.
Convex would replace FastAPI/Postgres/Redis/ARQ with primitives you can't Terraform.

Practical blocker too: the AI pipeline is **Python** (Tesseract, opencv, PIL), and
`TODO.md` plans an OCR benchmark across Tesseract/Textract/PaddleOCR plus a review of
Paperless-ngx and Docling. A JS-first BaaS pushes OCR to paid APIs and kills that
comparison.

Where it genuinely wins: free always-on hosting, auth for free, far less code. If
this were a product rather than a graded artefact, it'd likely be the right call.

**For the viva** (`TODO.md` already lists "Why not Supabase?"): you have the
strongest possible answer — *"I built it; here's the diff; it cost 3,400 lines of
tested UI and my e2e suite while stranding my IaC."* An evidenced rejection beats a
stack you never evaluated.

---

## 7. Preserved experiment tags

Both branches were deleted from GitHub earlier and existed **only** as unreferenced
objects on this laptop. Now pushed as annotated tags:

| Tag | Commit | Contents |
|-----|--------|----------|
| `experiment/supabase-nextjs` | `e947ba4` | Supabase + Next.js migration, incl. `acb3ecf` (the migration) and the Groq/Gemini provider work |
| `experiment/ui-overhaul` | `183af52` | Superseded UI overhaul (sidebar redesign, rich summaries, markdown chat, mobile rewrite) |

```bash
git show acb3ecf --stat                    # what the migration changed
git checkout -b review experiment/supabase-nextjs   # explore it safely
```

---

## 8. What's been done recently (context for the report)

Two themes dominated the last stretch.

**Removing anything fake.** A non-functional **€9/mo Pro plan** was deleted from
Settings/Profile/user-menu (PR #100) — it advertised five features that didn't
exist, including handwriting OCR that `specs/REQUIREMENTS.md` line 232 explicitly
lists as *out of scope*, and mapped to no requirement at all. Also removed: a
fabricated "500 MB plan limit" storage bar (now shows real totals), and dead
`OPENAI_API_KEY` config plus an unreachable `_categorise_openai()` — the setup docs
told you to buy a key the app never uses (PR #104).

**Correcting documentation drift.** README and `specs/DESIGN.md` claimed React 18
(actual: 19.2.8). `specs/IMPLEMENTATION_STATUS.md` understated testing as 35 backend
/ 4 frontend when the verified reality is **70 / 25**, and listed the *actual* AI
provider as OpenAI GPT-4o-mini (PRs #101, #104).

The later 2026-09-14 audit removed fabricated authentication-page testimonials
and replaced absolute privacy claims with accurate provider/context wording.
README endpoint documentation is explicitly a selected subset; Swagger is canonical.
`reference/` is gitignored with 0 files tracked, so no licensing exposure.

**Deliberately left alone:** `specs/DESIGN.md`, `TASKS.md`, `REQUIREMENTS.md` still
name OpenAI. They're *planning* documents, and `IMPLEMENTATION_STATUS.md` exists to
record deviations — rewriting them would erase a design-evolution story worth
discussing. Revisit if you'd rather they match the current build.

---

## 9. Next steps

Use the priority-ordered root `TODO.md`. In summary: configure a real Q&A
provider, execute the frozen evaluation protocol,
validate mobile on physical devices, prove the AWS deployment, conduct the
consented usability study, then complete the report and demo.

### Not done / open questions

- Terraform never applied — no live-AWS confirmation of any resource
- `frontend/Dockerfile` is **dev-only** (runs `npx vite`); a production multi-stage
  build + a reverse proxy (e.g. Caddy for free TLS) is needed for the VM route
- Cognito module is provisioned but unused (app uses custom JWT + direct Google
  OAuth) — wire it up or remove it
- Mobile has static/configuration CI but no automated native-device UI suite
- Search page has no filter UI (genuinely deferred, correctly documented)
- ALB listener is HTTP; TLS terminates at CloudFront, so CloudFront→ALB is
  unencrypted inside AWS. End-to-end TLS would need a custom domain + ACM.

---

## 10. Map of the docs

| File | Contents |
|------|----------|
| `README.md` | Overview, quick start, architecture diagrams, API table, config reference |
| `TODO.md` | Priority-ordered plan across both semesters + future work |
| `TESTING.md` | Automated, full-stack, web and mobile verification guide |
| `CONTEXT.md` | This file — historical handover and decision context |
| `frontend/CONTEXT.md` | Frontend-specific design-system notes (separate, pre-existing) |
| `terraform/COST_REVIEW.md` | AWS footprint, costs, caveats, teardown strategy |
| `specs/REQUIREMENTS.md` | Functional/non-functional requirements, constraints, scope |
| `specs/DESIGN.md` | Architecture and technology decisions (original plan) |
| `specs/TASKS.md` | Work breakdown, estimates, risk register |
| `specs/IMPLEMENTATION_STATUS.md` | Canonical verified current state and known gaps |
| `specs/ARCHITECTURE.md` | Current as-built runtime and security boundaries |
| `specs/TRACEABILITY.md` | Requirements mapped to evidence and gaps |
| `specs/EVALUATION_PLAN.md` | Frozen research questions and experimental protocol |
| `specs/USABILITY_TEST_PLAN.md` | Consent, tasks, SUS and analysis procedure |
