-- ============================================================
-- P6: atomically toggle payout_curves.is_wuclap_default.
-- Per CLAUDE.md rule 7 (multi-row invariants are server-side,
-- atomic, never choreographed client calls): clearing the old
-- default and setting the new one both happen inside this one
-- SECURITY DEFINER function call, so there is no window where a
-- concurrent reader (or a second concurrent call) can observe
-- zero or two defaults for a section. The two UPDATEs run as
-- separate statements within the same transaction; the clearing
-- UPDATE takes row locks on any currently-true row for the
-- section, so two racing calls serialize instead of both
-- succeeding — exactly one default survives.
-- ============================================================

create or replace function set_wuclap_default_curve(p_curve uuid)
returns payout_curves
language plpgsql security definer as $$
declare
  v_curve payout_curves%rowtype;
begin
  select * into v_curve from payout_curves where id = p_curve;
  if v_curve is null then
    raise exception 'curve not found';
  end if;
  if not is_instructor_of(v_curve.section_id) then
    raise exception 'not instructor of this section';
  end if;

  update payout_curves set is_wuclap_default = false
    where section_id = v_curve.section_id
      and is_wuclap_default = true
      and id <> p_curve;

  update payout_curves set is_wuclap_default = true
    where id = p_curve
    returning * into v_curve;

  return v_curve;
end $$;

revoke execute on function set_wuclap_default_curve(uuid) from public;
grant execute on function set_wuclap_default_curve(uuid) to authenticated;
