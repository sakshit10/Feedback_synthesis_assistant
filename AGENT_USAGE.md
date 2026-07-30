# Agent Usage

## Tools used

Claude (Sonnet, via the Claude.ai chat interface with a code sandbox) was
used as the primary coding agent for this submission: scaffolding, schema
design, API routes, UI components, tests, live deployment debugging, and
this documentation.

**Before submitting, make sure you can personally explain every section
below** — you're expected to discuss any part of the implementation in the
follow-up interview, so treat this as a factual record of what happened,
not a substitute for understanding the code yourself.

## Representative prompts

- "Build the AI Product Feedback Synthesis Assistant (Option A). Next.js
  full-stack, one repo. AI provider: your pick. I'll deploy it myself."
- (Implicit, from the assignment brief) the full problem statement: CSV
  schema, required AI workflow steps, required deterministic calculations,
  required human review actions, and the constraint that the AI must not
  invent feedback counts or prioritize the roadmap.
- "guide me — I have it open in VS Code, they want live, what should I do
  next?" (deployment guidance)
- "help me all these to do — I'm closing now, all these guide me tomorrow"
  (used across a multi-session debugging effort covering deployment,
  provider switching, and a persistence bug — see below)

## Work delegated to the agent

- Full project scaffold (package.json, tsconfig, Tailwind/PostCSS config)
- Database schema and SQLite connection layer
- CSV parsing/validation with header-aliasing and per-row error reporting
- The AI prompt for theme synthesis, and — critically — the **validation
  layer that treats model output as untrusted**: JSON parsing with a
  defensive preamble/fence-stripping fallback, and citation-ID
  cross-checking against real feedback rows before anything is persisted
- The deterministic stats module (counts/distributions/frequency) and its
  test suite
- All UI components (upload flow, theme review cards, merge/split dialogs,
  feedback drawer) and the page-level state machine
- Vitest test suite (23 tests) for CSV validation, stats computation, and
  AI-output validation
- Live deployment debugging on Railway (see below)

## A design point worth understanding for the interview: how "AI must not invent counts" is actually enforced

Not just by asking the model nicely in the prompt — three separate layers:
1. The system prompt explicitly forbids the model from stating any numbers.
2. Every citation the model returns is checked against the actual feedback
   IDs sent to it; unrecognized IDs are dropped and logged
   (`validateCitations` in `lib/claude.ts`, unit-tested in
   `tests/claude-validation.test.ts`).
3. The "recurring vs. isolated" classification shown in the UI is
   **recomputed** from the validated citation count, not read from the
   model's own label.

This isn't theoretical — during live testing on the deployed app, one
synthesis run logged: *"The model referenced 1 feedback ID(s) that didn't
exist; those citations were dropped automatically."* A real free-tier model
hallucinated an ID during actual use, and the validation layer caught and
dropped it exactly as designed, without crashing the request or silently
trusting the bad citation.

## Provider switch: Anthropic → OpenRouter

The project was originally built against the Anthropic API directly. During
deployment testing, the Anthropic key required paid billing credits.
AGGROSO team confirmed by email that free models via OpenRouter or
Ollama Cloud were acceptable for this assignment. The agent then:

1. Replaced the Anthropic client in `lib/claude.ts` with a call to
   OpenRouter's OpenAI-compatible endpoint.
2. Renamed env vars to `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` and updated
   `.env.example` and the README.
3. Left the prompt, JSON-parsing, and citation-validation logic — the parts
   that actually enforce "AI must not invent counts" — completely
   untouched, since swapping providers only changes how text gets from a
   model into a raw string; everything downstream that decides what to
   trust is provider-agnostic by design.
4. Set `OPENROUTER_MODEL=openrouter/free`, OpenRouter's own auto-router that
   randomly selects among currently-available free models, rather than
   hardcoding one specific free model ID. This was a deliberate choice
   after an earlier hardcoded free model (`meta-llama/llama-3.3-70b-instruct:free`)
   got delisted from the free tier mid-testing and returned a 404 — free
   model availability on OpenRouter rotates too often to hardcode reliably
   for something that needs to still work when reviewed.

## Post-deployment debugging: two real production issues, found and fixed

### Issue 1: SQLite data was silently resetting on every redeploy

**Symptom:** historical notes and theme renames disappeared after every
code push, even with a Railway persistent volume already attached.

**Root cause (found by adding a diagnostic log line rather than guessing):**
Railway's dashboard had staged the `DATABASE_PATH` variable edit and the
volume attachment as *pending changes* requiring an explicit "Apply
changes" click in the dashboard — separate from a `git push`-triggered
redeploy. Every redeploy rebuilt the app from the latest code but never
applied the pending infrastructure change, so the database kept landing in
the container's ephemeral filesystem instead of the mounted volume.

**Fix, in two layers:**
1. Added a startup log line in `lib/db.ts` printing both the raw
   `DATABASE_PATH` env value and the resolved absolute path on every boot —
   this made the discrepancy directly visible in Railway's Deploy Logs
   instead of guessing from symptoms alone. This is what eventually
   revealed the env var genuinely wasn't updating on the running container,
   which led to checking Railway's dashboard for a pending-changes state.
2. Rather than continuing to depend on the env var propagating correctly,
   `lib/db.ts` now auto-detects a mounted volume at common paths (`/data`,
   `/app/data`, `/mnt/data`) and prefers it whenever `DATABASE_PATH` isn't
   already an absolute path — making persistence robust to the hosting
   dashboard's own UI quirks, not dependent on one correctly-clicked button.

**Verified fixed** by adding a note, forcing a real redeploy via
`git commit --allow-empty && git push`, and confirming the note survived —
this was repeated twice, since a first "fix" attempt (just correcting the
env var value) turned out not to be the actual root cause and needed
further diagnosis.

### Issue 2: free-tier model rotation produced inconsistent output formatting

**Symptom:** synthesis intermittently failed with
`Model did not return valid JSON: Unexpected token 'U', "User Safety: safe"...`

**Root cause:** `openrouter/free` randomly selects among several different
underlying free models per request. At least one of them prepends non-JSON
text before its JSON response, despite the system prompt explicitly
forbidding any non-JSON output.

**Fix:** `parseModelJson` in `lib/claude.ts` now has a fallback: if the raw
response doesn't parse as JSON directly, it extracts the outermost `{...}`
span from the text and retries parsing that substring before giving up.
This is purely a parsing-robustness improvement — it does not relax the
citation-validation trust boundary; a response with no JSON in it at all
still fails loudly with a clear error and a Retry option in the UI, rather
than being silently accepted.

**Verified fixed** with two new unit tests (`tests/claude-validation.test.ts`)
covering this exact preamble case, and by observing subsequent live
synthesis runs succeed once the router picked a different underlying model.

## Rejected / not-taken suggestions

- The default data-model instinct was one-feedback-item-belongs-to-one-theme.
  Changed to a many-to-many link table (`theme_feedback`) instead, since a
  single feedback item can legitimately describe two distinct problems —
  forcing one theme per item would silently drop valid signal.
- `npm audit fix --force` was **not** run, since it would force a
  major-version bump of Next.js and other deps under time pressure for a
  3–10 hour mini-project. Remaining advisories are transitive/build-time
  (see README "Known limitations") — judged lower-risk than an untested
  major migration, worth revisiting for real production use.
- A hardcoded specific free OpenRouter model was rejected in favor of
  `openrouter/free` (see provider-switch section) specifically because it
  had already failed once mid-testing when its model got delisted.

## How generated output was verified

- `npm install`, `npm run build`, `npx vitest run` (23/23 passing) all run
  to completion at each stage of development, not just generated and
  assumed correct.
- Every human review action (rename, approve, reject, merge, split, view
  source feedback, save report) was tested live on the deployed app, not
  just built and assumed working — including catching and fixing two real
  bugs (above) that only appeared in the deployed environment.
- The citation-validation and hallucinated-ID handling was verified against
  a real free-tier model's actual output, not just synthetic test cases.
- Persistence was verified by the strongest test available: adding real
  data, forcing an actual container redeploy, and confirming the data
  survived — twice, after the first fix attempt proved insufficient.

## Known limitation to flag in the interview

Response time and exact theme groupings vary between runs because
`openrouter/free` randomly selects among different underlying free models
per request (10–90+ seconds, occasionally longer under load). This is a
deliberate tradeoff for free-tier reliability (see provider-switch section)
and does not affect the correctness guarantees (citation validation,
deterministic stats) — only the AI's qualitative judgment and response time.