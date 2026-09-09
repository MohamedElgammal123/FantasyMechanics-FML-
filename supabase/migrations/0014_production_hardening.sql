-- ============================================================
-- 0014: explicit Data API privileges + production hardening.
--
-- Supabase projects created under the 2026 secure defaults do not
-- automatically grant Data API access to new public-schema objects.
-- Keep the API surface reproducible here instead of depending on a
-- project-level "automatically expose" switch.
-- ============================================================

-- These reference tables already have policies in 0002. Policies are
-- enforced only after RLS is enabled.
alter table public.courses enable row level security;
alter table public.terms enable row level security;
alter table public.activity_types enable row level security;

-- No signed-out route reads application data.
revoke all privileges on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Every signed-in screen reads through RLS. Writes are limited to the
-- operations used by the client; SECURITY DEFINER RPCs own ledger and
-- other atomic multi-row writes.
grant select on all tables in schema public to authenticated;

grant insert on table public.courses, public.terms, public.sections,
  public.enrollments, public.payout_curves, public.games,
  public.game_launches, public.result_sets, public.result_rows,
  public.claim_rules, public.team_invites, public.prize_tiers,
  public.gradebook_uploads, public.gradebook_rows to authenticated;

grant update on table public.sections, public.payout_curves, public.games,
  public.result_sets, public.result_rows, public.claim_rules, public.claims,
  public.teams, public.team_invites, public.prize_tiers,
  public.gradebook_uploads, public.gradebook_rows to authenticated;

grant delete on table public.pending_enrollments, public.payout_curves,
  public.games, public.result_sets, public.result_rows, public.claim_rules,
  public.prize_tiers, public.gradebook_uploads, public.gradebook_rows
  to authenticated;

-- Server-side administration retains full table access. RLS is bypassed
-- by service_role, so this key must never be shipped to the browser.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Functions are executable by PUBLIC in PostgreSQL unless explicitly
-- revoked. Start closed, then expose only the RPCs used by the app plus
-- the two helpers required by RLS policies.
revoke all privileges on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_enrolled(uuid),
  public.is_instructor_of(uuid),
  public.link_user_on_first_login(text, boolean),
  public.add_pending_enrollment(uuid, text, text),
  public.bulk_add_pending_enrollments(jsonb),
  public.submit_claim(uuid, text, date, text),
  public.reject_claim(uuid),
  public.approve_claim(uuid, integer),
  public.grant_points(uuid, uuid, integer, text, text),
  public.post_result_set(uuid),
  public.void_result_set(uuid),
  public.set_wuclap_default_curve(uuid),
  public.run_section_maintenance(uuid),
  public.create_team(uuid, text),
  public.respond_to_team_invite(uuid, boolean)
  to authenticated;

grant execute on all functions in schema public to service_role;

-- Pin every SECURITY DEFINER lookup to the trusted application schema.
-- CREATE is revoked below, so callers cannot place shadow objects here.
alter function public.post_result_set(uuid) set search_path = public, pg_temp;
alter function public.void_result_set(uuid) set search_path = public, pg_temp;
alter function public.approve_claim(uuid, integer) set search_path = public, pg_temp;
alter function public.grant_points(uuid, uuid, integer, text, text) set search_path = public, pg_temp;
alter function public.is_enrolled(uuid) set search_path = public, pg_temp;
alter function public.is_instructor_of(uuid) set search_path = public, pg_temp;
alter function public.add_pending_enrollment(uuid, text, text) set search_path = public, pg_temp;
alter function public.sweep_pending_enrollments(uuid, text, uuid) set search_path = public, pg_temp;
alter function public.link_user_on_first_login(text, boolean) set search_path = public, pg_temp;
alter function public.submit_claim(uuid, text, date, text) set search_path = public, pg_temp;
alter function public.reject_claim(uuid) set search_path = public, pg_temp;
alter function public.bulk_add_pending_enrollments(jsonb) set search_path = public, pg_temp;
alter function public.set_wuclap_default_curve(uuid) set search_path = public, pg_temp;
alter function public.generate_section_cycles(uuid) set search_path = public, pg_temp;
alter function public.snapshot_completed_weeks(uuid) set search_path = public, pg_temp;
alter function public.finalize_due_cycles(uuid) set search_path = public, pg_temp;
alter function public.expire_team_formation(uuid) set search_path = public, pg_temp;
alter function public.run_section_maintenance(uuid) set search_path = public, pg_temp;
alter function public.run_all_sections_maintenance() set search_path = public, pg_temp;
alter function public.create_team(uuid, text) set search_path = public, pg_temp;
alter function public.respond_to_team_invite(uuid, boolean) set search_path = public, pg_temp;

revoke create on schema public from public, anon, authenticated;

-- Future migrations must opt new API objects in explicitly.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
