# Demo 1 rehearsal

The synthetic fixture contains an electricity bill for €123.47, covering 1–31 October 2026, with payment due on 23 November 2026. Its statement date and smaller charge amounts test whether the review selects the labelled bill facts.

## Start a fresh local installation

Follow the root README to create a local configuration, start Docker Compose, run migrations and install the local embedding model. Open the web client, register a demo account and use the verification link in the local inbox. Both the OCR and embedding steps can run locally with €0 planned additional spend.

## Demonstrate the review

1. Open **Upload**, select [the synthetic bill](synthetic-electricity-bill.pdf), and click the upload form's **Upload** button.
2. Open the document and wait for processing to complete.
3. In **Summary → Bill review**, inspect the amount, due date and billing period. Read each exact quotation beside the candidate value.
4. Expand **Extracted Text** to compare the line references. Select **View original bill** to compare the original PDF.

| Field | Candidate | Evidence in this fixture's OCR transcript |
| --- | --- | --- |
| Amount due | €123.47 | Line 15, “Total amount due: EUR 123.47” |
| Due date | 23 November 2026 | Line 17, “Payment due date: 23 November 2026” |
| Billing period | 1 October 2026 – 31 October 2026 | Line 9, “Billing period: 1 October 2026 to 31 October 2026” |

The review derives candidates from labelled single-line OCR text. Unclear or conflicting values require inspection. The next story adds owner corrections and explicit confirmation. Line references identify the transcript, while the original-file preview enables a visual comparison. This one clean fixture establishes the demonstrated example.

## Recorded checks

On 7 November 2026, the assessed checkout in `C:\DocVault` ran in its own Docker Compose project, with separate database, storage and queue services. The local browser upload returned HTTP 201, the worker completed OCR, and the review showed all three expected values. The preview returned HTTP 200 and exactly matched the uploaded PDF bytes. The fixture SHA-256 is `232809ec6143923076e3a8492a6af32a1d131e138e2cc3ad5c8764bdbdc4a10a`.

The existing image-upload browser test now generates a second synthetic bill in memory and checks that all three displayed quotes correspond to the stated transcript lines. It exposed a deskew error that could turn a level image by 90 degrees. The correction uses image x/y coordinates and the nearest horizontal angle, with a regression check for level and tilted content.

The branch carries separately traceable commits for local email capture, amount/due-date review, billing-period review and the deskew correction. The [workflow SDD](../../specs/BILL_WORKFLOW_SDD.md) links the planned confirmed-record, allocation, reminder and natural-language stories.

Checks against code commit `57bc1cc` completed on 7 November 2026.

| Check | Result | Environment and evidence |
| --- | --- | --- |
| Backend suite | 177 passed, 73.68% coverage | Windows Python 3.11, isolated PostgreSQL test database. [Raw output](backend-checks.txt) |
| Browser suite | 11 passed | Chromium against the assessed Docker stack, including local email recovery and the image OCR review. [Raw output](browser-checks.txt) |
| Frontend unit suite | 25 passed | Windows Node 24 |
| TypeScript and production build | Passed | Windows Node 24 |
| Ruff and ESLint | Passed | Assessed checkout |

The current PC uses a local Compose override to serve this checkout at
<http://localhost:3100>, its API at <http://localhost:8100> and its test inbox at
<http://localhost:8125>. This instance has its own data volumes. The override is
stored in `%LOCALAPPDATA%\DocVault\assessed\compose.local.yml`. Start it from
`C:\DocVault` with the following PowerShell command.

```powershell
docker compose -f docker-compose.yml -f "$env:LOCALAPPDATA\DocVault\assessed\compose.local.yml" up -d
```

The dedicated synthetic account login is stored locally in
`%LOCALAPPDATA%\DocVault\assessed\Demo1\local-login.json`.
