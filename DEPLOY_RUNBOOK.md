# FML Production Deploy Runbook

One sitting, top to bottom, no thinking required. Written 2026-08-23
(after migration 0013). Everything here is YOURS to execute — the dev
project (`jnhktkejfsnuvvhdsrak`, "Fantasy Mechanics League") stays dev
and is never touched by this document.

Have ready before you start: your GitHub login, your Google Cloud
console login, ~45 minutes.

---

## 1. Create the production Supabase project

1. https://supabase.com/dashboard → your org (Mowafy's Org) →
   **New project**.
2. Fields:
   - **Name:** `fml-production`
   - **Database password:** click **Generate a password**, then SAVE IT
     in your password manager immediately (labelled
     "fml-production DB password"). You will rarely need it (the
     dashboard SQL editor doesn't ask), but losing it means a reset.
   - **Region:** `ca-central-1` (Canada — Montréal). Student data
     stays in Canada.
   - Plan: Free is fine for a 1-section pilot.
3. **Create new project** → wait for provisioning (~2 min, status
   turns green).
4. Note the new project's **ref** (the random string in the URL:
   `supabase.com/dashboard/project/<ref>`). You'll need it twice below.

## 2. Apply migrations 0001 → 0013, in exact order

Open **SQL Editor** (left sidebar, `>_` icon) in the NEW project.
For each file below, in this exact order: open the file from
`supabase/migrations/` in your editor, copy the WHOLE file, paste into
a fresh query tab, click **Run** (or Ctrl+Enter).

Known dialog quirks, so nothing surprises you:
- **"Potential issue detected — destructive operations"** — appears on
  any file containing `drop` / `delete` (0013's `drop function` will
  trigger it; others may depending on dashboard version). The drops are
  the migration's own intent → click **Run query**.
- **`raise notice` output is SWALLOWED** — the editor shows only
  "Success. No rows returned" even when a DO-block printed notices.
  Success text is your only signal; that's expected, not a failure.
- If a run errors halfway, STOP. Do not re-run blindly — read the
  error, and remember most of these files are not idempotent (a
  half-applied file may need surgical cleanup before retry).

| # | File | Expected result |
|---|------|-----------------|
| 1 | `0001_initial_schema.sql` | Success. No rows returned |
| 2 | `0002_reference_table_policies.sql` | Success. No rows returned |
| 3 | `0003_auth_linking.sql` | Success. No rows returned |
| 4 | `0004_pending_enrollment_admin.sql` | Success. No rows returned |
| 5 | `0005_link_multi_section.sql` | Success. No rows returned |
| 6 | `0006_pending_enrollment_delete.sql` | Success. No rows returned |
| 7 | `0007_claims_submission.sql` | Success. No rows returned |
| 8 | `0008_bulk_pending_enrollments.sql` | Success. No rows returned |
| 9 | `0009_set_wuclap_default_curve.sql` | Success. No rows returned |
| 10 | `0010_result_sets_student_read.sql` | Success. No rows returned |
| 11 | `0011_scheduling.sql` | Success. No rows returned (registers the pg_cron job silently) |
| 12 | `0012_team_formation_rpcs.sql` | Success. No rows returned |
| 13 | `0013_consent_and_domain.sql` | Destructive-op dialog (its `drop function`) → **Run query** → Success. No rows returned |

Post-apply checks (paste each into the SQL editor):

```sql
-- 13 = every migration's objects landed; spot-check three:
select count(*) from pg_proc where proname in
  ('link_user_on_first_login','post_result_set','create_team',
   'respond_to_team_invite','run_all_sections_maintenance');
-- expect 5

select * from cron.job;
-- expect one row: jobname 'fml-maintenance', schedule '5 0 * * *'
-- (if this errors with "relation cron.job does not exist", pg_cron
-- didn't register — Dashboard → Database → Extensions → enable
-- pg_cron, then re-run ONLY the DO-block at the bottom of 0011)

select column_name from information_schema.columns
where table_name = 'profiles' and column_name = 'consent_at';
-- expect 1 row (proves 0013 landed)
```

## 3. Custom SMTP for auth emails

Why: the built-in Supabase email service delivers roughly ONE email
per address per hour and silently drops the rest — we measured this on
dev on 2026-08-23. Fine for you alone; useless the first day students
try magic links.

**Comparison:**

| | University SMTP relay | Resend (free tier) |
|---|---|---|
| Setup | IT ticket to UAlberta, wait for approval, get relay creds | Self-serve, ~15 min |
| Sender address | Can be an @ualberta.ca address (best trust) | Must be a domain YOU own and verify — you cannot verify ualberta.ca |
| Limits | Whatever IT grants | 3,000/month, 100/day, 1 verified domain (free) |
| Risk | Ticket latency; policy questions about a personal web app relaying as ualberta.ca | 100/day cap on a magic-link stampede |

**Recommendation: Resend.** Self-serve today, no IT dependency, and
the 100/day cap is fine in practice because Google OAuth is the
primary sign-in — magic links are the fallback path only. (If you
don't own a domain yet, buy any cheap one first — Resend can't send
from a bare free account except to your own address.) Revisit
university SMTP only if IT offers it without friction.

Steps (Resend):
1. https://resend.com → sign up (free) → **Domains** → **Add domain**
   → enter your domain → add the DNS records it shows (2× DKIM TXT,
   1 MX for bounces) at your DNS host → wait for **Verified**.
2. Resend → **API Keys** → **Create API key** (name `fml-smtp`,
   permission: Sending access) → copy it (shown once).
3. Supabase dashboard (fml-production) → **Authentication** →
   **Emails** → **SMTP Settings** → toggle **Enable Custom SMTP**, fill:
   - **Sender email:** `fml@<your-domain>` (any local part you like)
   - **Sender name:** `Fantasy Mechanics League`
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** the API key from step 2
   → **Save**.
4. Same Authentication → **Rate Limits** page: raise "emails per hour"
   from the default (30) to something sane like 100 — Supabase caps
   sends even over custom SMTP.
5. Test: production app login page → magic link to YOUR address →
   arrives within a minute, from your domain.

## 4. Google OAuth for the production URL

You already have a working OAuth client for dev — production adds one
redirect URI to it and sets the production Supabase callback.

1. First get the production callback URL: Supabase (fml-production) →
   **Authentication** → **Sign In / Providers** → **Google** — copy the
   **Callback URL (for OAuth)** shown there. It is
   `https://<prod-ref>.supabase.co/auth/v1/callback`.
2. https://console.cloud.google.com → the project that holds the
   existing FML OAuth client → **APIs & Services** → **Credentials** →
   click the OAuth 2.0 Client ID you use for FML.
3. Under **Authorized redirect URIs** → **+ ADD URI** → paste the
   production callback from step 1. (Keep the dev one; both coexist.)
4. Under **Authorized JavaScript origins** → **+ ADD URI** → your
   Vercel URL (e.g. `https://fml-platform.vercel.app` — you'll have it
   after §5; come back if needed). **Save.**
5. Copy the client's **Client ID** and **Client secret** (top right of
   the same page).
6. Supabase (fml-production) → Authentication → Sign In / Providers →
   **Google** → toggle **Enable**, paste **Client ID** and
   **Client Secret** → **Save**.
7. Supabase → **Authentication** → **URL Configuration**:
   - **Site URL:** your production app URL (the Vercel URL from §5).
   - **Redirect URLs:** add the same production URL (with `/**` if you
     want deep-link returns, e.g. `https://fml-platform.vercel.app/**`).
   This is what makes the post-login redirect land on the app instead
   of localhost.

## 5. Vercel

1. https://vercel.com → **Add New… → Project** → **Import Git
   Repository** → pick `Mowafysa/fml-platform` (authorize the GitHub
   app if asked).
2. Framework preset: **Vite** (auto-detected). Build settings
   (defaults are correct — verify, don't change):
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
   (SPA deep links are already handled — `vercel.json` in the repo
   rewrites everything to `index.html`.)
3. **Environment Variables** — add exactly these two (both scopes:
   Production + Preview):
   - `VITE_SUPABASE_URL` = `https://<prod-ref>.supabase.co`
     (Supabase fml-production → Project Settings → API → Project URL)
   - `VITE_SUPABASE_ANON_KEY` = the **anon / public** key from the
     same API settings page. (NEVER the service_role key — see §9.)
4. **Deploy** → wait for the build → note the production URL.
5. Loop back: put that URL into §4 step 4 (JS origins) and §4 step 7
   (Site URL + Redirect URLs).

## 6. Production bootstrap (your account + first section)

1. **Your instructor row** — production SQL editor:
   ```sql
   insert into pending_instructors (email, full_name, role)
   values ('mowafysa@ualberta.ca', 'Ahmed Mowafy', 'instructor');
   ```
   (This table is dashboard-only by design — no app UI can write it.)
2. **First sign-in:** open the production URL → Sign in with Google →
   pick mowafysa@ualberta.ca → you WILL see the consent screen
   ("Joining the Fantasy Mechanics League" — 0013 gates every first
   profile, instructors included) → **I agree — join the league** →
   you land on the instructor home. Verify in SQL:
   `select role, consent_at from profiles;` → 1 row, instructor,
   consent_at not null.
3. **Create the real section** — instructor home → **+ New section**:
   course code/name, term (week1_start = the real Monday of week 1,
   weeks_total = 13), section code (e.g. `EB1`).
   **Team settings: leave team deadline fields NULL/empty** — team
   mode config is P9-config-day business, mid-semester, not day one.
4. **Payout curves** — CURVES tab:
   - [ ] WuClap default curve (e.g. top 10, step 1, cutoff 8,
     floor 1) — tick "WuClap default".
   - [ ] One game curve (e.g. top 20, step 2, cutoff 10, floor 1).
5. **Claim rules** — set per activity (same values as the paper/dev
   unless you've decided otherwise):
   - [ ] discussion: base 3, no escalation
   - [ ] correct_mistakes: base 2, step 1, cap 5
   - [ ] act_as_professor: base 10
   - [ ] demo: base 5
   - [ ] weekly claim cap on the section (e.g. 10) if you want one
6. **Prize tiers:** skip until team mode unlocks (P9 config day).

## 7. Real Canvas roster upload

1. Canvas → your course → **Grades** → **Export** → Export Entire
   Gradebook → you get a CSV with `Student`, `SIS User ID`,
   `SIS Login ID` columns — that's the format the importer expects
   (ccid = SIS Login ID).
2. FML instructor home → ENROLLMENTS tab → **IMPORT ROSTER (CSV)** →
   choose the file → review the preview (row count should match the
   class list; the parser skips the "Points Possible" marker row
   automatically) → confirm.
3. Every student lands in `pending_enrollments` as
   **"Awaiting first login"**. They link themselves at first sign-in;
   anyone whose Google local-part ≠ CCID gets the typed-CCID prompt,
   and a second miss lands in the unlinked queue for you.
4. Spot-check: `select count(*) from pending_enrollments;` equals the
   roster size.

## 8. Day-one smoke test (10 minutes)

Do these in order on the PRODUCTION URL:

1. Incognito window → production URL → login page renders, fonts and
   blueprint background correct (proves Vercel build + env vars).
2. Sign in with Google as yourself → NO consent screen (you consented
   in §6) → instructor home with your section.
3. Magic-link sign-in test: sign out → request a magic link to
   mowafysa@ualberta.ca → arrives from YOUR domain within a minute
   (proves custom SMTP) → link signs you in.
4. ENROLLMENTS tab shows the imported roster, all "Awaiting first
   login".
5. Ask ONE real student (or your tester) to sign in with Google →
   consent screen shows → agree → they land on the student dashboard,
   roster row flips to "Linked" (proves the whole 0003/0005/0013
   linking path).
6. CURVES tab: WuClap default badge on exactly one curve.
7. Upload one tiny WuClap CSV (even 3 rows) → preview → post →
   student dashboard shows points; leaderboard populates (proves
   post_result_set + RLS reads).
8. Void that result set → points reverse to 0 (proves the ledger's
   compensating-event path) — or keep it if it was a real lecture.
9. Student submits one claim → APPROVALS badge shows 1 → approve →
   points land (proves claim flow).
10. `select * from cron.job;` still shows fml-maintenance (nightly
    cycle finalization + snapshots are armed).

Any step failing: stop, note WHICH step, fix before inviting the
class. Steps 1–4 alone are enough to declare the deploy itself good.

## 9. Explicit DON'Ts

- **NO seed data in production. Ever.** `seed.sql`, `seed_wipe.sql`,
  `seed_p9_addendum.sql`, `verify_0012…`, and anything zseed-marked
  are DEV-ONLY. The seed's own tripwire aborts if it sees a real
  class, but do not rely on it — just never paste seed files here.
- **service_role key: never in the repo, never in Vercel env vars,
  never in the client.** The app uses the anon key only, everywhere.
  The service_role key exists only inside the Supabase dashboard.
- **The dev project stays dev.** Different ref, different keys,
  different OAuth redirect. Never point Vercel at
  `jnhktkejfsnuvvhdsrak`, and never apply an experiment to
  fml-production first.
- **point_events is append-only in production exactly like dev** —
  mistakes are voided via the UI (`void_result_set`) or compensating
  adjustments, never edited in the SQL editor.
- **Don't run ad-hoc UPDATE/DELETE in the production SQL editor**
  outside this runbook's steps. Dashboard SQL bypasses RLS; treat it
  as a scalpel you haven't been told to pick up.
