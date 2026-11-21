# DocBot Redesign, PR 2 of 2: The Vault Door on the Account Pages

**Status:** approved by the owner on 21 November 2026 (decisions V4 and V5 in revision R3 of `specs/plans/2026-11-20-agent-experience.md`; the [redesign review](https://claude.ai/artifact/T92uXnst4xzik6TfqFSqJg) version 7, "Sign in like opening a vault", with its clickable preview). Revision R1 (below) changes the layout; it is built on top of the first build on the branch.

**Issue:** #35. The PR says `Part of #35`.

**Sequence:** this is PR 2. It starts after PR 1 (`2026-11-21-docbot-redesign-1-takeover-and-landing.md`) has merged, so the dark theme, the logo and DocBot's home are on `main`.

**Goal:** signing in feels like opening your vault:
- a round vault door above the sign-in card reacts as you type
- it shakes on a wrong password
- it unlocks and swings open into DocBot's home when you're in

It must never slow signing in, never hint at whether a password is right before the server answers, and never move under reduced motion. Frontend only.

## Revision R1 (21 November 2026): the whole page is the safe door

After previewing the first build (`dvvault`: a small door above the card on the old 50/50 page), the owner reopened four decisions. R1 replaces the parts of the plan named below; everything else stands.

1. **Layout (replaces "the door sits centred above the existing card" and Task 1's drawing).** `/login`, `/register` and `/forgot-password` drop the 50/50 split and the left bill preview. The full viewport is the front face of a matte-black electronic safe: `#121212` to `#1A1A1A` layers, a faint brushed grain, a 1 px machined seam, two hinges on the left edge, three locking bolts on the right edge, the Vault-Page Monogram top-left and the `Create account` / `Sign in` link top-right. The form is the recessed lock console in the middle: a status LED and label, the compact dial ring centred above the heading, then the unchanged heading, fields and buttons. New components: `SafeDoor` (stage, face, console) and `VaultDoor`, reduced to the dial ring.
2. **New words (amends decision 4).** The console shows `LOCKED`, `VERIFYING`, `INVALID` and `UNLOCKED` beside the LED, always as text, with a × or ✓ inside the LED for the last two. Headings, field labels and button names are unchanged.
3. **Timing (amends decision 2).** The open phase is 600 ms: the bolts retract for 150 ms, then the door swings for 450 ms (`rotateY(-88deg)` about the left hinge, `perspective` on the stage) in front of an amber glow. The bolts stay locked during `VERIFYING`. A refusal is a damped shake of the whole door for 0.4 s. Any key or click still skips, and `login()` is still called when the door finishes or is skipped. Under reduced motion there is no swing, spin or shake: the state changes at once and the interior fades in over 150 ms.
4. **Register (amends the Register paragraph).** "Check your email" is shown in the interior behind the door, not on the swinging face, so it stays readable once the door has opened. The face is `inert` and `aria-hidden` once open, and the "Signed in" live region sits outside it.

Deviation approved earlier and still in force: the session is stored when the door finishes or is skipped, because `App.tsx` redirects `/login` to `/app` as soon as a session exists.

## Revision R2 (21 November 2026): a heavy physical safe

After previewing R1, the owner asked for physical depth. R2 amends R1 items 1 and 3; items 2 and 4 stand.

1. **Frame and slab (amends R1 item 1).** A thick brushed-steel frame (jamb) runs round the viewport, 30 px wide (10 px below 640 px), with a dark recess and a deep shadow seam between it and the door slab. The slab has an overhead sheen, a bevelled recessed inner panel and four corner rivets. Two barrel hinges bridge the gap on the left and do not swing. Three cylindrical steel bolts run from housings on the slab into sockets in the right of the frame.
2. **Lock faceplate (amends R1 item 1).** The console is a machined faceplate bolted to the slab: four screws, a recessed dark-glass LCD bar holding the LED and the label, then the dial and a latch handle side by side above the heading. Inputs are recessed monospace entry slots with an amber focus backlight; the submit button is a raised metal key. Labels, headings and button text are unchanged.
3. **Timing (amends R1 item 3).** The open phase is 700 ms: the handle turns a quarter (0–150 ms), the bolts pull out of their sockets (100–250 ms), then the slab swings to `rotateY(-85deg)` (250–700 ms), fading over its last 120 ms. Reduced motion is unchanged: no movement, no wait. *(Superseded by R3 item 2.)*

## Revision R3 (21 November 2026): stepping inside the vault

After previewing R2, the owner asked for finer hardware and a transition that feels like walking into `/app`. R3 amends R2 items 2 and 3 and adds one change outside the account pages.

1. **Hardware (amends R2 item 2).** The dial and handle sit in a recessed hardware bay at the top of the faceplate, with a 1 px machined divider below it. The submit button is a brushed-platinum key (top bevel, crisp shadow, 1 px press). The slab gets a chamfered recess with a raised inner plate, so the areas either side of the faceplate read as thick plate.
2. **Choreography (replaces R2 item 3).** The open phase stays 700 ms. Beat 1 (0–180 ms): the LCD reads `UNLOCKED`, the handle turns 45°, the bolts pull out of the frame. Beat 2 (180–700 ms): the slab swings to `rotateY(-85deg)` while a world layer holding frame, chamber and slab scales from 1 to 1.06. The stage clips the world, so the scale never scrolls the page. Behind the slab is a dark chamber, softly lit from a ceiling lamp, ending in the app's own surface (`#0A0A0B`), in place of the bright glow.
3. **The app's entrance (new; touches `App.tsx`).** Sign-in navigates with `navigate('/app', { state: { fromVault: true } })`. `login()` stays deferred, and the two run in one `startTransition`: React Router applies navigation in a transition, so a plain `login()` rendered first and App's `/login` guard redirected without the state. A new hook, `useVaultEntrance` (`lib/vaultEntrance.ts`), gives the app shell the class `vault-entrance`, a 250 ms rise (`scale(.97)` to 1, opacity 0 to 1, backwards fill so no transform stays on the shell), and then clears the flag from history so a reload does not replay it. Under reduced motion there is no entrance. Skipping with a key or click still works.
4. **Session storage (new; touches `lib/auth.tsx`).** Because the transition holds the render until the app's code has loaded, while the URL already reads `/app`, `login()` now writes the token to `localStorage` at once (as it already did for the refresh token) instead of only in the effect after the next render. Found by the kept e2e scenario "documents list at 390 px", which read the token as soon as the URL changed.

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
