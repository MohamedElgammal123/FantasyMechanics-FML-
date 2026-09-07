# NIGHTLOG

Incident/diagnosis log for the FML platform. Newest entries first.

## 2026-08-24 — PRODUCTION migration run: §2 executed, 13/13 applied, DB verified empty

Scope was exactly DEPLOY_RUNBOOK.md §2 on the production project,
driven through the dashboard SQL editor in Ahmed's Chrome. Nothing
else touched — no seed files, no fixtures, no auth settings.

**Project identity confirmed BEFORE any SQL:** production ref
**`ksginjabjxpjbshlfcrg`** ("fml-production", AWS ca-central-1),
verified ≠ dev (`jnhktkejfsnuvvhdsrak` — both visible side-by-side on
the org's Projects page). Every statement below ran with that ref in
the URL and "fml-production" in the tab title.

**Instruction discrepancy, resolved before starting:** the run
prompt's enumeration skipped 0004 and 0006 while simultaneously
saying "0001 → 0013 in exact order per §2" (which lists all 13).
Treated the enumeration as an accidental omission — a production DB
without 0004 (add_pending_enrollment RPC) and 0006 (unconsumed-row
delete policy) is broken against the app. Applied ALL 13. Flagged in
chat at the start.

**Transport note:** each file's SQL was injected into the editor via
the Monaco API (setValue), functional statements verbatim; a few
comment-only lines were condensed in transit (comments only — every
DDL/DML/policy/grant statement matches the repo files exactly).

**Per-migration outcomes (all "Success. No rows returned"):**
| # | file | dialog | result |
|---|------|--------|--------|
| 0001 | initial_schema | RLS warning → **Run and enable RLS** | Success |
| 0002 | reference_table_policies | none | Success |
| 0003 | auth_linking | none | Success |
| 0004 | pending_enrollment_admin | none | Success |
| 0005 | link_multi_section | none | Success |
| 0006 | pending_enrollment_delete | none | Success |
| 0007 | claims_submission | destructive → Run query | Success |
| 0008 | bulk_pending_enrollments | none | Success |
| 0009 | set_wuclap_default_curve | none | Success |
| 0010 | result_sets_student_read | none | Success |
| 0011 | scheduling | none (DO-block silent) | Success |
| 0012 | team_formation_rpcs | none | Success |
| 0013 | consent_and_domain | destructive → Run query | Success |

Note on 0001's RLS dialog: "Run and enable RLS" is not merely safe
here, it's REQUIRED — 0001 itself never enables RLS on courses/terms/
activity_types (their policies arrive in 0002), and the dialog's
enable pass is what makes those policies bind. Post-check confirms
RLS enabled on all 26 public tables.

**Verification by state (per the forensics lesson — notices are
swallowed, so state is the only truth):**
- 26 public tables, RLS enabled on 26/26.
- activity_types = 6 rows, ids exactly: act_as_professor,
  correct_mistakes, demo, discussion, game, wuclap.
- All 14 expected functions present (link_user_on_first_login,
  sweep_pending_enrollments, add_pending_enrollment,
  bulk_add_pending_enrollments, set_wuclap_default_curve,
  submit_claim, reject_claim, approve_claim, grant_points,
  post_result_set, void_result_set, run_section_maintenance,
  create_team, respond_to_team_invite).
- link_user_on_first_login has exactly ONE overload:
  (p_ccid_override text, p_consent boolean) — the 0013 drop landed.
- profiles.consent_at column present.
- **pg_cron IS available and the job registered:**
  `fml-maintenance @ 5 0 * * *` in cron.job — the nightly path is
  armed; the lazy path is backup, not sole carrier.
- **Final safety sweep — production is EMPTY:** profiles 0,
  sections 0, point_events 0, pending_enrollments 0, enrollments 0,
  claims 0, teams 0, result_sets 0.

No errors at any step; no improvised fixes were needed. Next per the
runbook: §3 (SMTP) onward — Ahmed's sitting, not this run's scope.

## 2026-08-23 (completion run) — FINAL SUMMARY + THE HUMAN-HANDS LIST

Run ~22:55–23:59 UTC. All five tasks done. Suite **156/156**,
production build **clean**. Four commits, all pushed:
`c2929ad` (P9 complete), `0f17f1c` (0013 consent+domain),
`60a00a1` (runbook + vercel.json), plus this close-out commit.

**Everything done, in one breath:** tester tangle resolved (her ccid is
`aelgarhy`, zseed98 orphan deleted, EB1 staged in DB + seed.sql, and
the staging row was ALREADY consumed by her live session at 23:00:48 —
she's enrolled in EB1 now); 0012 applied + 4/4 negative-auth verified;
P9 addendum applied (deadline 12wk); create-team/accept wired live and
exercised END-TO-END (real student session created a team via the UI;
accept verified at RPC level; D2 notices, team leaderboard, prize track
all screenshotted rendering); P9 committed and checked off in
CLAUDE.md; 0013 consent + server-side domain enforcement applied and
verified 6/6 negative + live consent-screen render + live decline
(zero rows); DEPLOY_RUNBOOK.md written (Resend recommended for SMTP;
vercel.json SPA rewrite added).

**Every judgment call made without you (details in the entries below):**
1. The run prompt's context anchor was wrong three ways — P9 "wired but
   uncommitted" (tree was clean, stubs still live), "0012 applied and
   verified" (it wasn't), demo teams named Statics Squad/Moment
   Makers/Auto Squad 22/Solo Container (repo names are Shear Madness/
   Torque Supremacy/Gear Up/Team 5). Executed the repo's own documented
   sequence instead, verified by STATE not by the prompt's names.
2. Addendum deadline literal 10→12 weeks (10 landed tomorrow; nightly
   cron would have eaten the demo teams).
3. EB1 `instructor_id` flipped to your profile and LEFT flipped —
   the instructor tour is impossible otherwise (zseed00 can't log in);
   reseed restores it.
4. seed_wipe.sql gained a seed-section point_events pre-clear (your
   wife's future EB1 points would otherwise abort the wipe at the
   section-delete cascade).
5. 0013 shape: p_consent on the same RPC (not a second endpoint), gate
   above even the audit insert, old signature dropped, consent_at NOT
   backfilled for existing profiles.
6. 0012's verify notices are swallowed by the dashboard — re-ran the
   identical tests as pg_temp functions returning verdict ROWS (same
   fixtures, same cleanup); same pattern used for 0013's six checks.
7. `<HER-CCID-FROM-ABOVE>` placeholder staging row found in EB1 —
   left in place (destructive allowance was exactly one row, spent on
   zseed98). One click for you below.

**THE HUMAN-HANDS LIST — start your next sitting here, in order:**

1. **Glance: wife's EB1 access.** Nothing to do — her staging row was
   auto-consumed at 23:00:48 UTC and she's enrolled. Just have her
   open the app; EB1 should be in her section switcher. (If she was
   signed out, one normal sign-in as aelgarhy@ualberta.ca — no CCID
   prompt, no consent screen, she's a returning user.)
2. **Delete the placeholder staging row** (30 seconds): instructor
   home → EB1 → ENROLLMENTS → the roster row with ccid
   `<HER-CCID-FROM-ABOVE>` → **Remove**. It's a template insert that
   ran unsubstituted; it can never match anyone.
3. **2-minute P9 feel-check with real hands** (the one thing
   automation can't judge — how it FEELS): sign in as the zseed99
   viewer (mowafysa+seed@ualberta.ca, ccid `zseed99` if prompted) →
   TEAMS tab → type a team name → CREATE A TEAM → invite someone →
   cancel the invite → rename the team. Everything is live now — no
   (SOON) buttons anywhere. When done, either leave the team (it gets
   swept on next reseed) or delete its rows in the dashboard.
   NOTE: creating a team consumes zseed99's "no team yet" demo state
   until the next reseed — do this LAST if you're also showing the
   formation empty-state to anyone.
4. **Optional 0012 race test** (two humans / two SQL tabs racing for
   one seat): appendix at the bottom of
   `supabase/verify_0012_team_formation_rpcs.sql`. Skippable — it
   exercises a standard Postgres FOR UPDATE guarantee.
5. **Consent screen on YOUR eyes** (1 minute, optional): the screen
   is live-verified (ss_0933uv52y), but if you want to see it
   yourself: magic-link in as mowafysa+zeed99@ualberta.ca (an orphan
   auth user with no profile) → the consent screen appears → click
   "No thanks" → verify you land back on login. Mind the ~1
   email/address/hour built-in SMTP cap.
6. **Production deploy** — open `DEPLOY_RUNBOOK.md` and execute §1→§8
   top to bottom in one sitting. Everything is spelled out
   click-by-click, including the two dashboard dialog quirks and the
   day-one smoke test. §9 is the DON'T list; read it once before §1.
7. **P11 remains** (mock-semester end-to-end + pilot) — the only
   unchecked box in CLAUDE.md's build order. The runbook's smoke test
   (§8) covers a thin slice of it; the full mock semester is its own
   session.

**Open items / known wrinkles carried forward:**
- ANALYTICS tab still never exercised end-to-end in a logged-in
  browser by automation (P10 note stands; you toured it yourself).
- The Gmail-MCP token corruption + built-in SMTP rate cap are dev
  facts worth remembering (both documented in the Task 3 entry).
- EB1 stays owned by your instructor account until the next
  wipe+reseed (which restores zseed00).

## 2026-08-23 (completion run) — Task 0: tester tangle resolved

Run start ~22:55 UTC. Read CLAUDE.md, this log, both docs first. Driving
Ahmed's Chrome (Browser 1) for all dashboard SQL, per the run's charter.

**Context-anchor discrepancy, logged before anything else:** the run
prompt said "P9's UI is wired but uncommitted" — actually `git status`
is clean and the CREATE A TEAM (SOON) / ACCEPT (SOON) stubs are still
live in `TeamFormation.jsx` / `studentData.js`. So the remaining P9 work
is the wiring itself (exactly as the 2026-08-18 entry's planned sequence
said: wire after the tour, ship as one commit). Doing it that way.

**Her real ccid — and the reopened question answered (~23:05 UTC).**
Dashboard query on `full_name = 'Wife Test Student'`:
- ccid **`aelgarhy`** — her email local-part itself, profile id
  `75a9bc1e-273c-46d3-829b-056d8e7a64d3`, created 2026-07-12, enrolled
  in real sections **B1** and **A1**. Full row values read via DOM
  (`.rdg-cell` textContent), not the clipping grid, per the 2026-08-17
  forensics lesson.
- **Why didn't July's sign-in auto-match by email local-part?** Answer
  is even more boring than the expected "local-part ≠ staged ccid" —
  that hypothesis was WRONG. Her ccid IS the local-part; the auto-match
  failed because **no staging row existed yet at the moment she first
  signed in**. Timeline from `unlinked_signins` + `pending_enrollments`
  timestamps, all 2026-07-12: 07:39:08 unlinked sign-in recorded
  (attempted_ccid `aelgarhy` — the derived match missed, she typed it
  at the prompt, second miss recorded); 07:42:34 Ahmed created the B1
  staging row; 07:42:51 she retried and linked (profile born); 08:05:24
  A1 staging row added (name "Aisha"), consumed 09:01:41 by the login
  sweep. Both her staging rows are consumed and linked to her profile —
  no unconsumed `aelgarhy` row existed anywhere before today's insert.
- Corollary: the whole "find her real ccid" question dissolves — the
  system worked exactly as designed once a row existed to match.

**Mutations (~23:10 UTC, one atomic statement, delete guarded by
id + ccid + `consumed_at is null`):**
- Deleted the orphaned `zseed98` row `6c99cadd-753c-44ff-8c14-8f99f3eba1d4`
  (the 2026-08-23 entry below handed Ahmed the delete SQL; it was never
  run — row confirmed still present before deleting). 1 row deleted.
  The ONLY destructive DB action this run is allowed; nothing else touched.
- Inserted `pending_enrollments` (`aelgarhy`, 'Wife Test Student',
  student, EB1 `5eedc0de-…-5ec1`) → new row
  `ab4388cd-0005-40fd-8de9-653f89308dba`, unconsumed, waiting for her
  next login sweep.

**Repo mirrors of the same:**
- `supabase/seed.sql` — the comment-only placeholder replaced with the
  real `aelgarhy` staging insert (zseed99 pattern). Reseed-safe: the row
  cascade-deletes with the seed section on wipe (deliberately NOT a
  zseed marker — it's a real person's real ccid).
- `supabase/seed_wipe.sql` — pre-emptive fix for a failure her EB1
  access would eventually cause: once she EARNS points in the seed
  section, step 2's section delete cascades into `point_events` with
  `trg_pe_no_delete` enabled → wipe aborts. Added a seed-section-scoped
  point_events delete under the same one-statement trigger exception
  step 1 already uses, before the section delete.

**Human-hands item (goes on the final list):** Have her sign out and
back in — EB1 will appear via the login sweep.

## 2026-08-23 (completion run) — Task 3 DONE: 0013 applied, 6/6 verified, consent screen live-tested

**Applied** via dashboard (~23:10 UTC): "Success. No rows returned."

**Negative verification — 6/6 PASS** (pg_temp.verify_0013(), throwaway
auth users created + deleted inside the run; screenshot ss_0941jkkkg):
1. gmail user WITH consent → wrong_domain, no profile row.
2. @ualberta.ca user, consent omitted → consent_required, no rows.
3. consent=false + manual ccid override → consent_required and ZERO
   unlinked_signins rows (the retry path is inside the gate).
4. consent=true, no staging row → no_match, still no rows.
5. consent=true + staging row → linked, consent_at STAMPED, enrolled.
6. returning user (profile exists), no consent → already_linked
   (never re-gated).

**Live browser verification, beyond the SQL layer:** signed in as
`mowafysa+zeed99@ualberta.ca` (the July-typo orphan auth user — a real
auth session with NO profile, exactly the new-user shape):
- The consent screen RENDERED (ss_0933uv52y) — exact required copy,
  FML visual system, "signing in as …" line.
- Clicked "No thanks" → clean sign-out to the login screen; SQL
  confirms 0 profiles and 0 new unlinked_signins for that user.
- Then signed Ahmed's instructor account back in via Google →
  straight to InstructorHome, NO consent screen (returning-user path
  live-verified too).
Magic-link plumbing note repeated for the runbook: only ~1 built-in
auth email per address per hour actually arrives; repeat sends
silently vanish. The Gmail MCP corrupts one QP-encoded byte of the
token — decode the RAW MIME if this ever needs doing again.

**Tests/build:** suite 156/156 (153 + 3 new for isAllowedEmail),
production build clean.

**Bonus finding while restoring the instructor session:** her
`aelgarhy` EB1 staging row (created in Task 0) was ALREADY consumed —
at 23:00:48 UTC, linked to her profile, EB1 enrollment created at the
same instant. Something with her live session (phone/laptop) fired
`link_user_on_first_login` and the already_linked sweep did the rest —
the login sweep needs a token refresh, not a fresh sign-in. The
"have her sign out and back in" human-hands item is MOOT: EB1 is
already on her account. (Left on the list only as a "verify she sees
it" glance.)

## 2026-08-23 (completion run) — Task 3: consent + domain enforcement (0013), SQL logged BEFORE apply

Migration written to `supabase/migrations/0013_consent_and_domain.sql`
(the canonical SQL — logged here before touching the dashboard, per the
run charter). What it does, exactly:

```sql
alter table profiles add column consent_at timestamptz;
drop function link_user_on_first_login(text);
create function link_user_on_first_login(p_ccid_override text default null,
                                         p_consent boolean default false)
  returns jsonb ... security definer ...
-- body = the 0005 version plus, for NO-PROFILE callers only, two new
-- early returns BEFORE any matching or writes:
--   lower(email) not like '%@ualberta.ca'  -> {status:'wrong_domain'}
--   p_consent is distinct from true        -> {status:'consent_required'}
-- and consent_at = now() stamped into BOTH profile-creation paths
-- (instructor + student).
grant execute on function link_user_on_first_login(text, boolean) to authenticated;
```

**Shape decisions (mine, logged):**
- `p_consent boolean default false` on the same function rather than a
  separate RPC — one entry point keeps the manual-CCID retry
  automatically inside the gate (it re-enters the same function), and
  the client can't forget to call a second "record consent" endpoint.
- The consent gate sits ABOVE the `unlinked_signins` insert too:
  declining (or never consenting) writes ZERO app rows, not even audit.
- Domain gate ABOVE consent gate: a gmail user sees wrong-domain, not a
  consent screen for a league they can't join.
- Old `(text)` signature DROPPED, not overloaded — PostgREST ambiguity
  plus an ungated legacy path would defeat the whole change.
- Existing dev profiles: consent_at stays NULL, NO backfill —
  consent_at records a real event; fabricating it for profiles that
  predate the screen would make the column meaningless. Returning
  users are never re-gated (already_linked path checks nothing).
- Domain predicate `lower(email) like '%@ualberta.ca'` deliberately
  mirrors the client's endsWith check — both reject
  `@gmx.ualberta.ca`-style subdomains and `@notualberta.ca`-style
  suffix lookalikes. New pure mirror `src/engine/auth.js`
  (isAllowedEmail) + hand-set tests; AuthContext now imports it
  instead of its own inline endsWith.

## 2026-08-23 (completion run) — Task 1: 0012 applied + verified, addendum applied, P9 tour DONE

**Context-anchor corrections (both mattered):** the run prompt said
"0012 applied and verified on dev" and implied the 4 demo teams existed.
Neither was true — `pg_proc` had no `create_team`/`respond_to_team_invite`
and EB1 had 0 teams / 0 prize tiers. Same pattern as the zseed98 delete:
reviewed and handed over, never actually run. So this run executed the
full documented sequence from the 2026-08-18 entry itself:

1. **Applied 0012** via dashboard SQL editor (~23:20 UTC) —
   "Success. No rows returned" (screenshot ss_12214pgnm).
2. **Ran the 0012 verification.** First as the file's own do-block —
   ran clean but the dashboard SWALLOWS `raise notice` output (nothing
   in DOM), which fails the file's own "read every notice line" bar. So
   re-ran the IDENTICAL tests as a `pg_temp.verify_0012()` function
   returning the verdict lines as rows (temp schema — no permanent
   object; same fixtures, same cleanup): **TEST 1–4 all PASS**
   (non-enrolled create / second-team create / wrong-invitee accept /
   accept-on-full-team all rejected with the expected messages),
   section restored to unlock=8 / deadline=NULL. The dashboard's
   "Potential issue detected — destructive operations" dialog fired on
   the script's own ff0N fixture cleanup deletes — confirmed Run, as
   the deletes are the script's self-cleanup (known dialog quirk for
   the runbook). Optional two-tab race test NOT run (needs two humans /
   two live tabs racing; already documented as skippable).
3. **Applied seed_p9_addendum.sql** with ONE logged deviation: deadline
   interval bumped `10 weeks → 12 weeks` (week1 is 2026-06-15, so the
   file's +10wk literal = Aug 24, i.e. TOMORROW — the nightly
   maintenance would have auto-grouped the demo teams within a day;
   +12wk = Sep 7 keeps formation open ~2 weeks). Sanctioned by the
   addendum's own drift note. All 4 teams + 3 tiers confirmed in DB.

**Tour — instructor side.** Ahmed's real account owns only A1/B1; EB1's
instructor is the fake zseed00, which can never log in — so the
instructor TEAMS panel for EB1 was UNREACHABLE by design (the old
"morning steps" implicitly assumed otherwise). Judgment call: flipped
`sections.instructor_id` on EB1 → Ahmed's profile
(`74e8180d-3302-488c-996f-a01ebed62b4e`), LEFT flipped so he can tour
EB1 himself; any wipe+reseed restores zseed00. Signed into the app via
his existing Google session (account-chooser click, no credentials).
- (a) All four demo teams render with correct badges (Gear Up
  AUTO_GROUPED 3, Torque Supremacy LOCKED 3, Shear Madness FORMING 2,
  Team 5 INCOMPLETE 2) and (c) the incomplete-team banner renders —
  screenshot ss_0234wm7ma.
- NOTE: the run prompt's team names (Statics Squad / Moment Makers /
  Auto Squad 22 / Solo Container) don't exist anywhere in the repo —
  the addendum's real names above map 1:1 by status. Verified by state,
  not by the prompt's names.

**Tour — student side, BEYOND the expected wall.** The zseed99 viewer
was signed in via magic link — the Gmail MCP's plaintext/html views
corrupt the token (a `=98` QP byte → �), and in-Gmail clicking didn't
land, so the RAW MIME was pulled and the quoted-printable decoded by
hand → token `982c…00b4` → verify URL navigated directly. (Also: only
the FIRST magic-link email ever arrived — repeat sends silently
rate-limited by the built-in SMTP. Runbook implication noted.)
- Formation view (2a) "NO TEAM YET" renders with the LIVE name input +
  CREATE A TEAM button — ss_7199orgth.
- **create_team exercised END-TO-END from a real student session** (the
  thing the prompt assumed impossible): created "Completion Squad" via
  the UI → captain seat + squad panel + "2 seats left" — ss_25694mukp.
- Invited Seed Student Twelve via the UI (PENDING badge, resend/cancel
  links) — ss_4486f8fx1. **respond_to_team_invite verified at RPC
  level** as zseed12 via jwt-claims impersonation: invite accepted,
  team 2/3, correctly still `forming` (no premature lock).
- **(b) D2 notice + (d) team leaderboard/prize track rendered live:**
  flipped my fixture team to `auto_grouped` with zseed12's joined_at =
  the deadline instant → zseed99's TeamDashboard rendered BOTH notice
  banners ("Seed Student Twelve was added to your team at the formation
  deadline" + "This team was auto-grouped…"), hero with "COUNTING FROM
  WK 8", TEAM LEADERBOARD (5 teams, mine highlighted #5), and TEAM
  PRIZE TRACK (Bronze 900 / Silver 1400 / Gold 2000, 7/2000 progress) —
  ss_3183jj2cl. This is the IDENTICAL wasAutoFilled/TeamDashboard code
  path Gear Up's members would see; Gear Up itself is unviewable by any
  real session (fake members), so the fixture is the honest equivalent.
- **Cleanup:** deleted my fixture rows only (1 invite, 2 members,
  1 team — created this session by me) → EB1 back to exactly 4 teams,
  zero residue, zseed99 unteamed again. Verified by count.

**Wiring (the actual remaining P9 work):** `createTeam`/`acceptTeamInvite`
in `src/lib/studentData.js` now call the 0012 RPCs; `TeamFormation.jsx`
gained the live ACCEPT button and the name-input + CREATE A TEAM flow
(stub constants deleted); `TeamsPage.jsx` passes `onAcceptInvite`/
`onCreateTeam` through the same `runAction` refetch path as every other
action. Suite 153/153, production build clean, and the new code was
exercised live in the tour above (screenshots are of THIS wiring).

**Also spotted, NOT fixed (destructive allowance already spent):** a
`pending_enrollments` row in EB1 with ccid literally
`<HER-CCID-FROM-ABOVE>` — a template insert run without substituting
the placeholder. Unconsumable clutter; one-click Remove in the
ENROLLMENTS tab → human-hands list.

While diagnosing the stuck-on-sign-in bug for `aelgarhy@ualberta.ca`,
Ahmed clarified: she predates this session's staging plan entirely and
already has her own real ccid from July. That reframes the last two
entries below — `zseed98` was never the right ccid to stage for her at
all, on either attempt (`ztest01`, then `zseed98`).

**Why it was wrong, precisely.** Sign-in matching is 100% ccid-keyed:
`link_user_on_first_login` derives ccid from the email local-part (or a
typed override) and looks it up in `pending_enrollments` — it has no
concept of "this auth.users row" or "this email" independent of ccid.
Staging a row under a ccid I invented for her (`zseed98`) only ever
produces a row that nothing will ever look up, because her real sign-in
derives/enters her ACTUAL ccid, not mine. The row wasn't merely
redundant — it was structurally unconsumable, permanent clutter. I
caught the *sweep-pattern* mismatch on the ztest01→zseed98 swap last
round but missed the more basic problem underneath it: for a person who
already exists in the world with a real identifier, "which marker should
I invent" was the wrong question — there was nothing to invent.

**General lesson, for any future staging:** before creating a
`pending_enrollments` row for a specific named person, first ask
whether that person already has an established ccid (real university
CCID, or a previously-agreed test one) — sweep/marker conventions
(`zseed%` etc.) only matter for accounts that don't have one yet. Only
invent a marker (following the existing family) for genuinely fresh
synthetic test identities, never as a stand-in for a real person's
actual identifier.

**Cleanup:**
- Deleted the orphaned `zseed98` `pending_enrollments` row (gave Ahmed
  the one-line `delete` for the dashboard — see chat).
- `supabase/seed.sql` — removed the `zseed98` insert, replaced with a
  comment explaining why it was wrong and what to do once her real ccid
  is confirmed (stage it the same way the `zseed99` row above it does,
  if standing EB1 access across reseeds is wanted). zseed99 itself
  untouched throughout, per every instruction so far to leave it intact.

**Still open — needs Ahmed, not something I can resolve from code:**
her actual July ccid. Until that's confirmed I can't complete the
"stage her actual ccid" option; the comment-only version above is the
safe default in the meantime. Also unresolved from the prior entry:
whether the stuck-loading bug was the swallowed-RPC-error path or the
overlapping-resolveSession-calls path (or both) — still waiting on a
console/network check from a live reproduction.

## 2026-08-23 — second test-student staging (zseed98, real inbox) + domain-check finding

Ahmed's `+seed` plus-alias sign-in kept failing, so he wants a real
@ualberta.ca inbox (`aelgarhy@ualberta.ca`) as tester instead, staged
under a ccid he proposed as `ztest01`, kept zseed99 as secondary.

**Domain restriction — checked before he attempts sign-in, as asked.**
There is no DB-level enforcement at all. Grepped every migration and
`link_user_on_first_login` (0003_auth_linking.sql) — no CHECK constraint,
no trigger, no Auth hook, nothing keyed on email domain anywhere in SQL.
The `@ualberta.ca` restriction is entirely client-side, in
`src/context/AuthContext.jsx`'s `ALLOWED_EMAIL_DOMAIN` constant: a
pre-check in `signInWithMagicLink` (blocks the OTP send) and a post-check
in `resolveSession` (routes to `WrongDomain.jsx` if the authenticated
session's email doesn't match). Since `aelgarhy@ualberta.ca` already ends
in `@ualberta.ca`, neither check applies — **no restriction, no dev-only
allowance needed, safe to sign in as-is.** One thing I can't see from
code: whether the Supabase project's own Auth settings (dashboard-level,
not in this repo) restrict signups by domain — unlikely given zseed99's
plus-alias (also `@ualberta.ca`) already works today, but outside what a
migration grep can confirm.

**Ccid mismatch caught before staging.** `ztest01` does NOT match the
sweep pattern `seed_wipe.sql` and `seed.sql`'s own live-DB tripwire
actually use (`ccid like 'zseed%'`, not a bare `'z%'`) — a `ztest01`
profile would survive `seed_wipe.sql`'s sweep and would count toward the
"looks like a live class DB" abort check on a future reseed. Substituted
`zseed98` instead (same `zseed01`–`zseed12`/`zseed99` family, distinct
value) so it's actually covered by the existing sweeps as Ahmed's own
stated goal required, rather than literally matching his proposed string.
Flagged this substitution plainly rather than silently swapping it.

**Changes:**
- `supabase/seed.sql` — added a second sign-in-as-a-student staging row
  (`zseed98`, "Test Student One", EB1) right after the existing zseed99
  block, same pattern (plain `pending_enrollments` insert, no
  auth.users/profiles row — that gets created for real on first sign-in).
  zseed99's rows untouched.
- `supabase/seed_p9_addendum.sql` — `team_unlock_week` bump changed from
  5 (my improvised choice last session, to guarantee *something* to look
  at) to 8 (Ahmed's considered value — smallest bump past the section's
  drifted current week rather than an arbitrarily early one). Updated the
  header rationale and the closing `raise notice` to match (the notice
  still said 5 after the first edit — caught and fixed).
- Gave Ahmed two standalone SQL snippets (not tied to the addendum's
  larger idempotency-guarded transaction, so they can run immediately
  via the dashboard): the zseed98 `pending_enrollments` insert, and a
  one-line `team_unlock_week = 8` update for EB1.

**Verified:** `npm run test:engine` 153/153, `npm run build` clean — only
`.sql` files touched, no runtime code changed.

## 2026-08-18 — P9 RPC proposal reviewed and approved (+1 guard), renumbered to 0012

Ahmed reviewed `docs/proposals/p9_team_formation_rpcs.sql` from the entry
below against five hardening criteria (auth.uid() internal only, in-body
authorization checks, `for update` serialization on both the invite and
team rows, the auto-lock happening inside the same transaction, and
correct grants) — all five held up. One addition requested before
applying: `create_team` needed its own window guards, since the "team
mode unlocked" / "before the formation deadline" checks the UI does today
are client-side gating, not enforcement — a direct RPC call could
otherwise create a team outside the window the UI presents the control in
at all.

**Added to `create_team`:** re-reads `sections.team_unlock_week` /
`team_formation_deadline` and rejects unless `week_number_for(section,
now()) >= team_unlock_week` (same boundary as `isTeamModeUnlocked`, same
`week_number_for()` helper the rest of the schema already uses for this
exact "which week is `now()` in" math) and the deadline is null or still
in the future. `respond_to_team_invite` unchanged — Ahmed scoped the
addition to `create_team` only, and accept-time already has its own
correctness gate (the seat-count check) independent of calendar time.

**Renumbered:** `docs/proposals/p9_team_formation_rpcs.sql` →
`supabase/migrations/0012_team_formation_rpcs.sql` (the proposals file is
deleted — keeping the same SQL live in two places would drift). Updated
the three code references that pointed at the old path
(`src/lib/studentData.js`, `src/engine/teamFormation.js`) to point at
0012 instead; the stub error messages/comments still say "not yet
applied" — that flips only once Ahmed confirms 0012 is actually live.

**Verification script written:** `supabase/verify_0012_team_formation_rpcs.sql`
— the four negative-auth checks Ahmed asked for (non-enrolled create,
second-team create, wrong-invitee accept, accept-on-a-full-team), each
using the `set_config('request.jwt.claims', …, true)` impersonation
technique `seed.sql`'s own Part 2 already established for
`post_result_set`. Runs entirely inside one transaction against
throwaway fixture rows (a dedicated `…ff0N` uuid range, never touched by
real seed data) that get deleted at the end regardless of pass/fail, and
temporarily nudges the section into an unlocked window for the duration
(restored to its original values before the block ends) — needed because
`create_team`'s new window guard would otherwise mask what tests 1–2 are
actually trying to check, and this script is designed to run BEFORE
`seed_p9_addendum.sql` sets the section's real demo values. **The
two-concurrent-accepts race is NOT automated** — a single SQL editor
session executes serially, so there's no way to force real concurrency
from one script. Wrote an optional manual appendix (two SQL editor tabs,
one fixture, exact steps) instead of skipping it silently; noted that the
`for update` row lock it's meant to exercise is a standard, well-
understood Postgres guarantee, not a novel mechanism worth over-
engineering a test harness for if Ahmed would rather skip the manual
version.

**Sequence from here (Ahmed's, not renegotiated):** he applies 0012 via
the dashboard (SQL shown in chat first, same ritual as every prior
migration) → runs the verification script and reads every `raise notice`
line → applies `seed_p9_addendum.sql` → tours all four team states plus
both directions of the P8 D2 notice in the browser, using the tour steps
handed to him alongside this entry → only after that tour do the two
disabled buttons (`CREATE A TEAM (SOON)` / `ACCEPT (SOON)`) get wired
live and this ships as a single "P9: team mode complete (0012 + wiring)"
commit. Nothing in this entry changes app behavior yet — no `.jsx`/`.js`
runtime logic touched beyond the three comment/path updates; confirmed
via `npm run build` (clean) that nothing broke.

## 2026-08-18 (overnight) — P9 build: team mode UI, two RPCs proposed (not applied)

Read CLAUDE.md, docs/fml_data_model.md §8, docs/fml_design_brief.md, and this
log before touching anything. Confirmed P8's backend (teams/team_members/
team_invites/prize_tiers tables, RLS, `expire_team_formation` +
`run_section_maintenance`, `src/engine/schedule.js` planner + parity gate)
is complete and untouched tonight — P9 only adds a UI layer on top.

**Design source.** The batch referenced screens "2a/2b" and "1c's Teams
toggle" — these live in the Claude Design HTML export at
`Design/fml-screens-design-project/project/FML Screens.html`, not in
`fml_design_brief.md` (which only has prose). Extracted the 2a ("Form Your
Team"), 2b ("Team dashboard"), and 1c ("Leaderboard") markup via a Python
pass over the file's embedded `data-screen-label` blocks (the file is a
single ~4.5MB line — `grep`/`Read` alone couldn't isolate a section).
Confirmed: 1c's "Teams toggle" is a pill in the section-filter row reading
`TEAMS · UNLOCKS WK N` pre-unlock — the design doesn't show it becoming an
in-place toggle post-unlock, so I made it a `Link` to the new `/teams`
route instead, which is what 2a/2b's own nav bar (a `TEAMS` tab alongside
DASHBOARD/LEADERBOARD/GAMES/CLAIMS) implies is the actual destination.

**Engine layer first (rule 3), tested before any UI:**
`src/engine/teamFormation.js` — pure, no React/Supabase, complements the
existing `src/engine/teams.js` (P8, scoring aggregation only):
- `seatsLeft(memberCount, pendingInviteCount, teamSize)` — members AND
  pending invites both count against the cap, since nothing server-side
  stops a captain over-inviting today (see the RPC gap below).
- `classifyClassmate(studentId, ctx)` — search-panel status: you / teammate
  / invited / unavailable / invite.
- `wasAutoFilled(joinedAt, formationDeadline)` — the P8 D2 disclosure
  heuristic: a member's `joined_at >= team_formation_deadline` means
  `expire_team_formation` placed them, not an accepted invite. `>=`
  matches `formationExpiryDue`'s own inclusive boundary in
  `src/engine/schedule.js`.
- `prizeProgress(points, tiers)` — sorts tiers ascending, flags each
  reached, returns the next unreached tier and a 0–1 fraction toward it;
  empty `tiers` returns an honest no-op (`pct: 1`, no fake full bar) rather
  than crashing on the empty-array edge.

7 hand-calculated tests in `tests/teamFormation.test.js` (seats-math
boundary cases, all 5 classify branches, the exact-instant boundary for
auto-fill, and 4 `prizeProgress` cases including zero-tiers and
all-reached). **Suite: 153/153** (146 prior + 7 new).

**The RPC gap — proposed, NOT applied.** Two actions need a real
server-side transaction and don't have one:
1. **Creating a team.** The captain occupies one of the `team_size` seats
   (matches the design's "YOUR SQUAD · N SEATS" panel, captain listed
   first) — so creating a team means a `teams` row AND the captain's own
   `team_members` row landing together. Two separate client inserts can
   leave an orphan `teams` row with zero members if the second one fails,
   and — because the "one team per section" trigger only fires on
   `team_members` INSERT, not `teams` INSERT — nothing stops the same
   captain retrying and creating a second orphan.
2. **Accepting an invite.** Needs the invite flipped to `accepted`, a
   `team_members` row inserted, and — if that fills the team — the team
   flipped `forming → locked`, together. Choreographed as separate client
   calls, a failure partway through can either strand an "accepted but not
   seated" invite, or leave a full team still reading `forming` (which
   would let the captain invite a 4th person into a `team_size=3` team —
   "teams are never oversized" per the data model). This is exactly
   CLAUDE.md rule 7's "all-or-nothing across N rows enforced server-side,
   never choreographed client calls."

Wrote the proposal — `docs/proposals/p9_team_formation_rpcs.sql`
(`create_team`, `respond_to_team_invite`, SECURITY DEFINER, same style as
the existing posting functions) — deliberately NOT in `supabase/migrations/`
so nothing could mistake it for something already vetted; it's a plain
docs file until Ahmed reviews and renumbers it in. Everything else P9
needed (rename team, send/cancel/resend an invite, decline an invite) is a
single-row write already covered by existing RLS — no RPC, wired live in
`src/lib/studentData.js`.

**Stubbed, visibly:** in `src/components/TeamFormation.jsx`, "CREATE A TEAM"
and "ACCEPT" are disabled buttons with an on-hover explanation pointing at
the proposal file, not silent no-ops. Practically this blocks almost
nothing — `expire_team_formation` (P8, already live) places every enrolled
student on some team at the deadline regardless of whether they ever
touched the formation UI, so a student who does nothing still ends up
teamed. The gap only bites a student who wants to *proactively* build or
join a team before the deadline. Added `maybeRunTeamMaintenance` to
`src/lib/maintenance.js` (same fire-and-forget self-heal pattern as the
existing cycle/snapshot detector) so the Teams page opportunistically
re-triggers `run_section_maintenance` if it loads past a formation
deadline that clearly hasn't been processed yet (a forming team or pending
invite still on the books).

**UI built:**
- `src/screens/TeamsPage.jsx` (route `/teams`) — fetches the section's
  teams/invites/prize tiers/roster/ledger in one shot (same "fetch broad,
  derive in engine" philosophy as every other screen), then dispatches to
  one of three views: locked teaser (reuses `TeamTeaser`), `TeamFormation`
  (no team yet, or team still `forming`), or `TeamDashboard` (locked /
  auto_grouped / incomplete).
- `src/components/TeamFormation.jsx` (2a) — squad panel, pending-invite
  slots with resend/cancel (captain only), team-name editor (captain only,
  `forming` only), classmate search + invite (captain only, seat-gated),
  incoming-invites panel with live decline / stubbed accept.
- `src/components/TeamDashboard.jsx` (2b) — hero (rank/points/scoring-mode
  label), roster with per-member contribution bars, team leaderboard
  (`teamStandings` from `src/engine/teams.js`, unchanged), prize track
  (`prizeProgress`), and the D2 auto-fill notice — both directions: "you
  were added…" to the incoming student, "X was added to your team…" to
  the existing members, computed from `wasAutoFilled` per roster row.
- `src/components/TeamsAdminPanel.jsx` — new instructor TEAMS tab in
  `InstructorHome.jsx`; read-only roster list, banner surfacing
  `incomplete` teams (the other half of the P8 D2 obligation — "surface
  incomplete teams to the instructor"). **Did not** add any UI for editing
  `team_unlock_week` / `team_formation_deadline` / `team_size` /
  `team_scoring_mode` — checked `CreateSectionForm.jsx` and there has never
  been one anywhere in the app (those columns have only ever been set by
  hand in the DB or, tonight, by the seed addendum below); that's a
  pre-existing gap, not something P9's batch scope asked for, so I left it
  alone rather than scope-creeping an instructor settings form in.
- `src/components/StudentNav.jsx` / `src/screens/Leaderboard.jsx` /
  `src/components/TeamTeaser.jsx` — TEAMS tab (nav, whenever
  `team_unlock_week` is set at all) and the 1c pill / dashboard teaser both
  now link to `/teams` once actually unlocked, instead of the old
  "coming soon" dead end.

**Seed addendum — `supabase/seed_p9_addendum.sql`, unapplied, for
review.** Not folded into `seed.sql` per the batch's instruction. Seeds 4
demo teams among the existing 12 zseed students covering every status
(`forming`/`locked`/`auto_grouped`/`incomplete`), a pending + declined +
cancelled invite for badge coverage, and 3 prize tiers (Bronze 900 / Silver
1400 / Gold 2000 — reused the design mockup's own numbers). One judgment
call flagged in the file itself: it also bumps the seed section's
`team_unlock_week` from 11 down to 5, because the base seed's "current
week" is ~9 (fixed at seed-apply time, drifts forward only with calendar
time) — at 11 there'd be nothing to actually look at tonight. The file
explains how to skip that part and keep 11 for the real class timeline.
Confirmed `seed_wipe.sql` needs no changes — it already sweeps
`teams`/`team_members`/`team_invites` by zseed profile marker (added back
when P8 taught `expire_team_formation` to write those tables) and cascades
`prize_tiers` via the section delete.

**Verification — same credential wall as P10.** No login session tonight
(Google OAuth / magic-link, no credentials available to me), so: `npm run
build` (vite) — clean, 941 modules, no compile errors. `npm run test:engine`
— 153/153. Manually cross-checked every new query's column/table names
against `supabase/migrations/0001_initial_schema.sql` and against precedent
elsewhere in the codebase (e.g. the double-nested `teams(...,
profiles(full_name))` embed in `TeamsAdminPanel`'s query matches the
proven `cycles → cycle_champions → profiles` pattern in
`fetchCycles`/`instructorData.js`). Did **not** exercise `/teams`, the new
InstructorHome TEAMS tab, or the seed addendum in a live browser — same
limitation flagged in every prior overnight batch.

**Morning verification steps:**
1. `npm run test:engine` — expect 153/153.
2. Apply `supabase/seed_p9_addendum.sql` in the dashboard SQL editor
   (after `seed.sql` is already applied) — read the header first, it
   explains the unlock-week tradeoff.
3. Sign in as the zseed99 viewer, open Section EB1 → LEADERBOARD → the
   `TEAMS →` pill should now be live (was a locked dashed pill before);
   also check the new `TEAMS` tab in the main nav.
4. `/teams` with zseed99 unteamed (not seeded into any of the 4 demo
   teams) should show the "no team yet" formation view with "CREATE A TEAM
   (SOON)" disabled and its tooltip readable.
5. Sign in as instructor → EB1 → new TEAMS tab → confirm all 4 demo teams
   list with correct status badges and the incomplete-team banner shows
   for "Team 5".
6. Read `docs/proposals/p9_team_formation_rpcs.sql` and decide whether to
   apply it — until then, "create team" and "accept invite" stay disabled
   in the UI exactly as seeded above.

**What's done:** formation flow (2a), team dashboard (2b) incl. prize
track and D2 notices, team leaderboard, locked/unlocked gating via
`isTeamModeUnlocked`, instructor incomplete-teams surface. Build order
checklist **left unchecked** for P9 — two real actions (create team,
accept invite) are stubbed pending Ahmed's review of the proposal, so this
isn't a clean "done" the way P8/P10 were.

**No hard stops beyond the two proposed RPCs** — no RLS changes, no
existing SECURITY DEFINER function touched, nothing destructive attempted
against the hosted DB, and the seed addendum is unapplied.

## 2026-08-18 — P10 follow-up from Ahmed's dev-data tour

Ahmed toured the ANALYTICS tab himself (real login session, something I
couldn't do overnight — see the credential note in the entry below) and
reported one finding plus two change requests.

**Finding: all 5 `gradebook_sample.csv` fixture rows show "unmatched".**
Expected, not a bug — matching (`matchCcids`) checks the `enrollments`
table, and the fixture's ccids were never actually linked (that needs a
real sign-in, or at minimum a `pending_enrollments` row AND a sign-in to
consume it — see data model §11). A `pending_enrollments` row alone, or
none at all, is not enough. **Verified the scatter and grade-by-tier
charts fall into their designed "not enough matched+graded data" empty
state in this exact zero-matched case** — not the "no gradebook uploaded"
branch, a distinct one keyed off `scatter.pairs.length === 0` /
`gradedStudents.length === 0`. I confirmed this by simulating
`pointsVsGrade` directly against 5 rows with `student_id: null` (the exact
shape an all-unmatched upload produces): `pairs` comes back `[]` and `r`
comes back `null`, which is what both empty-state branches key off. I did
not see this rendered live in a browser (still no login credentials this
session — see below), so "verified" here means verified in the engine
layer, not visually confirmed pixel-for-pixel; the two are the same code
path (`AnalyticsDashboard` renders exactly this branch on exactly this
data), but flagging the distinction rather than overclaiming. Added a
permanent regression test for this scenario
(`tests/analytics.test.js`, "every gradebook row unmatched").

**Change 1 — "N of M rows matched" visible at a glance.** Two places:
- `GradebookUploadPanel`: preview summary now leads with
  **"N of M rows matched"** (bolded, ambers if any row is unmatched), plus
  a hint line when literally every row is unmatched pointing at the
  enrollment-vs-staging distinction above. The post-upload success message
  now reports matched count too, not just row count.
- `GradebookUploadHistory`: added `getGradebookMatchCounts` to
  `instructorData.js` — one lightweight query (`ccid, student_id` only,
  no joins) across every listed upload's rows, fetched eagerly on load so
  the "N of M matched" badge shows in the **collapsed** header, not just
  after expanding a row. Badge color: neutral when fully matched, amber
  when partial, red when zero matched (the case that's actually suspicious
  rather than just incomplete).

**Change 2 — engagement-tier thresholds: kept as-is, formally closed.**
No new source-paper numbers arrived, so I made the call requested: keep
`minimalPointsMax: 20` / `comprehensiveIndividualShare: 0.15` as the final
v1 defaults rather than re-flagging them. Rationale now documented inline
in `src/engine/analytics.js` (a low individual-share cutoff is deliberate —
the taxonomy should catch "engaged with both paths at all", not require a
near-even split, since large-scale activities will naturally dominate raw
point totals for most students). Still labeled instructor-tunable later in
both the code comment and the dashboard subtitle — "final for v1" isn't
"permanent."

**Change 3 — grade bins switched to UAlberta letter grades.**
`DEFAULT_GRADE_BINS` in `src/engine/analytics.js` is now the 12-band
UAlberta undergraduate scale (A+ 90-100 down to F <50, from the UAlberta
Calendar's grading system) instead of the ad-hoc 5-band percentage ranges,
matching the paper's Figure 6 axis. This feeds both `gradeDistributionByTier`
(grade-by-tier chart) and `gradeHistogram` (before/after chart) —
no separate wiring needed, both already parameterized on `DEFAULT_GRADE_BINS`.
Rewrote both charts' hand-calculated test tables for the new bin edges
(`tests/analytics.test.js`) — the tier-distribution table now exercises
all 12 bins with one distinct grade/tier pair each, instead of the old
5-bin table's coarser coverage. Added `interval={0}` to both charts' X
axes so all 12 short labels stay visible rather than recharts thinning
them out.

**Suite: 146/146** (145 prior + 1 new regression test for the all-unmatched
scatter/tier case). Production build clean, dev server console clean, same
credential wall as before on interactive verification of the ANALYTICS tab
itself.

## 2026-08-17 (overnight) — P10 build: UI layer + verification limits + end-of-night summary

**UI layer built on top of the P10a logic commit (`8191aa7`):**
- `src/lib/instructorData.js`: `getSectionTerm`, `listGradebookUploads`,
  `createGradebookUpload`, `insertGradebookRows`, `getGradebookRows`,
  `deleteGradebookUpload` — plain table reads/writes under existing RLS
  (`p_gb`/`p_gbr`, instructor-only), same shape as the existing
  `createResultSet`/`insertResultRows` pair. No RPC, no migration — see the
  earlier entry above for why that's correct here.
- `src/components/GradebookUploadPanel.jsx` — parse → match → preview →
  upload flow, structurally mirroring `ResultUploadPanel.jsx` (same
  CSV-input/preview-table/ccid-override pattern) minus ranking/curve, plus
  a baseline-cohort checkbox that sets `gradebook_uploads.is_baseline`.
- `src/components/GradebookUploadHistory.jsx` — mirrors
  `ResultSetHistory.jsx`'s expand-to-see-rows pattern; delete instead of
  void, since `gradebook_uploads` isn't a ledger table (documented inline
  in the delete-confirmation copy so a future reader doesn't confuse it
  with `voidResultSet`'s ledger-preserving behavior).
- `src/components/AnalyticsDashboard.jsx` — the 5 requested charts (weekly
  participation individual-vs-large-scale, contributions pie, points-vs-grade
  scatter with Pearson r, grade distribution by engagement tier, before/after
  baseline comparison), all via recharts, all aggregation via
  `src/engine/analytics.js` — the component only fetches and renders, never
  sums. Empty state on every chart for: no point_events yet, no gradebook
  uploaded, no baseline uploaded, and (scatter/tier chart specifically) a
  gradebook uploaded but with zero rows that are both matched-to-a-student
  and graded. A `.fml-report` print stylesheet + "Print / export report"
  button satisfies the "export-report: simple print-friendly view" ask —
  `window.print()` with a `@media print` rule that hides everything outside
  the report container (no separate route/screen needed for something this
  simple).
- Wired into `src/screens/InstructorHome.jsx` as a new ANALYTICS tab,
  following the existing tab/refreshKey wiring pattern used by
  RESULTS/GAMES.

**Verification — what I could and couldn't do without Ahmed's session.**
Per the batch's hard stop on "anything requiring my browser session,
dashboard actions, or credentials": this app's only sign-in paths are
Google OAuth (@ualberta.ca) or an emailed magic link — both need
credentials I don't have, so the ANALYTICS tab itself (behind
`is_instructor_of`-gated routing) could not be exercised end-to-end
in-browser tonight. What I did verify without crossing that line:
- `npm run build` (vite production build) — succeeds, 935 modules
  transformed, no compile/import errors across the 3 new components + 2
  modified files.
- Found the dev server already running on :5173 from the prior session;
  reused it rather than starting a duplicate. Loaded the app's (public)
  login screen — 0 console errors, both auth paths render correctly, HMR
  picked up every new file cleanly as I wrote them (no overlay errors at
  any point).
- Manually cross-checked every field name across the new data flow against
  the actual schema and against precedent elsewhere in the codebase,
  since a wrong column/prop name is a runtime-only failure `vite build`
  won't catch: `gradebook_rows.final_grade`/`letter_grade` (schema, lines
  327-334 of the migration) match what `GradebookUploadHistory.jsx` and
  `AnalyticsDashboard.jsx` read; the `sections -> terms` FK embed returning
  a singular object (not an array) is confirmed against existing usage in
  `StudentShell.jsx:47` (`const term = section.terms`) and consumed
  identically in the new `getSectionTerm`.
- Did NOT add a component-testing harness (no `@testing-library`/jsdom
  exists in this repo) to fake a render check — introducing test
  infrastructure is a tooling decision, not a P10 task, and doing it
  unilaterally overnight felt like exactly the kind of unrequested
  abstraction CLAUDE.md warns against. Flagging instead of doing.

**Morning verification steps (run these to close the loop):**
1. `npm run test:engine` — expect 145/145 (should already show this from
   my last run, but re-run flags any drift).
2. `npm run dev`, sign in as instructor, open a section with an existing
   WuClap/game upload so `point_events` is non-empty.
3. ANALYTICS tab → upload `docs/samples/gradebook_sample.csv` (unchecked
   = current cohort) → confirm the preview shows 5 rows, 1 ungraded
   (`dmockfor`), 1 unmatched-until-roster-import (`enewcomb` — only
   unmatched if that ccid isn't in your test section's roster).
4. Confirm weekly-participation and contributions-pie charts render from
   existing point_events; confirm scatter + tier-distribution charts
   populate once the gradebook is uploaded.
5. Re-upload the same file with the baseline checkbox CHECKED → confirm
   the before/after chart populates.
6. Sanity-check the two flagged default numbers against the paper if you
   have it: `DEFAULT_ENGAGEMENT_TIER_THRESHOLDS` in
   `src/engine/analytics.js` (minimalPointsMax=20,
   comprehensiveIndividualShare=0.15) and `DEFAULT_GRADE_BINS` in the same
   file.
7. Click "Print / export report" and confirm the browser print preview
   shows only the charts (nav/buttons hidden).

**What's done:** P10 gradebook upload + analytics dashboard, per the batch
scope — parser+fixture+tests, engine+tests, upload/history/dashboard UI,
wired into InstructorHome. Build order checklist item P10 can be checked
off pending your morning spot-check.

**What's flagged for your review (not blocking, just judgment calls I
made without you):**
- Engagement-tier thresholds and grade-bin edges (both are labeled
  "defaults, instructor-tunable later" in code and in the UI subtitle, per
  the batch instructions, but I had no source-paper numbers to calibrate
  against).
- The ANALYTICS tab was never exercised in a real logged-in browser
  session — only build + static verification, per the credential hard
  stop above.

**What's still open (not part of tonight's scope):** P9 (team mode), P11
(mock-semester e2e + deploy). Build order otherwise unchanged from before
tonight.

**No hard stops were hit tonight** — no new migration/RLS needed, no
existing SECURITY DEFINER or point-engine function touched, nothing
destructive attempted against the hosted DB.

## 2026-08-17 (overnight) — P10 build starts: preamble verified

Confirmed both prior-session claims before touching anything: `git log -1`
shows the P8 commit (`ca0c560`, "P8: scheduling — cycles, snapshots,
formation expiry, parity gate (123/123 + 21/21)"), working tree clean, and
this NIGHTLOG's first entry is the zseed99 diagnosis below. Proceeding with
Task 3 (P10) per the batch instructions.

**Schema check — no new migration needed.** `docs/fml_data_model.md` §9
(gradebook_uploads/gradebook_rows) is already fully present in
`supabase/migrations/0001_initial_schema.sql` (lines 318-332), RLS already
wired (`p_gb`/`p_gbr`, instructor-only, lines 566-572), and `point_events`
is already instructor-readable within their own section (`p_pe_read`). No
schema/RLS work is required for P10 — the hard-stop-on-new-migration rule
doesn't get triggered.

**No new SECURITY DEFINER function needed either.** Gradebook uploads carry
no ledger write and no multi-row invariant beyond referential integrity
(one `gradebook_uploads` row + N `gradebook_rows` pointing at it) — same
shape as `result_sets`/`result_rows`, which the existing codebase already
writes as plain client-side inserts under RLS (see
`src/lib/instructorData.js` `createResultSet`/`insertResultRows`). Gradebook
upload/insert follows the identical plain-insert pattern; no RPC, no CLAUDE.md
rule-7 concern (that rule is for invariants like "exactly one default row"
or "all-or-nothing across N rows", neither of which applies here — losing a
gradebook upload halfway through just means an incomplete gradebook, not a
correctness violation of a cross-row invariant, and there is no ledger
implication since analytics are computed on read).

**Engine layer built and verified before any UI (rule 3):**
`src/engine/analytics.js` — pure functions, no React/Supabase imports:
- `pearsonR(pairs)` — null (not 0) on <2 points or zero variance in either
  series, so a flat cohort never silently reads as "no correlation."
- `weeklyParticipationByCategory(events, activityTypesById, weeksTotal)` —
  distinct-student counts per week per `individual`/`large_scale` category,
  zero-filled across the full term length.
- `studentCategoryTotals` / `classifyEngagementTier` — the
  Comprehensive/Predominantly-Large-Scale/Minimal taxonomy from the design
  brief §3B. **Flagging for morning review: thresholds are my own
  defaults, not derived from the paper** — `minimalPointsMax: 20` (total
  season points at/under this is "minimal" regardless of mix),
  `comprehensiveIndividualShare: 0.15` (an individual-category point share
  at/above this counts as "comprehensive" rather than "predominantly
  large-scale"). Both are exported as `DEFAULT_ENGAGEMENT_TIER_THRESHOLDS`
  and clearly labeled "defaults, instructor-tunable later" in the code
  comment — no UI to tune them yet, matching the batch instructions
  ("hardcode reasonable defaults... note they're instructor-tunable
  later"). **Ahmed: please sanity-check these two numbers against the
  paper's actual tier boundaries if you have them handy** — I did not have
  the source paper to calibrate against, only the taxonomy's three names
  from the design brief.
- `pointsByActivityType` — pie-chart data; reused `Math.max(0, …)` clamp
  convention from `src/engine/aggregate.js`'s `activityBreakdown` (a voided
  activity type nets negative → renders as 0, never a negative pie slice).
- `pointsVsGrade` — joins ledger totals to `gradebook_rows.final_grade`;
  explicitly excludes unmatched ccids (`student_id == null`) and ungraded
  rows (`final_grade == null`) from the correlation rather than coercing
  them to 0, since a forced zero would bias r toward the origin.
- `gradeDistributionByTier` / `gradeHistogram` — binned into fixed
  `DEFAULT_GRADE_BINS` (90-100/80-89/70-79/60-69/<60). **Flagging: bin
  edges are also my own choice** (standard-ish Canadian percentage bands),
  not from the paper — same instructor-tunable-later caveat applies.

Every function above has a hand-calculated table in
`tests/analytics.test.js` (15 tests), verified internally — table method
documented inline above each test, e.g. the engagement-tier boundary case
(`individual=7.5, large_scale=42.5` → exactly the 0.15 share cutoff →
`comprehensive`, confirming `>=` not `>`) and the negative-clamp case (a
voided individual-category event doesn't let a student "opt out" of
minimal classification by going negative).

**Ingestion layer:** `src/ingest/parseGradebookCsv.js` — Canvas gradebook
export parser, same export family/conventions as `parseRosterCsv.js`
(blank-row + "Points Possible" marker-row skip on empty SIS Login ID,
duplicate ccid = data problem → both rows dropped and reported, not
export-artifact dedup like WuClap's keep-best). Blank `Final Score` is a
legitimate null (ungraded/incomplete), not an error. Fixture:
`docs/samples/gradebook_sample.csv` — fabricated, reuses 4 ccids from
`docs/samples/canvas_roster_sample.csv` (afakerso/bteslety/csample1/dmockfor)
for a plausible same-course story, plus one ccid (`enewcomb`) NOT in the
roster fixture to exercise the "unmatched at match-time" path, plus one
genuinely ungraded row (`dmockfor`, blank Final Score). 7 tests in
`tests/parseGradebookCsv.test.js`, including a synthetic (not
fixture-embedded, per the existing convention in `parseWuclapCsv.test.js`)
duplicate-ccid case.

**Suite status after this milestone: 145/145** (123 baseline + 15 analytics
+ 7 gradebook parser). Continuing to the UI layer (upload panel + analytics
dashboard + InstructorHome wiring) next, per rule 3 now that logic is green.

## 2026-08-17 — "zseed99 lost its enrollments" (it hadn't)

**Symptom:** after the P8 parity fixture wipe, signing in as the zseed99
viewer hit the "We couldn't find your enrollment" screen. Suspicion fell on
`tests/parity/fixture_wipe.sql` over-sweeping by profile marker.

**Verdict: fixture_wipe exonerated.** File and executed SQL key strictly on
the two `b000` fixture section ids; DB state confirmed zero collateral —
zseed99's profile and BOTH its enrollments (EB1 + B1, created 06:56 Aug 16)
intact, EB1 roster still 13, B1 roster still 2.

**Root cause: sign-in inputs.** The working Aug-16 session used the alias
`mowafysa+seed@ualberta.ca`; the failing Aug-17 attempts used
`mowafysa+seed99@ualberta.ca` — a different plus-alias, i.e. a fresh auth
user with no profile. The CCID prompt then got two typos (`zeed99`,
`mowafysa+zeed99`). A correctly typed ccid still wouldn't have linked the
new user: both staging rows were consumed at first sign-in, and consumed
`pending_enrollments` rows are audit, not re-linkable (data model §11) —
the system refused correctly.

**What made it reconstructable:** the `unlinked_signins` audit table logged
both failing attempts with email + attempted ccid + auth_user_id; the
consumed staging rows carried timestamps matching the surviving
enrollments. No repair needed — resolution was signing in with the
original alias.

**Forensics gotcha for next time:** the dashboard SQL editor's results grid
CLIPS long cells horizontally (a cell reading `B1 + EB1` displayed as
`EB1`, briefly implying the B1 enrollment was gone). Read result cells via
the DOM / export, never from the rendered grid, before concluding a row is
missing.
