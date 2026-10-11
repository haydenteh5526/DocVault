# Terraform Cost & Demo-Readiness Review

**Reviewed:** 2026-07-23 · **Updated:** 2026-07-24 (gaps filled) · **Scope:** `terraform/`
**Verification:** `terraform validate` + `terraform fmt -check` pass (run via the
`hashicorp/terraform:1.9` Docker image). **No `apply`/`destroy` was run** — this
remains a static review; figures are rough monthly estimates for a single
always-on environment in `eu-west-1` and will vary by region and usage.

---

## What the Terraform provisions

| Module | Resource | Notes |
|--------|----------|-------|
| networking | VPC, 2 public + 2 private subnets, Internet Gateway, public route table | **No NAT gateway** (see below) |
| database | RDS PostgreSQL 16, `db.t3.micro`, 20 GB, single-AZ, private | `skip_final_snapshot = true` |
| compute | ECS Fargate cluster + **API** service + **worker** service (each 0.5 vCPU / 1 GB), **ALB**, ElastiCache Redis, Secrets Manager, CloudWatch logs (14d) | API tasks reachable **only via the ALB**; Redis in private subnets |
| storage | S3 bucket (AES256, public access blocked, `force_destroy`) | Document storage |
| edge | **S3 frontend bucket + CloudFront distribution** | Public HTTPS front door; SPA + `/api/*` on one origin |
| auth | Cognito user pool + client | **Currently unused by the app** |

## Estimated monthly cost (always-on)

| Item | Estimate |
|------|----------|
| RDS `db.t3.micro` (on-demand) | ~$12 (or **$0** under 12-month Free Tier) |
| RDS storage (20 GB gp2) | ~$2.50 |
| Fargate — API (0.5 vCPU + 1 GB) | ~$16 |
| Fargate — worker (0.5 vCPU + 1 GB) | ~$16 |
| ElastiCache `cache.t3.micro` (1 node) | ~$12 |
| **Application Load Balancer** | **~$16–18** (not Free-Tier eligible) |
| CloudFront (`PriceClass_100`) | ~$0 at demo traffic (generous free allowance) |
| S3 frontend bucket | <$0.10 (a few MB of static assets) |
| Secrets Manager (1 secret) | ~$0.40 |
| S3 documents + CloudWatch Logs + Cognito | ~$1–2 (Cognito free < 50k MAU) |
| NAT gateway | **$0 — none provisioned** |
| ACM certificate | **$0 — none needed** (CloudFront default cert) |
| **Total** | **~$76–80/mo** (≈$64–68/mo if RDS is Free-Tier eligible) |

The NAT gateway trap (~$32/mo each) is still deliberately avoided. The ALB is now
present because it is unavoidable for a stable HTTPS endpoint: CloudFront needs a
fixed origin, and Fargate task IPs change on every redeploy.

**Verify current prices with the [AWS Pricing Calculator](https://calculator.aws)
and the [Free Tier page](https://aws.amazon.com/free) — AWS pricing and free-tier
terms change, and these figures are rough estimates for `eu-west-1`.**

## Why HTTPS costs nothing here

A public ACM certificate can only be issued for a domain you control, so TLS
would normally mean buying a domain. Instead the CloudFront distribution uses its
**default `*.cloudfront.net` certificate**, which provides HTTPS at no cost and
with no domain registration. Because the React app calls the API with same-origin
relative paths (`const BASE = '/api/v1'`), routing `/api/*` through the same
distribution also removes any need for CORS configuration and avoids
mixed-content errors — the browser only ever sees one HTTPS origin.

## Cost-smart choices ✅

- **No NAT gateway.** RDS and Redis sit in private subnets (no internet needed);
  the ECS tasks run in public subnets with `assign_public_ip = true`, reaching
  the internet (Textract, Gemini, S3) via the Internet Gateway. Biggest saving.
- **Single-AZ RDS** on `db.t3.micro` and a single-node `cache.t3.micro` Redis.
- **`skip_final_snapshot`** on RDS and **`force_destroy`** on S3 → fast, clean teardown.
- **CloudWatch log retention capped at 14 days.**

## ✅ Gaps closed (2026-07-24)

The IaC now deploys the *real* app rather than an API-only skeleton:

1. **ARQ worker service added** — a second Fargate service runs
   `arq app.worker.WorkerSettings` with the same image and env, so background
   OCR / categorisation / embedding / the warranty cron run properly (no reliance
   on the inline fallback).
2. **Redis via ElastiCache** — `cache.t3.micro` in private subnets, reachable only
   from the ECS security group; `REDIS_URL` is wired into both services.
3. **AI + secrets wired via Secrets Manager** — `DATABASE_URL`, `JWT_SECRET`,
   `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `RESEND_API_KEY`, and the
   Google OAuth pair are stored in one secret and injected as container `secrets`
   (never plaintext in the task definition). `EMBEDDING_PROVIDER=gemini` is set
   because Ollama isn't deployed on AWS, so embeddings use Gemini.
4. **Textract IAM** — the task role now has `textract:DetectDocumentText` /
   `AnalyzeDocument` (the task defs set `OCR_BACKEND=textract`).
5. **S3 via IAM task role** — the S3 client (app code) now falls back to the
   default credential chain and the deployment region when no explicit endpoint /
   keys are set, so on AWS it uses the task role instead of static keys. Local
   MinIO behaviour is unchanged (docker-compose still provides the env).
6. **S3 `force_destroy = true`** — `terraform destroy` no longer stalls on a
   non-empty bucket.

## ⚠️ Remaining caveats

- **Two-phase first apply.** CloudFront's domain isn't known until it exists, so
  `frontend_url` starts blank; after the first apply, set it to
  `terraform output app_url` and re-apply so the API emits correct absolute URLs
  for OAuth redirects and verification emails. The same URL must be registered as
  the Google OAuth redirect URI.
- **Unused Cognito module.** The app uses custom JWT + direct Google OAuth, so the
  Cognito user pool is vestigial. Harmless (free) but misleading — wire it up or
  remove it.
- **ALB listener is HTTP.** TLS terminates at CloudFront; CloudFront → ALB travels
  unencrypted inside AWS. Acceptable for a demo, but end-to-end encryption would
  need an ACM certificate on the ALB, which requires a custom domain.
- **No WAF.** Edge protection relies on app-level rate limiting.
- **`db_password` still flows through Terraform state** (used to build
  `DATABASE_URL`). Keep the state backend private/encrypted.
- **Textract is pay-per-page.** Task definitions set `OCR_BACKEND=textract`
  because Tesseract-quality OCR isn't bundled in the deployed image path; this is
  a per-request cost, unlike local Tesseract.

## Recommendations

### Keep cost low for FYP demos
1. **Tear down between demos:** `terraform destroy` (fully reproducible; S3
   `force_destroy` and RDS `skip_final_snapshot` make this clean).
2. **Or scale to zero:** set both ECS services' `desired_count = 0` and stop RDS
   when idle (RDS can be stopped up to 7 days). ElastiCache can be deleted/re-created.
3. **Set an AWS Budget alert** (e.g. $20) on day one — the most important guardrail.
4. Consider **Fargate Spot** for the worker (~70% cheaper) — brief interruptions
   are fine for background processing.

### Bottom line
The Terraform now describes a **complete, publicly reachable deployment** of the
full app — a CloudFront HTTPS front door serving the React SPA from S3 and
proxying `/api/*` to an ALB-fronted ECS API, plus the ARQ worker, Postgres,
Redis, and S3, with secrets in Secrets Manager and least-privilege IAM. Validated
with `terraform validate` / `fmt -check`. **No `apply` has been run** — nothing
here is confirmed against live AWS.

Cost is ~$76–80/mo always-on (≈$64–68 with RDS Free Tier), but the intended usage
for an FYP is **burst deployment**: apply, capture evidence, `terraform destroy`
(clean teardown via S3 `force_destroy` on both buckets and RDS
`skip_final_snapshot`). Set an **AWS Budget alert before the first apply**.
Deploying requires user-supplied values (`db_password`, `jwt_secret`, AI keys) via
`terraform.tfvars` — see `terraform.tfvars.example`.
