-- PurityLoop AI historical auto-status repair for the canonical 32% decision threshold.
-- Safe to run repeatedly. Manual review decisions and rejected/quarantined scans are preserved.

-- Read-only diagnostics before the update.
with latest_decision as (
  select distinct on (detected_material_id)
    detected_material_id,
    scan_result_id,
    outcome,
    created_at
  from public.scan_review_decisions
  order by detected_material_id, created_at desc nulls last
),
material_status as (
  select
    s.id as scan_result_id,
    m.id as material_id,
    lower(coalesce(m.category, m.material_name, '')) as category_text,
    case
      when m.confidence is null then null
      when m.confidence > 1 then m.confidence / 100
      else m.confidence
    end as normalized_confidence,
    lower(coalesce(s.overall_status, '')) as scan_status,
    d.outcome as review_outcome
  from public.scan_results s
  join public.detected_materials m on m.scan_result_id = s.id
  left join latest_decision d on d.detected_material_id = m.id
)
select
  count(*) filter (where review_outcome is null and scan_status not in ('rejected', 'quarantined') and normalized_confidence >= 0.32 and category_text not like '%general%trash%') as needs_review_candidates_at_or_above_32,
  count(*) filter (where review_outcome is null and scan_status not in ('rejected', 'quarantined') and (normalized_confidence < 0.32 or normalized_confidence is null or category_text like '%general%trash%')) as review_candidates_below_32_or_general_trash,
  count(*) filter (where review_outcome = 'rejected') as preserved_manual_rejects,
  count(*) filter (where review_outcome = 'confirmed') as preserved_manual_confirms,
  count(*) filter (where normalized_confidence is null) as invalid_or_null_confidence
from material_status;

-- Recalculate scan-level auto flags from child objects only when no manual review exists.
with latest_decision as (
  select distinct on (detected_material_id)
    detected_material_id,
    scan_result_id,
    outcome,
    created_at
  from public.scan_review_decisions
  order by detected_material_id, created_at desc nulls last
),
scan_auto_status as (
  select
    s.id,
    bool_or(
      lower(coalesce(m.category, m.material_name, '')) like '%general%trash%'
      or case
        when m.confidence is null then true
        when m.confidence > 1 then m.confidence / 100 < 0.32
        else m.confidence < 0.32
      end
    ) as needs_review
  from public.scan_results s
  join public.detected_materials m on m.scan_result_id = s.id
  left join latest_decision d on d.scan_result_id = s.id
  where lower(coalesce(s.overall_status, '')) not in ('rejected', 'quarantined')
    and d.scan_result_id is null
  group by s.id
)
update public.scan_results as scan
set
  human_review_required = scan_auto_status.needs_review,
  overall_status = case when scan_auto_status.needs_review then 'review_required' else 'accepted' end,
  recommended_action = case
    when scan_auto_status.needs_review then 'Human review required before sorting.'
    else 'Confirmed sorting routes applied.'
  end
from scan_auto_status
where scan.id = scan_auto_status.id;
