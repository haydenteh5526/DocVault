# Security Checklist

> Last reviewed: 2026-09-14. Checked application controls are implemented and
> covered by the evidence noted below. AWS controls are separated because they
> are defined in Terraform but have not yet been verified in a live deployment.

## Authentication & Authorisation
- [x] Passwords hashed with bcrypt
- [x] Short-lived access tokens (30 min) + rotating refresh tokens (30 days / 1 day)
- [x] Token-type validation (a refresh token cannot be used as an access token)
- [x] Token-based password reset (signed, 30-min expiry; no email enumeration)
- [x] Google OAuth with signed CSRF `state`; tokens returned via URL fragment
- [x] Rate limiting on login, 2FA, register, forgot-password, reset-password
- [x] All data endpoints require authentication
- [x] Row-level isolation (users only access own documents)
- [x] Token validation on every request

## Input Validation
- [x] Email format validated (Pydantic EmailStr)
- [x] File type restricted (JPEG, PNG, WebP, PDF only)
- [x] File size limited (20MB max)
- [x] Search query minimum length enforced
- [x] UUID format validated for document IDs

## Data Protection
- [x] Pre-signed URLs are time-limited (15-min default for internal previews; user-chosen 1h–7d for share links)
- [x] Secrets via environment variables (not in code)
- [x] .env excluded from git
- [x] Account deletion removes database records and the user's object-storage prefix

## API Security
- [x] Rate limiting via slowapi
- [x] CORS configured (only allowed origins)
- [x] No sensitive data in error messages
- [x] SQL injection prevented (SQLAlchemy parameterised queries)

## Infrastructure Definition (Not Yet Live-Verified)
- [x] Terraform blocks S3 public access
- [x] Terraform places the database in private subnets
- [x] Terraform configures TLS termination through AWS-managed services
- [x] Terraform enables S3 and RDS encryption at rest
- [x] Terraform defines scoped IAM roles
- [x] No hardcoded credentials in codebase

These items confirm infrastructure-as-code intent, not deployment evidence. A
staging deployment, configuration inspection, and security smoke test are still
required before claiming the cloud controls are operational.

## Testing
- [x] Auth bypass tests (unauthenticated requests rejected)
- [x] Invalid input tests (bad email, wrong file type)
- [x] Cross-user access tests (user A can't see user B docs)
- [ ] Live AWS configuration and TLS verification
- [ ] Dynamic application security scan against staging
