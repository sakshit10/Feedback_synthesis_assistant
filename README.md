# AI Product Feedback Synthesis Assistant

Turns a CSV of raw product feedback into human-reviewable themes: an AI model
proposes groupings and problem statements with citations back to the source
feedback; deterministic code — not the model — computes every count,
distribution, and time trend shown in the UI.

## Architecture

Single Next.js 14 (App Router) app, TypeScript throughout, SQLite for
persistence (via `better-sqlite3`), Claude API for the synthesis step.

```
app/
  page.tsx                     UI: upload → synthesize → review workflow
  api/
    upload/                    CSV validation + ingestion
    synthesize/                Runs the AI workflow, persists themes
    themes/                    List themes with computed stats
    themes/[id]/                rename / edit / approve / reject
    themes/[id]/merge/          merge themes together
    themes/[id]/split/          split a theme into new ones
    feedback/[themeId]/        source feedback behind a theme
    historical-notes/          seed context used for AI comparison
    report/                    save/fetch a reviewed synthesis snapshot
components/                    UI pieces (upload panel, theme card, dialogs…)
lib/
  csv.ts                       CSV parsing + validation (pure, tested)
  stats.ts                     Deterministic count/distribution logic (tested)
  claude.ts                    AI prompt + output validation (tested)
  db.ts / schema.sql           SQLite connection + schema
  logger.ts                    Structured audit logging
tests/                         Vitest unit tests for the above
```

### The core guarantee: AI proposes, code counts

The model is given a numbered list of feedback items with stable IDs and is
explicitly instructed **not** to report any counts or statistics — only to
decide which feedback IDs belong to which theme, and why.

After the model responds:
1. Its JSON is parsed defensively (`lib/claude.ts: parseModelJson`).
2. Every `cited_feedback_ids` entry is checked against the feedback IDs that
   were actually sent to it (`validateCitations`). Any ID the model
   references that doesn't exist is **dropped and logged**, never trusted.
3. `pattern_type` ("recurring" vs "isolated") is **recomputed** from the
   validated citation count (`>=2` → recurring), not taken verbatim from the
   model's own label.
4. All counts, source/user-type distributions, and monthly frequency shown
   in the UI come from SQL aggregation over the resulting
   `theme_feedback` link table (`lib/stats.ts`) — the model never supplies a
   number that reaches the screen.

The AI also never ranks or prioritizes themes; approving, rejecting,
merging, and splitting are entirely human actions.

## Setup

Requires Node.js 18+.

```bash
npm install
cp .env.example .env.local
# edit .env.local and set ANTHROPIC_API_KEY
npm run dev
```

The SQLite database file is created automatically on first request at the
path in `DATABASE_PATH` (default `./data/app.db`); no migration step needed.

A sample CSV is included at `sample-data/sample-feedback.csv` (also served
at `/sample-feedback.csv` in the running app) to try the workflow end to end.

## Tests

```bash
npm test
```

21 focused tests cover the parts where correctness matters most and where a
bug would be hardest to notice by eye:
- `tests/csv.test.ts` — header aliasing, malformed rows, optional rating handling
- `tests/stats.test.ts` — counts/distributions are scoped to the right theme, not leaked across themes; averages exclude nulls correctly; empty-theme edge case
- `tests/claude-validation.test.ts` — malformed model JSON is rejected with a clear error; hallucinated citation IDs are stripped and reported, never silently kept

## Completed scope

- CSV upload with validation (missing columns rejected up front, per-row errors reported, valid rows still ingested)
- AI theme synthesis: grouping, problem statements, rationale, historical-note comparison, citations
- Deterministic stats: count, source distribution, user-type distribution, monthly frequency, average rating
- Human review actions: rename, edit problem statement, approve, reject, merge (multi-select with target picker), split (reassign feedback into new sub-themes)
- View all source feedback behind any theme
- Historical notes panel (seed context for AI comparison, editable in-app)
- Save a reviewed synthesis report (point-in-time snapshot)
- Structured audit log (every AI and human action, with details) written to `audit_log` table and stdout
- Loading / empty / validation / success / failure states in the upload and synthesis flows

## Intentionally excluded scope (given the 3–10 hour target)

- **Auth/multi-tenancy** — single shared workspace, no login. Documented as
  the first thing to add before any real multi-user deployment.
- **Cross-chunk theme merging for very large CSVs** — a single synthesis
  call handles up to 400 feedback rows (`MAX_ITEMS_PER_CALL` in
  `lib/claude.ts`). Larger CSVs are truncated to the first 400 rows for this
  pass, with a visible notice in the UI. A production version would chunk
  the input and run a second "reconcile near-duplicate themes across
  chunks" pass.
- **Editable historical-note deletion/editing** — notes can be added but not
  edited or removed from the UI (only via direct DB access). Low-value for a
  3–10 hour scope.
- **Report export formats** — the saved report is stored as JSON and
  returned via `GET /api/report`; there's no CSV/PDF export button. Would be
  a small addition on top of the existing snapshot data.
- **Rate limiting / retry logic on the Claude call** — a failed call
  surfaces an error and offers Retry in the UI, but there's no automatic
  backoff or queuing.
- **Automated end-to-end (browser) tests** — only unit tests for the
  deterministic and validation logic; no Playwright/Cypress suite.

## Known limitations

- **Free-tier AI model variability.** `OPENROUTER_MODEL=openrouter/free`
  randomly selects among several underlying free models per request, which
  is deliberate (see AGENT_USAGE.md) so a single delisted model doesn't
  break the app. This means: response time varies (roughly 10–90+ seconds
  depending on which model is selected and current load), and the exact
  theme titles/groupings can differ slightly between runs on identical
  input, since different models phrase things differently. The *behavior
  guarantees* (citations validated against real IDs, counts computed
  deterministically, no invented statistics) hold regardless of which
  underlying free model is selected — only the AI's qualitative judgment
  varies, which is expected and by design.

## Deployment

This is a standard Next.js app; any host with a persistent filesystem and
Node 18+ works. Example (Render/Railway style):

1. Build command: `npm install && npm run build`
2. Start command: `npm start`
3. Set environment variables from `.env.example` (`ANTHROPIC_API_KEY` required)
4. Mount a persistent volume/disk if the platform doesn't provide one by
   default, and point `DATABASE_PATH` at a path inside it

If deploying frontend/backend separately (e.g. Vercel for the app), note
that Vercel's serverless functions have an ephemeral filesystem — SQLite
will not persist between invocations there. Use a host with a persistent
disk, or swap `lib/db.ts` for a hosted Postgres/SQLite-compatible service
(e.g. Turso) if you need to stay on Vercel; that swap only touches
`lib/db.ts` since all queries go through `getDb()`.

## Environment variables

See `.env.example`:
- `ANTHROPIC_API_KEY` — required, used for the synthesis step
- `ANTHROPIC_MODEL` — optional, defaults to `claude-sonnet-4-6`
- `DATABASE_PATH` — optional, defaults to `./data/app.db`
