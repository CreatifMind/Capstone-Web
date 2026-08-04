-- Diagnose and repair historical automatic review flags using the canonical 32% object threshold.
-- Safe to run more than once. Human review decisions remain authoritative.

with latest_decision as (
  select distinct on (detected_material_id)
    detected_material_id,
    outcome
  from scan_review_decisions
  order by detected_material_id, created_at desc
),
object_status as (
  select
    material.id,
    material.scan_result_id,
    scan.human_review_required,
    scan.overall_status,
    material.confidence,
    case
      when decision.outcome = 'rejected' then 'rejected'
      when decision.outcome = 'confirmed' then 'confirmed'
      when material.confidence is null then 'needs_review'
      when material.confidence >= 0 and (case when material.confidence > 1 then material.confidence / 100 else material.confidence end) >= 0.32 then 'confirmed'
      when material.confidence >= 0 then 'needs_review'
      else 'needs_review'
    end as final_status,
    decision.outcome as human_outcome
  from detected_materials material
  join scan_results scan on scan.id = material.scan_result_id
  left join latest_decision decision on decision.detected_material_id = material.id
)
select
  count(*) filter (where human_outcome is null and human_review_required is true and coalesce(confidence, -1) >= 0 and (case when confidence > 1 then confidence / 100 else confidence end) >= 0.32) as records_marked_needs_review_with_confidence_at_or_above_32,
  count(*) filter (where human_outcome is null and human_review_required is false and coalesce(confidence, -1) >= 0 and (case when confidence > 1 then confidence / 100 else confidence end) < 0.32) as records_marked_confirmed_with_confidence_below_32,
  count(*) filter (where human_outcome = 'rejected') as manual_rejected_preserved,
  count(*) filter (where human_outcome = 'confirmed') as manual_confirmed_preserved,
  count(*) filter (where confidence is null or confidence < 0) as invalid_or_null_confidence,
  count(distinct scan_result_id) filter (where human_outcome is null) as scans_considered_for_repair
from object_status;

with latest_decision as (
  select distinct on (detected_material_id)
    detected_material_id,
    outcome
  from scan_review_decisions
  order by detected_material_id, created_at desc
),
scan_status as (
  select
    scan.id,
    bool_or(
      decision.outcome is null
      and (
        material.confidence is null
        or material.confidence < 0
        or (case when material.confidence > 1 then material.confidence / 100 else material.confidence end) < 0.32
      )
    ) as needs_review
  from scan_results scan
  join detected_materials material on material.scan_result_id = scan.id
  left join latest_decision decision on decision.detected_material_id = material.id
  where lower(coalesce(scan.overall_status, '')) not in ('rejected', 'quarantined')
    and not exists (
      select 1
      from scan_review_decisions preserved
      where preserved.scan_result_id = scan.id
    )
  group by scan.id
)
update scan_results scan
set
  human_review_required = scan_status.needs_review,
  overall_status = case when scan_status.needs_review then 'review_required' else 'accepted' end,
  recommended_action = case when scan_status.needs_review then 'Human review required before sorting.' else 'Confirmed sorting routes applied.' end
from scan_status
where scan.id = scan_status.id
  and (
    scan.human_review_required is distinct from scan_status.needs_review
    or scan.overall_status is distinct from case when scan_status.needs_review then 'review_required' else 'accepted' end
  );
