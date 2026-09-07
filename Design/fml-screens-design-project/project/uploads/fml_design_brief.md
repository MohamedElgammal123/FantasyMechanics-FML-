# Fantasy Mechanics League (FML) — Web Platform Design Brief

## 1. Brand identity (from existing logo)
- **Palette:** deep navy (#0F1B2E) base, steel blue (#4A7FB8 / #6B9BC9) accents, cream/off-white (#F2ECD9) for headline type, silver/gunmetal for icon linework, subtle blueprint-grid texture as background texture.
- **Motifs:** gears, wrenches, crests/badges, ribbon banners, "EST." and season-badge sports-league heraldry, star accents.
- **Typography feel:** bold condensed varsity/collegiate display font for headlines ("FANTASY MECHANICS LEAGUE"), clean condensed sans for labels/UI (mirrors "ENG 130", "SEASON 2025" treatment).
- **Tone:** competitive-but-fun varsity sports league, engineering-nerd pride, not corporate SaaS.

## 2. Product overview
FML is a gamified engagement platform for large first-year Engineering Mechanics classes (ENG 130 and similar). Students earn points through in-class activities and competitive mini-games; points roll up into section leaderboards; instructors get participation and performance analytics tied to gradebook uploads.

## 3. User roles
### A. Student
- Sign in (SSO/university auth)
- Personal dashboard: current rank in their section, total points, points breakdown by activity type (discussion, correct-mistakes, act-as-professor, demos, Menti, MecSimCalc, games)
- Section leaderboard (top N + "you are here" if off top of list)
- Games hub: list of available games, each with open/close time window, current standings, and point payout table (instructor-defined, e.g. 1st=20, 2nd=19...10th=11)
- Claim/history log of points (submitted → pending → approved/rejected), mirroring the paper's claim-and-approval workflow
- Notifications/countdown for upcoming game windows to drive participation

### B. Instructor
- Section management (multiple lecture sections run independently, per the paper's fairness design)
- Point rule configuration per activity type and per game (define payout curve: rank 1→N points)
- Game scheduling (open/close times, "C5" style time-boxed windows)
- Point-claim approval queue
- Gradebook upload (CSV) → auto-generates the exact analytics from the paper:
  - Weekly participation trend, individual vs. large-scale (stacked/grouped bar, Weeks 1–13)
  - Pie chart of contributions by activity type
  - Pearson correlation scatter: FML points vs. final grade
  - Grade distribution by engagement tier (Comprehensive / Predominantly Large-Scale / Minimal)
  - Before/after FML grade-distribution comparison
  - Course evaluation delta charts (Strongly Agree % before/after)
  - Overall participation-rate-over-time headline stat (e.g. 3.5% → 27.4%)
- Export report (for papers/conference submissions like this one)

## 4. Games system
- Games are separate mini-experiences (e.g. Centroid Tetris — existing; plus room for new ones)
- Each game: title, thumbnail, rules blurb, open/close datetime, live leaderboard, payout table set by instructor
- On close, final ranks auto-convert to FML points per the configured payout curve
- Games hub should visually read as a "league schedule" — think fixture list / season calendar, reinforcing the fantasy-sports metaphor

## 5. Key screens to design in Claude Design
1. **Landing / sign-in** — logo-forward, hero crest treatment, sign-in card
2. **Student dashboard** — rank card, points breakdown, section leaderboard, upcoming games strip
3. **Leaderboard (full)** — section-filterable, ranked list/table with avatar, points, trend indicator
4. **Games hub** — card grid of games with countdown timers, "open now" vs "upcoming" vs "closed" states
5. **Individual game page** — rules, live standings, payout table, play/launch button
6. **Instructor dashboard** — section switcher, quick stats (participation %, avg points, correlation r), charts gallery
7. **Instructor: gradebook upload + report** — upload flow, generated analytics matching Section 4 of the paper
8. **Point-claim approval queue** (instructor) and **claim history** (student)

## 6. Interaction/motivational design notes
- Leaderboard should feel alive — subtle rank-change animations, "climbing/falling" indicators
- Countdown timers on games to create urgency (matches paper's "revive hope" mid-semester re-engagement finding)
- Visually separate Individual Engagement Activities vs. Large-Scale Interactive Activities (paper's own taxonomy) so students understand both paths to points
- Badge/keepsake visual language for top finishers (echoes real prizes: Mola kits, papyrus keepsakes)
