# Auth: complete the SafeDoor screens and harden tokens — Implementation Plan

**Status:** proposed on 21 November 2026 and approved by the owner the same day with decisions D1 to D5 as written below. Phase 1 (`ced80a5`) and Phase 2 are built on `feature/auth-complete-safedoor`; review, hosted CI and the owner's real-email pass are next. Phase 2 adds one change agreed in the build: the register confirmation's resend starts with its countdown running, because registration has just sent a link and the server would otherwise drop an early click.

**Evidence that led here:** a live real-email run on the local `dvauth` stack on 21 November 2026 (Resend, the owner's student inbox). Sign-up, verification, sign-in through the SafeDoor, forgot password and reset all worked. The audit and the run found these gaps:
- no way to resend a verification email, and the 403 on sign-in offers no way forward
- verification links never expire, although the error says "Invalid or expired"
- reset links can be reused for 30 minutes, and a reset leaves existing sessions signed in
- `reset_password` repeats the length check its validator already makes
- L-pre-1 (recorded in PR #44): a request in flight, followed by a switch between sign-in and register, finishes on the other page
- "Forgot password?" appears only after the email step
- `/reset-password`, `/verify` and `OAuthCallback` still use the old plain pages; the reset page's label overlaps the field's focus border and its eye icon sits too high
- confirmation states use bright `bg-green-50` squares, and the forgot-password door still says LOCKED after a link is sent

## Owner polish pass (21 November 2026, after reviewing the Phase 2 screens)

- Remove the recessed icon squares: the SafeDoor LCD is the single status indicator. `RecessedBadge` is deleted.
- Every forward action uses the brushed-metal primary style (`.safe-primary`); only Back to sign in keeps the dark outline.
- Unmet password rules show a muted hollow ring.
- The Google callback's failure label is FAILED.
- Every door page fits 1366 x 768 without a page scroll (the register password step excepted, as on `main`).

## Review fixes (owner-approved 22 November 2026, after reviewer-deep on `fc5a73a`)

- M1: the resend countdown is shared per email address across the tab (sessionStorage), started by registration, resends and forgot-password, so no page offers a click the server would drop; the generic reply now reads "If that account still needs verifying, a new link is on its way. We send at most one a minute."
- L1: resend locks the account row, so two requests at once send one link. L2: the verification email goes out as a background task after the reply.
- L3: the migration backfills `timezone('utc', now())`. L4: tests for the Google callback's version, a deleted account and a reset token used as a bearer.
- Nits: plan and evidence wording, per-IP limit wording, password length in code points, and the register confirmation's scroll and button.
- Not taken (owner decision): a keyword-only `version` argument. The three issues already on `main` go to a separate session.

## Decisions (approved 21 November 2026)

- **D1, revocation:** every request checks the token's `ver` claim against `users.token_version`. Every token-issuing path passes `user.token_version` explicitly: login, 2FA login, Google callback, refresh and the forgot-password reset token.
- **D2, verification:** links expire after 24 hours. Resend has a 60-second cooldown on the server and the same 60 seconds in the UI, so a success message never hides a dropped email. The forgot-password resend uses the same 60-second countdown (its server limit is 5 requests a minute per IP address).
- **D3, structure:** one PR on `feature/auth-complete-safedoor`, built in two phases (backend first, then the UI). The owner accepts that it exceeds the 250-line guideline. `reviewer-deep` reviews the whole PR before merge.
- **D4:** the unused `COGNITO_*` settings stay for a later clean-up.
- **D5:** the Resend sender stays `onboarding@resend.dev`.

## Phase 1: backend hardening, API client and environment

### Migration `020_auth_token_version.py`
- `users.token_version INTEGER NOT NULL DEFAULT 0` (server default `0`).
- `users.verification_sent_at TIMESTAMP NULL`.
- Backfill: `verification_sent_at = now()` where `verification_token IS NOT NULL`, so links already sent keep working for 24 hours.
- Downgrade drops both columns.

### Tokens (`services/auth_service.py`)
- `create_access_token(user_id, version=0)`, `create_refresh_token(user_id, remember_me=False, version=0)` and `create_password_reset_token(user_id, version)` put `ver` in the payload.
- `decode_token_claims(token, expected_type)` returns `(user_id, version)`; a token without `ver` counts as version 0, so sessions issued before the change stay valid. `decode_token` keeps its signature and returns the user id.
- `verify_password_reset_token(token)` returns `(user_id, version)` or `None`.

### Request check (`dependencies.py`)
- `get_current_user_id` depends on `get_db`, reads the claims, then selects `User.token_version` by primary key. A missing user or a different version returns 401 "Invalid token".

### Routes (`routers/auth.py`)
- `login`, `login_2fa`, `oauth_google_callback` and `refresh` pass `user.token_version`. `refresh` also rejects a token whose `ver` differs.
- `forgot_password` mints the reset token with `user.token_version`.
- `reset_password`: a missing user or a version mismatch returns 400 "Invalid or expired reset link". On success it saves the new hash and increments `token_version`, which makes the link single use and signs out every session. The duplicate `len < 8` check goes.
- `register` stores `verification_sent_at`.
- `verify_email`: past `VERIFICATION_EXPIRY_HOURS` it returns 400 "This verification link has expired. Request a new one."
- New `POST /auth/resend-verification {email}`, limited to 3 a minute. It always answers 200 "If that account still needs verifying, we've sent a new link." It sends only when the account exists, is unverified and its last link is at least `VERIFICATION_RESEND_COOLDOWN_S` (60) old; a new link replaces the old one.

### Settings (`config.py`)
- `VERIFICATION_EXPIRY_HOURS: int = 24`, `VERIFICATION_RESEND_COOLDOWN_S: int = 60`.

### API client (`frontend/src/lib/api.ts`)
- `class AuthError extends Error { status: number }`, thrown by `loginUser`, `resetPassword` and `resendVerification`.
- `resendVerification(email)`.
- `verifyEmail` result gains `status` so the page can tell an expired link (400) from a server failure.

### Environment
- `.env.example` regrouped into core, storage, auth, email, AI, observability and Google sign-in, with placeholders only. Adds the defaults for `S3_PUBLIC_ENDPOINT`, `JWT_EXPIRY_MINUTES`, `REFRESH_TOKEN_EXPIRY_DAYS`, `REFRESH_TOKEN_EXPIRY_DAYS_SHORT`, `VERIFICATION_EXPIRY_HOURS`, `VERIFICATION_RESEND_COOLDOWN_S`, `ANSWER_MODEL`, `ASSISTANT_TIMEOUT_S` and `AWS_REGION`.
- README environment table and `specs/Repo_Current_State.md` updated.
- The owner's local gitignored `.env` follows the same layout. Secrets stay in place, and the MinIO lines become the RustFS defaults (Docker Compose overrides the storage settings for the containers in any case).

### Phase 1 tests (`backend/tests/test_auth_hardening.py`, written first)
- Resend: an unknown email, a verified account and a request inside the cooldown all get the generic reply and send nothing; an eligible request sends a new link and the old token stops working.
- An expired verification link returns 400; a fresh one returns 200.
- A reset link works once; the second use returns 400.
- After a reset, the old access token gets 401 on `/auth/me` and the old refresh token gets 401 on `/auth/refresh`.
- Signing in after a reset mints a `ver=1` token that succeeds on `/auth/me` and `/auth/refresh`.
- A token with no `ver` claim still works for a version-0 account.
- A short new password still gets 422.

## Phase 2: SafeDoor screens

- **`SafeDoor.tsx`:** optional `status={ label, led }` replaces the default label; new blue `sent` light in `SafeDoor.css`.
- **`RecessedBadge.tsx` (new; removed again in the owner polish pass):** a dark recessed square with a translucent emerald, red or amber fill and border. It replaces every `bg-green-50` and `bg-red-50` square on the auth screens, including the register confirmation.
- **`PasswordRules.tsx` (new):** the checklist moved out of `Auth.tsx`, matching `check_password_rules` (8 to 128 characters, upper, lower, number, special). Password fields get `maxLength={128}`.
- **`Auth.tsx`:** "Forgot password?" on the email step of `/login`; a 403 shows "Resend verification email"; the register confirmation gets "Resend email" with a 60-second countdown; L-pre-1 fixed with a `requestId` ref bumped on every mode change, so a stale sign-in, registration or 2FA response, and its `finally`, are ignored.
- **`ForgotPassword.tsx`:** after submit the LCD shows a blue light and CHECK EMAIL, with the copy still "If an account exists…"; below "Back to sign in", "Resend link" (60-second countdown) and "Try a different email".
- **`ResetPassword.tsx`:** inside SafeDoor; label outside the positioned wrapper and the eye icon centred on the input; typing turns the dial, submit shows UPDATING, an error shakes INVALID, success shows UPDATED with the emerald badge and a Sign in button (no automatic redirect); a 400 shows an invalid, expired or already-used panel with "Request a new reset link".
- **`VerifyEmail.tsx`:** VERIFYING, then VERIFIED or EXPIRED/INVALID; an expired or invalid link offers an email field and "Send a new link" with the 60-second countdown.
- **`OAuthCallback.tsx`:** SIGNING IN while it works; errors inside SafeDoor with the recessed badge.

### Phase 2 tests
- Vitest: `Auth.test` (forgot link on the email step, L-pre-1, 403 resend), `ForgotPassword.test` (CHECK EMAIL, countdown, different email), `SafeDoor.test` (custom status), new `ResetPassword.test`, `VerifyEmail.test` and `OAuthCallback.test`.
- Playwright: `password-reset.spec.ts` and `vault-door.spec.ts` updated.
- Live on `dvauth` with real email: resend, an expired link (by moving `verification_sent_at` back in the test database), reset followed by a 401 on the old session, and every new screen at 1366 and 390 px.

## Gates
- `backend/`: Ruff, pytest with the 65% coverage floor, migration round trip.
- `frontend/`: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`, Playwright.
- `reviewer-deep` on the full PR, with its report and the fixes recorded in the PR description.
