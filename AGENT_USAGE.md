# Agent Usage

## Tools used

Claude (Sonnet, via the Claude.ai chat interface with a code sandbox) was
used as the primary coding agent for this submission, end to end: scaffolding,
schema design, API routes, UI components, tests, and this documentation.

**Before submitting, personalize this file** with your own account of what
you reviewed, changed, or would explain differently — you're expected to be
able to discuss any part of the implementation in the follow-up interview,
so treat this document as a starting point, not a substitute for actually
reading the code.

## Representative prompts

- "Build the AI Product Feedback Synthesis Assistant (Option A). Next.js
  full-stack, one repo. AI provider: your pick. I'll deploy it myself."
- (Implicit, from the assignment brief, given directly to the agent) the
  full problem statement: CSV schema, required AI workflow steps
  (group/identify/distinguish/compare/propose/cite), required deterministic
  calculations, required human actions (rename/merge/split/reject/approve),
  and the constraint that the AI must not invent feedback counts or
  prioritize the roadmap.
- Follow-up: "continue" (used to keep building across the multi-step session
  — scaffold → schema → API routes → UI → tests → docs).

## Work delegated to the agent

- Full project scaffold (package.json, tsconfig, Tailwind/PostCSS config)
- Database schema and SQLite connection layer
- CSV parsing/validation with header-aliasing and per-row error reporting
- The Claude API prompt for theme synthesis, and — critically — the
  **validation layer that treats model output as untrusted**: JSON parsing
  with a defensive fence-stripping fallback, and citation-ID cross-checking
  against real feedback rows before anything is persisted
- The deterministic stats module (counts/distributions/frequency) and its
  test suite
- All UI components (upload flow, theme review cards, merge/split dialogs,
  feedback drawer) and the page-level state machine (upload →
  ready_to_synthesize → synthesizing → review → synthesis_failed)
- Vitest test suite (21 tests) for CSV validation, stats computation, and
  AI-output validation

## A design point the agent got right that's worth understanding for the interview

The "AI must not invent feedback counts" requirement is enforced three
separate ways, not just by asking the model nicely in the prompt:
1. The system prompt explicitly forbids the model from stating any numbers.
2. Every citation the model returns is checked against the actual feedback
   IDs sent to it; unrecognized IDs are dropped and logged
   (`validateCitations` in `lib/claude.ts`, unit-tested in
   `tests/claude-validation.test.ts`).
3. The "recurring vs. isolated" classification shown in the UI is
   **recomputed** from the validated citation count, not read from the
   model's own label — so even if the model's qualitative judgment is
   sloppy, the label on screen is still grounded in a real count.

## An agent mistake and how it was caught

Initial `package.json` pinned `next@14.2.15`, which the agent had used from
memory. Running `npm install` surfaced an npm warning that this version has
a known security vulnerability. The agent queried the npm registry for
available patch versions (`npm view next versions`), bumped to `14.2.35`
(latest patched 14.2.x), reinstalled, and reran the build to confirm nothing
broke. This is a good example of why "the agent said it works" isn't
sufficient — the fix was only caught because the install step's own output
was read, not assumed clean.

Separately, the initial `npm run build` produced a font-optimization
warning (`Failed to minify the stylesheet for fonts.googleapis.com`). This
is expected and harmless: it's Next.js's build-time font-inlining step
failing because the sandbox's network egress doesn't allow
`fonts.googleapis.com` — it will not occur in a normal deployment
environment with outbound internet access, since the app already falls back
to a runtime `<link>` tag for the same font stylesheet.

## Rejected / not-taken suggestions

- The agent's default instinct for a "themes" data model was a strict
  one-feedback-item-belongs-to-exactly-one-theme relationship. This was
  changed to a many-to-many link table (`theme_feedback`) instead, since a
  single piece of feedback can legitimately describe two distinct problems
  (e.g. "the export button spins forever AND the currency shown is wrong")
  — forcing one theme per item would have silently dropped valid signal.
- `npm audit fix --force` was **not** run, because it would have forced a
  major-version bump of Next.js (14 → 16) and `uuid` (9 → 14) as part of a
  scope that's meant to be a 3–10 hour mini-project. The remaining
  advisories are transitive/build-time (see README "Known limitations") and
  were judged lower-risk than an untested major-version migration under time
  pressure — a call worth explaining and defending in the interview, and
  worth revisiting for a real production deployment.

## How generated output was verified

Every claim about the code working is backed by an actual run, not just
generation:
- `npm install` — run, output read for warnings/errors (caught the Next.js
  vuln above)
- `npm run build` — run to completion, confirming TypeScript type-checking
  and Next.js compilation both pass with zero errors
- `npx vitest run` — run to completion: 21/21 tests passing across CSV
  validation, deterministic stats, and AI-output validation
- The production server was started and hit with real HTTP requests
  (`curl`) for the upload endpoint, themes list endpoint, and historical
  notes endpoint, confirming the actual request/response cycle works, not
  just that the code compiles
- The `/api/synthesize` endpoint (the only one requiring a live
  `ANTHROPIC_API_KEY`) was **not** exercised against the real Claude API in
  this environment, since no key was available in the build sandbox. **You
  should run a real synthesis pass yourself before submitting** — upload
  `sample-data/sample-feedback.csv`, click "Run AI synthesis", and confirm
  the themes it proposes look reasonable, and note the result here.

## Known agent limitation to flag in the interview

The agent has not visually reviewed the UI in an actual browser (only via
`curl` against API routes and a successful production build/type-check).
Do a pass in a real browser before submitting to catch anything the
type-checker and API tests wouldn't: layout issues, the merge/split dialogs'
usability, and whether the loading/empty/error states look right in
practice.
