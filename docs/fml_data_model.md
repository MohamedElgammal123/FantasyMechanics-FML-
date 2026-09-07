# FML Data Model — v1 (for approval)

Design principle: **point rules are data, not code.** The point engine is a pure
function over (result_set, payout_curve) → point_events. Everything time-based
(cycles, windows, deadlines) is derived from stored config, never hardcoded.

---

## 1. Identity & structure

### `profiles`  (extends Supabase `auth.users`)
| column | type | notes |
|---|---|---|
| id | uuid PK | = auth.users.id |
| full_name | text | |
| ccid | text unique | university ID, matching key for CSV uploads |
| role | enum: `student` \| `instructor` \| `admin` | |
| created_at | timestamptz | |

### `courses`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| code | text | e.g. "ENGG 130", "CIVE 270" |
| name | text | e.g. "Engineering Mechanics" |

### `terms`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Winter 2027" |
| season_label | text | e.g. "SEASON 2027" (display) |
| week1_start | date | anchor for all week-number math |
| weeks_total | int | e.g. 13 |

### `sections`  — each section is its own independent competition
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| course_id | uuid FK → courses | |
| term_id | uuid FK → terms | |
| code | text | e.g. "EB1" |
| instructor_id | uuid FK → profiles | instructors can own many sections across many courses |
| team_unlock_week | int nullable | e.g. 7; null = team mode off |
| team_formation_deadline | timestamptz nullable | |
| team_size | int default 3 | |
| team_scoring_mode | enum: `from_unlock` \| `full_season` | default from_unlock |
| weekly_claim_cap | int nullable | e.g. 10; null = uncapped |

All competition config (curves, claim rules, caps, team settings, prize tiers)
lives at the **section** level, so two sections of the same course — or sections
of different courses — can run completely different competition styles.
A student may be enrolled in one section per course-term (so someone taking
ENGG 130 and CIVE 270 simultaneously appears in both, independently).

### `enrollments`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | |
| student_id | uuid FK → profiles | |
| UNIQUE(section_id, student_id) | | one section per student per term enforced in app logic |

**Section isolation:** every leaderboard, cycle, team, and result set is scoped
by `section_id`. RLS: students read only their own section's data.

---

## 2. Activities & payout curves

### `activity_types`  (seed data, per the paper's taxonomy)
| column | type | notes |
|---|---|---|
| id | text PK | `discussion`, `correct_mistakes`, `act_as_professor`, `demo`, `wuclap`, `game` |
| category | enum: `individual` \| `large_scale` | drives dashboard breakdown |
| scoring_mode | enum: `claim` \| `ranked_upload` | claim = approval queue; ranked_upload = results-set flow |

### `payout_curves`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | curves are per-section |
| name | text | e.g. "WuClap default", "Centroid Tetris MD6" |
| top_points | int | e.g. 10 |
| step | int | e.g. 1 (points decrease by this per rank) |
| ranked_cutoff | int | e.g. 8 → ranks 1..8 get curve points |
| participation_floor | int | e.g. 1; 0 = no floor |
| is_wuclap_default | bool | exactly one true per section |

Curve math (pure function, test harness required before UI):
`points(rank) = rank <= cutoff ? top_points - (rank-1)*step : participation_floor`
Invariant: `top_points - (cutoff-1)*step >= participation_floor` (validated on save).
Tie handling: equal ranks share the same rank value; next rank skips (standard competition ranking). Confirm.

---

## 3. Games

### `games`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | |
| title | text | |
| blurb | text | |
| matchday | int | fixture numbering |
| thumbnail_url | text nullable | |
| launch_url | text | where the standalone game lives |
| opens_at / closes_at | timestamptz | window |
| payout_curve_id | uuid FK | per-game curve |
| status | derived, not stored | `upcoming` / `open` / `closed` / `finalized` from timestamps + result set existence |

`players_count` on the open-game card: Phase 1 = count of `game_launches`
(row inserted when a student clicks PLAY); cheap and honest without live scores.

### `game_launches`
| student_id, game_id, launched_at | | dedup on (student_id, game_id) |

---

## 4. Results ingestion (shared WuClap/game flow — screen 2c)

### `result_sets`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | |
| source | enum: `wuclap` \| `game_upload` \| `game_api` | game_api reserved for Phase 2 |
| game_id | uuid FK nullable | required when source = game_* |
| label | text | e.g. "Lecture 18" |
| payout_curve_id | uuid FK | curve snapshot used |
| uploaded_by | uuid FK → profiles | |
| uploaded_at | timestamptz | |
| file_name | text | audit |
| status | enum: `parsed` \| `posted` \| `voided` | preview → post workflow; voided = mistake reversal |

### `result_rows`
| column | type | notes |
|---|---|---|
| result_set_id | uuid FK | |
| ccid | text | raw from sheet |
| student_id | uuid FK nullable | resolved match; null = unmatched (shown in validation UI) |
| rank | int nullable | null = participated, unranked |
| raw_score | numeric nullable | kept for audit |

Posting a result set = the point engine emits one `point_event` per matched row,
atomically, and flips status to `posted`. Re-posting is blocked; voiding
reverses via compensating negative events (append-only ledger, no deletes).

### WuClap column mapping (P6, `src/ingest/parseWuclapCsv.js`)

Fixture: `docs/samples/wuclap_results_sample.csv` (a real, sanitized export).

| source column | maps to | notes |
|---|---|---|
| `Email` | `ccid` | local-part before `@`, lowercased — the same derivation used at login to link a student's `@ualberta.ca` account to their roster ccid. An alias-format email (e.g. `first.lastname@ualberta.ca`) still parses fine; it just won't match an enrollment, same as any other unmatched ccid (`matchCcids.js`) — not a parse error. |
| `Points ??` | `raw_score` | WuClap's own literal, un-renamed header. This is the ranking input — `rankResultRows` (`src/engine/results.js`) assigns rank, never the parser. |
| `Username` / `First name` + `Last name` | display only | not used for matching |
| `#`, `Q1`/`Q2`/`Q3`, `Total` | ignored | per-question detail, not the ranking input |

Row skip rule: any row with an empty `Email` is skipped as a non-data row
(catches the trailing "Average" footer row and blank lines) — not matched
against a specific footer label, since that could change between exports.

Duplicate ccid (e.g. a double-submission/export artifact): **keep-best** —
the higher `raw_score` survives, reported as a non-blocking `notices` entry
(never an error, never silently dropped). Chosen over keep-last so a
student's leaderboard position is never decided by row order in the
export rather than performance.

### Game results export contract (P7, `src/ingest/parseGameCsv.js`)

Ahmed controls both ends of this format (the standalone games export it,
the instructor upload panel parses it), so it's specified once here rather
than reverse-engineered from a live export like WuClap's.

| column | notes |
|---|---|
| `ccid` | required, lowercased/trimmed on parse; matched against the roster the same as WuClap |
| `score` | numeric, higher = better (same direction as WuClap's `raw_score`, so `rankResultRows` needs no per-source branching); blank = participated but unranked, not an error |

Header row required (`ccid,score`), one row per player, **no blank or
footer rows** — unlike the WuClap export, this format is fully
Ahmed-controlled, so the exporter should simply never emit them. A row
with an empty `ccid` or a non-numeric `score` is a parser **error**
(reported, row dropped), not silently skipped. Duplicate ccid: keep-best
(higher score survives), reported as a non-blocking notice — same rule as
WuClap. Fixture: `docs/samples/game_results_sample.csv`.

---

## 5. Points ledger (single source of truth)

### `point_events`  — append-only
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | denormalized for cheap leaderboard queries |
| student_id | uuid FK | |
| activity_type_id | text FK | |
| points | int | can be negative only for voids |
| source_kind | enum: `result_set` \| `claim` \| `adjustment` | |
| source_id | uuid | FK to result_sets or claims |
| occurred_at | timestamptz | drives week/cycle attribution |
| week_number | int | computed from term.week1_start at insert; stored for fast grouping |

Everything on the dashboards derives from this table:
- **Total points** = SUM per student
- **"+28 this week"** = SUM where week_number = current
- **Rank & ▲/▼ trend** = rank now vs rank at end of previous week (see snapshots)
- **Cycle standings** = SUM where week_number in cycle's weeks
- **Points breakdown** = SUM grouped by activity_type

### `rank_snapshots`  (materialized weekly by scheduled job)
| section_id, student_id, week_number, rank, total_points | | powers trend arrows without expensive historical queries |

---

## 6. Claims (individual activities only)

### `claim_rules`  (per section, per claim-type activity)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | |
| activity_type_id | text FK | must have scoring_mode = claim |
| base_points | int | e.g. discussion = 3, act_as_professor = 10 |
| escalation_step | int default 0 | correct_mistakes: base 2, step 1 → 1st mistake 2 pts, 2nd 3 pts… |
| escalation_cap | int nullable | e.g. 5 → value never exceeds 5 per claim |
| escalation_scope | enum: `per_lecture` | counter resets each lecture date |

Claim value shown to the student at submission =
`min(base + step × (nth_claim_of_type_that_lecture − 1), cap)` — computed
server-side so students see exactly what a claim is worth before submitting.
Rejected claims do not consume escalation slots (the counter counts pending +
approved claims only).

### `claims`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id, student_id | FKs | |
| activity_type_id | text FK | |
| lecture_date | date | drives escalation counter + weekly cap |
| description | text | "caught sign error in moment equation" |
| computed_points | int | from claim_rules at submission time |
| awarded_points | int nullable | instructor may override at approval (e.g. exceptional answer → 12) |
| status | enum: `pending` \| `approved` \| `rejected` | |
| reviewed_by / reviewed_at | | |

Approval emits a `point_event` for `awarded_points ?? computed_points`;
rejection does not. APPROVALS badge = count of pending claims.

### Instructor ad-hoc grants
Sometimes the instructor tells a specific student "claim 10 points." Two paths:
1. Student submits a normal claim; instructor overrides `awarded_points` to 10 at approval. (No extra build.)
2. `adjustment` point_events: instructor directly grants points to a student with a reason string — appears in the student's history as "Instructor award". (Small extra build, cleaner.)
v1 includes **both** — path 2 is a tiny form on the approvals screen.

### Weekly claim cap (optional, per section)
`sections.weekly_claim_cap int nullable` — e.g. 10. Enforced at submission:
if approved + pending claim points for the current week **plus the new claim's
value** would exceed cap, submission is blocked with a clear message ("Weekly
claim cap reached — resets Monday"). Landing exactly on the cap is allowed;
overshoot is impossible. Approved claims count `awarded_points ?? computed_points`;
pending count `computed_points`; rejected count nothing. The cap keys on the
submission-time current week. Instructor ad-hoc grants are exempt from the cap.
Null = no cap.

---

## 7. Bi-weekly cycles

### `cycles`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | |
| number | int | 1, 2, 3… |
| week_start / week_end | int | e.g. 1–2, 3–4 |
| finalized_at | timestamptz nullable | |

### `cycle_champions`  (supports co-champions on ties)
| cycle_id, student_id, points | | one row per champion; a tie at the top produces multiple rows, all displayed as co-champions with a shared crown |

Cycles are generated when a section is created (weeks_total / 2). Current cycle
standings computed live from point_events; a scheduled job (or the first
instructor page-load after the boundary) finalizes champions. **Ties = co-champions.**

---

## 8. Teams

### `teams`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | |
| name | text | captain-set; default "Team N" when auto-grouped |
| captain_id | uuid FK → profiles | |
| status | enum: `forming` \| `locked` \| `auto_grouped` \| `incomplete` | |
| locked_at | timestamptz nullable | |

### `team_members`
| team_id, student_id, joined_at | | UNIQUE(student_id) within section — one team per student |

### `team_invites`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| team_id | uuid FK | |
| invitee_id | uuid FK | |
| status | enum: `pending` \| `accepted` \| `declined` \| `expired` \| `cancelled` | |
| sent_at / responded_at | | |

Rules encoded in app logic + DB constraints:
- Invites only within the same section; invitee not already on a locked team.
- Team locks automatically when members = team_size (3) and all invites resolved.
- All invites auto-expire at section.team_formation_deadline.
- **Deadline expiry (P8, approved):** pending invites → `expired`; `forming`
  teams at team_size → `locked`; under-sized `forming` teams are filled from
  the unteamed pool (students in ccid order, teams in created_at order),
  **keeping their name and captain** → `auto_grouped` on reaching team_size,
  `incomplete` otherwise; the remaining pool forms new "Team N" teams of
  team_size (captain = first member), and the final remainder — even a single
  student — becomes an `incomplete` team. Teams are never oversized.
  **P9 UI obligation:** disclose deadline auto-fills to both the incoming
  student and the existing members ("s06 was added to your team at the
  formation deadline"); surface `incomplete` teams to the instructor.
- **Team scoring mode — instructor setting** (`sections.team_scoring_mode`):
  - `from_unlock` (default): team points = SUM of members' point_events where
    `week_number >= team_unlock_week`. Everyone starts the team race at 0 —
    a fresh competition regardless of first-half performance.
  - `full_season`: team points = members' full-season sum.
  The individual leaderboard **always continues alongside** in both modes.
  The team hero card should display the active mode (e.g. "COUNTING FROM WK 7").

### `prize_tiers`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK | |
| scope | enum: `team` \| `individual` | design shows team; individual reserved |
| name | text | Bronze / Silver / Gold |
| threshold_points | int | 900 / 1400 / 2000 |
| reward_text | text | "Mola kit for every member" |

---

## 9. Gradebook & analytics

### `gradebook_uploads`
| id, section_id, uploaded_by, uploaded_at, file_name | | |

### `gradebook_rows`
| gradebook_upload_id, ccid, student_id nullable, final_grade numeric, letter_grade text | | |

Analytics (screen 1e) are **computed on read** from point_events + gradebook_rows —
no stored analytics tables in v1:
- Weekly participation bars: distinct students with ≥1 event, per week, per category
- Pie: SUM(points) grouped by activity_type
- Pearson r + scatter: join student totals × final_grade
- Engagement tiers: classify per paper's taxonomy (thresholds instructor-tunable later; v1 hardcode reasonable defaults and label them clearly)
- Pre-FML comparison: instructor uploads a historical gradebook flagged `is_baseline = true` (add bool column to gradebook_uploads)

---

## 10. Row-level security sketch

- students: SELECT own profile; SELECT enrollments/leaderboard/cycles/teams/games/result summaries **within own section**; INSERT own claims; INSERT/UPDATE own team invites (as captain) / responses (as invitee)
- students may NOT read: other students' claim details, gradebook tables, result_rows raw scores
- instructors: full read/write within sections they own
- point_events: INSERT only via server-side function (Postgres function w/ SECURITY DEFINER); never writable directly by clients

---

## 11. Auth & roster linking

`pending_instructors` (matched on email) and `pending_enrollments` (matched on
ccid) are staging tables an instructor populates before a person's first
sign-in — `profiles.id` is a hard FK to `auth.users`, so no profile can exist
until then. `link_user_on_first_login` (SECURITY DEFINER, called on every
login) checks the instructor table first, then the roster table; on a match it
creates the profile + enrollment and marks the staging row `consumed_at`. On
every subsequent login it also sweeps for other unconsumed `pending_enrollments`
rows matching that ccid and enrolls those too, so a student staged in two
sections (e.g. two courses the same term) ends up enrolled in both regardless
of login order. Consumed rows are kept forever as an audit trail; only
unconsumed rows may be deleted (an instructor correcting a mistake, not
rewriting history). A ccid mismatch on the automatic pass lets the student
retry with a typed CCID; a second miss is recorded in `unlinked_signins` for
the instructor to resolve by hand.

---

## Resolved decisions (v1.1)

1. Ranked payout ties: standard competition ranking (1, 2, 2, 4). ✓
2. Cycle champion ties → **co-champions** (cycle_champions table). ✓
3. Team scoring: instructor-selectable `from_unlock` (default) or `full_season`;
   individual leaderboard always runs alongside. ✓
4. Multi-course: courses table added; every section is an independent
   competition; one section per student per course-term. ✓
5. Claims: instructor-set `claim_rules` per activity with **escalating
   Correct-the-Mistakes values** (base 2, +1 per subsequent mistake that
   lecture, capped), per-claim instructor override at approval, direct
   instructor ad-hoc grants, and an optional **weekly claim cap** per section. ✓
