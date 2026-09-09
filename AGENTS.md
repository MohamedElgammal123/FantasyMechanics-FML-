# AGENTS.md — Fantasy Mechanics League (FML) Platform

Gamified engagement platform for large first-year engineering courses.
Students earn points via in-class activities, WuClap lecture quizzes, and
competitive mini-games; points feed section leaderboards, bi-weekly champions,
and a team competition. Instructors configure rules, upload results, and get
analytics reproducing the ASEE paper's charts.

## Workflow rules (non-negotiable)

1. **Approval-gated iteration.** Propose the plan for each phase; wait for
   Ahmed's approval or redirection before implementing. No unilateral large
   changes.
2. **Surgical edits over rewrites.** Targeted patches, especially for working
   code.
3. **Logic verified before UI.** Any scoring/points math ships with a Node
   test harness verifying hand-calculated examples BEFORE any screen consumes
   it. (Same discipline as physics-first game development.)
4. **Point rules are data, not code.** Curves, claim rules, caps, team
   settings, prize tiers all live in DB rows. Never hardcode a point value.
5. **The ledger is append-only.** `point_events` never gets UPDATE/DELETE
   (DB triggers enforce this). Mistakes are reversed with compensating
   negative events via `void_result_set` / adjustments.
6. **Clients never write point_events.** All posting goes through the
   SECURITY DEFINER functions in the migration: `post_result_set`,
   `void_result_set`, `approve_claim`, `grant_points`.

## Stack

- Frontend: React + Vite (JS, not TS unless Ahmed says otherwise)
- Backend/DB/Auth: Supabase (Postgres, RLS, Auth)
- Charts: recharts
- CSV parsing: papaparse
- Tests: Node harness in `tests/` (esbuild IIFE bundle if bundling needed;
  `tests/package.json` = `{"type":"commonjs"}` to avoid ESM/CJS conflicts)

## Key documents

- `docs/fml_data_model.md` — the approved v1.1 data model. Schema questions
  resolve here first.
- `docs/fml_design_brief.md` — product/visual brief.
- `supabase/migrations/0001_initial_schema.sql` — the schema. Mirror of the
  data model; if they ever disagree, STOP and ask Ahmed.
- Design reference: Codex Design export (screens 1a–1e, 2a–2c, 3a–3d).
  Visual system: navy #0F1B2E, steel #4A7FB8 / #6B9BC9, cream #F2ECD9,
  fonts Bebas Neue (display) / Barlow + Barlow Condensed (UI) /
  IBM Plex Mono (numbers). Blueprint-grid background texture.

## Build order (dependency-ordered; do not skip ahead)

- [ ] P0: Vite scaffold, Supabase client, env config, fonts/theme tokens
- [ ] P1: Auth (Supabase), profiles, role-gated routing (student vs instructor)
- [ ] P2: Sections/enrollments admin + section switcher
- [ ] P3: **Point engine in isolation** — `src/engine/` pure functions:
      curve_points mirror, claim escalation math, weekly cap check,
      cycle standings, team aggregation (both scoring modes).
      `npm run test:engine` must pass hand-calculated cases before P4.
- [ ] P4: Student dashboard (reads real tables) + leaderboard
- [ ] P5: Claims: student submission (escalation preview, cap enforcement),
      instructor approval queue, ad-hoc grants
- [ ] P6: Results upload: CSV parse → validation UI (unmatched CCIDs) →
      preview → post via RPC. Shared flow, WuClap + game tabs (screen 2c)
- [ ] P7: Games hub + fixtures + game_launches
- [ ] P8: Scheduling: cycle generation/finalization (co-champions),
      rank snapshots job, team-mode unlock, formation deadline expiry
- [ ] P9: Team mode: formation flow (invites, captain, name, deadline states:
      forming/locked/auto_grouped/incomplete), team leaderboard, prize track
- [ ] P10: Instructor analytics + gradebook upload (incl. is_baseline) +
      export report
- [ ] P11: Mock-semester end-to-end test with fake data; deploy; 1-section pilot

## Engine math (must match SQL `curve_points` exactly)

```
points(rank) = rank == null        ? floor
             : rank <= cutoff      ? top - (rank-1)*step
             : floor
```
Invariant (validated on curve save): `top - (cutoff-1)*step >= floor`.
Ties: standard competition ranking (1,2,2,4) — the upload parser assigns ranks.

Claim escalation (per lecture_date, per activity):
```
value(nth) = min(base + step*(nth-1), cap ?? Infinity)
```

Weekly claim cap: sum of (approved + pending) claim points this week >= cap
→ block submission. Instructor grants exempt.

Team points:
- `from_unlock` (default): sum member point_events where week_number >= team_unlock_week
- `full_season`: sum all member point_events
Individual leaderboard always continues alongside.

Cycle champions: ties produce co-champions (multiple cycle_champions rows).

## Conventions

- npm scripts: `dev`, `build`, `test:engine`, `db:reset` (supabase db reset)
- Components in `src/components/`, screens in `src/screens/`, engine in
  `src/engine/` (pure, no imports from React or Supabase)
- CSV parsers in `src/ingest/` with explicit error objects surfaced to the
  validation UI — never silently drop rows
- All date/week math goes through `src/engine/weeks.js` (single source),
  anchored on `terms.week1_start`
- Section scoping: every query filters by section_id; never trust the client
  for section membership (RLS is the backstop, not the only check)
