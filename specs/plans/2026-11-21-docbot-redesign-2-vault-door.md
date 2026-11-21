# DocBot Redesign, PR 2 of 2: The Vault Door on the Account Pages

**Status:** approved by the owner on 21 November 2026 (decisions V4 and V5 in revision R3 of `specs/plans/2026-11-20-agent-experience.md`; the [redesign review](https://claude.ai/artifact/T92uXnst4xzik6TfqFSqJg) version 7, "Sign in like opening a vault", with its clickable preview). Nothing in it is implemented.

**Issue:** #35. The PR says `Part of #35`.

**Sequence:** this is PR 2. It starts after PR 1 (`2026-11-21-docbot-redesign-1-takeover-and-landing.md`) has merged, so the dark theme, the logo and DocBot's home are on `main`.

**Goal:** signing in feels like opening your vault:
- a round vault door above the sign-in card reacts as you type
- it shakes on a wrong password
- it unlocks and swings open into DocBot's home when you're in

It must never slow signing in, never hint at whether a password is right before the server answers, and never move under reduced motion. Frontend only.

## Decisions (approved; do not reopen)

1. **Pages:** sign-in, register, two-factor and forgot password get the door. Reset password and verify email don't.
2. **Timing:** the API call starts at once. On success, the door runs at most 0.9 s from submit before navigating; any key or click skips it.
3. **Motion:** CSS transforms and transitions only. No new library. Under `prefers-reduced-motion` the state is shown at once and navigation isn't delayed.
4. **Words:** headings, labels and button names stay exactly as they are: "Welcome back", "Create an account", "Two-factor authentication", "Check your email", "Sign in", "Create account" and the field labels. The tests and screen readers rely on them.

## Global constraints

- Test first. No AI or tool attribution. No new dependency. €0. Synthetic data and disposable stacks only; never `dvdemo`, `dvfriday` or the owner's account.
- **Auth behaviour is unchanged:** the same API calls, error handling, token storage, two-factor flow, redirects and rate-limit message (PR 39's "Too many attempts. Wait a minute, then try again." where it applies).
- **Kept e2e lines:** `e2e/signInSubmit.ts` and every sign-in scenario pass unchanged. The one allowed edit: if the success delay makes a `waitForURL` timeout too short, raise that timeout in `signInSubmit.ts` only, and the PR says so.
- **Accessibility:** the door is decorative (`aria-hidden`). A polite live region announces "Signed in". Focus order is unchanged. Nothing flashes more than three times a second.
- **The reviewer** is `reviewer-deep`, because the change touches the sign-in flow.

## Task 1: The `VaultDoor` component

- **File:** `frontend/src/components/VaultDoor.tsx`.
- **Interface:**

  ```ts
  export type VaultState = 'closed' | 'entering' | 'error' | 'unlocking' | 'open'
  export function VaultDoor({ state, progress = 0, badge }: { state: VaultState; progress?: number; badge?: 'key' | 'second-ring' }): JSX.Element
  ```

- **Drawing:** inline SVG, `viewBox="0 0 170 170"`, 132 px at 1024 px and up and 104 px below. The geometry is the review's `vault-door` symbol:
  - outer ring `#26262B`, stroke `#3A3A40`
  - inner plate `#1C1C20`
  - hinge block on the left
  - two bolts `#8C8C93` at the sides
  - a centre dial with eight spokes, a yellow `#FFD83D` hub and a yellow marker
  - behind the door, a warm radial glow (`#FFE98A` to `#FFC23D` to transparent), visible only when it's open
- **States** (classes on the root, CSS only):
  - `closed`: at rest
  - `entering`: the dial turns `progress × 12°` (`progress` = the password length, capped at 30), with a 0.12 s transition
  - `error`: two 5 px horizontal shakes, 0.16 s each
  - `unlocking`: the bolts slide 10 px inward and the dial turns to 270° over 0.45 s
  - `open`: `unlocking`'s end state plus the door turning `rotateY(-105deg)` about its hinge edge (`transform-origin: 6% 50%`, `perspective: 600px`) over 0.45 s, with the glow fading in
  - `badge="key"`: a small key icon on the plate
  - `badge="second-ring"`: a thin second ring around the dial that turns 360° once on `unlocking`
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` sets `transition: none` and `animation: none`, so each state appears at once.
- **Accessibility:** `aria-hidden="true"` on the root.
- [ ] **Tests first** (`VaultDoor.test.tsx`):
  - each state sets its class
  - `progress` sets the dial's rotation style (capped at 30 × 12°)
  - each badge renders
  - `aria-hidden`
  - with reduced motion mocked, the root has the class `vault-still`, which the CSS uses to turn transitions off
- [ ] Commit: `Draw the vault door and its states`

## Task 2: The door on the account pages

- **Files:** `frontend/src/pages/Auth.tsx` (sign-in, register and the two-factor step), `ForgotPassword.tsx`, `Auth.test.tsx`, a new `ForgotPassword.test.tsx` case, and `lib/useReducedMotion.ts` (new, if none exists: `matchMedia('(prefers-reduced-motion: reduce)')` with a change listener).
- **Layout:** the door sits centred above the existing card. The card, headings, fields and buttons are unchanged.
- **Sign-in:**
  - Typing the password sets `entering` with `progress = password.length`. Clearing it returns to `closed`. The email field doesn't move the dial.
  - Submitting calls the API at once, exactly as today, and sets `unlocking`.
  - **Success:**
    - set `open`, announce "Signed in" in a polite live region, and navigate to `/app` after 450 ms
    - a keydown or pointerdown during that wait navigates at once
    - under reduced motion, navigate with no wait
    - the session is stored before the door opens, so a skip can't race the token
  - **Failure:** set `error`, show the existing message as today, then return to `closed` after 0.4 s. Under reduced motion, return at once.
  - **Two-factor required:** the existing step appears, the door shows `badge="second-ring"` and stays `unlocking`, and a correct 6-digit code continues to success as above.
- **Register:** after the account is created, `unlocking`, then `open` for 450 ms, then the existing "Check your email" screen (no navigation).
- **Forgot password:** the door stays `closed` with `badge="key"`.
- **Honesty:** the door reflects only the number of characters typed, which the masked field already shows. Its state changes only after the server answers.
- [ ] **Tests first** (`Auth.test.tsx`, with fake timers and mocked API calls):
  - typing a password moves the dial, and clearing it closes the door
  - success navigates to `/app` after 450 ms, and the live region says "Signed in"
  - a key press during the wait navigates at once
  - under reduced motion, navigation is immediate
  - a failure shows the existing error text and the `error` state, then `closed` after 400 ms
  - the API is called once, immediately on submit (no delay before the request)
  - the two-factor step shows the second ring
  - register shows "Check your email" after the door opens
  - `ForgotPassword.test.tsx`: the key badge is shown
  - every existing assertion passes unchanged
- [ ] Commit: `Open a vault door when you sign in`

## Task 3: Check, record and review

- [ ] Playwright on a disposable stack. All sign-in, register, password-reset and two-factor scenarios pass. Record the run, and any `signInSubmit.ts` timeout change with its reason.
- [ ] A short screen recording or four screenshots (closed, entering, error, open) at 1366 px into `evaluation/docbot-redesign/vault/`, plus one at 390 px.
- [ ] Update `specs/Repo_Current_State.md` with a verified-results row. Gates: `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
- [ ] Call `reviewer-deep` with this plan, issue #35 and the review's sign-in section. It checks in particular that:
  - no request is delayed
  - the door never reflects correctness before the server answers
  - nothing moves under reduced motion
  - the kept words and e2e lines are unchanged

  Show the owner the full report, fix only what he approves, and open the PR from `feature/docbot-vault-door`, cut from `main` after PR 1 merges. It merges under the `AGENTS.md` merge rule on the owner's approval.

## Acceptance checks

| # | Check | Verified by |
| --- | --- | --- |
| 1 | Signing in shows a vault door that unlocks and opens into DocBot's home within 0.9 s of submit, and any key skips it | `Auth.test.tsx` (timers, skip) |
| 2 | Signing in is never delayed: the request starts at once, and the token is stored before the door opens | `Auth.test.tsx` (call timing) |
| 3 | A wrong password shakes the door and shows the existing message. The door never hints at correctness before the server answers | `Auth.test.tsx`; Reviewer |
| 4 | Under reduced motion nothing moves and nothing waits | `VaultDoor.test.tsx`; `Auth.test.tsx` |
| 5 | Register, two-factor and forgot password show their door variants | `Auth.test.tsx`; `ForgotPassword.test.tsx` |
| 6 | All headings, labels, buttons and existing sign-in e2e lines are unchanged | Gates; Playwright; Reviewer |
