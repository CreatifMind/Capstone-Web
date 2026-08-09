-- Server-side Review Workspace pagination.
-- Keeps video_frame internal rows out of history and preserves existing final
-- category/status rules without returning every scan/material row to FastAPI.

drop function if exists public.scan_history_page(
  integer,
  integer,
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  text
);

create function public.scan_history_page(
  p_limit        integer                  default 10,
  p_offset       integer                  default 0,
  p_start_date   timestamp with time zone default null,
  p_end_date     timestamp with time zone default null,
  p_search       text                     default null,
  p_category_key text                     default null,
  p_status       text                     default null,
  p_sort         text                     default 'timestamp',
  p_direction    text                     default 'desc'
)
returns table (
  scan                 jsonb,
  total_count          bigint,
  total_objects        bigint,
  confirmed_objects    bigint,
  needs_review_objects bigint,
  rejected_objects     bigint
)
language sql
stable
set search_path to 'public'
as $function$
  with filtered_scans as (
    select s.*
    from public.scan_results s
    where coalesce(s.source_type, '') <> 'video_frame'
      and (p_start_date is null or s.created_at >= p_start_date)
      and (p_end_date is null or s.created_at < p_end_date)
      and (nullif(trim(p_search), '') is null or s.source_name ilike '%' || trim(p_search) || '%')
  ),
  latest_decision as (
    select distinct on (d.detected_material_id)
      d.detected_material_id,
      d.scan_result_id,
      d.chosen_category,
      d.outcome,
      d.created_at
    from public.scan_review_decisions d
    join filtered_scans s on s.id = d.scan_result_id
    order by d.detected_material_id, d.created_at desc nulls last, d.id desc
  ),
  material_status as (
    select
      m.id,
      m.scan_result_id,
      public.purityloop_category_key(coalesce(d.chosen_category, s.verified_category, m.category, m.material_name)) as final_category_key,
      case
        when lower(coalesce(d.outcome, '')) = 'rejected'
          or lower(coalesce(s.review_status, s.overall_status, '')) in ('rejected', 'quarantined') then 'rejected'
        when lower(coalesce(d.outcome, '')) = 'confirmed'
          or lower(coalesce(s.review_status, s.overall_status, '')) in ('verified', 'corrected') then 'confirmed'
        when m.confidence is null then 'needs_review'
        when (case when m.confidence > 1 then m.confidence / 100 else m.confidence end) >= 0.32 then 'confirmed'
        else 'needs_review'
      end as final_status
    from filtered_scans s
    join public.detected_materials m on m.scan_result_id = s.id
    left join latest_decision d on d.detected_material_id = m.id
  ),
  candidate_scans as (
    select s.*
    from filtered_scans s
    where (
        nullif(trim(p_category_key), '') is null
        or exists (
          select 1
          from material_status ms
          where ms.scan_result_id = s.id
            and ms.final_category_key = public.purityloop_category_key(p_category_key)
        )
      )
      and (
        nullif(trim(p_status), '') is null
        or (
          lower(p_status) = 'confirmed'
          and exists (select 1 from material_status ms where ms.scan_result_id = s.id)
          and not exists (
            select 1
            from material_status ms
            where ms.scan_result_id = s.id
              and ms.final_status <> 'confirmed'
          )
        )
        or (
          lower(p_status) = 'review_needed'
          and exists (
            select 1
            from material_status ms
            where ms.scan_result_id = s.id
              and ms.final_status = 'needs_review'
          )
        )
        or (
          lower(p_status) = 'rejected'
          and (
            lower(coalesce(s.overall_status, '')) in ('rejected', 'quarantined')
            or exists (
              select 1
              from material_status ms
              where ms.scan_result_id = s.id
                and ms.final_status = 'rejected'
            )
          )
        )
      )
  ),
  object_summary as (
    select
      count(*) as total_objects,
      count(*) filter (where ms.final_status = 'confirmed') as confirmed_objects,
      count(*) filter (where ms.final_status = 'needs_review') as needs_review_objects,
      count(*) filter (where ms.final_status = 'rejected') as rejected_objects
    from material_status ms
    join candidate_scans s on s.id = ms.scan_result_id
    where (
      nullif(trim(p_category_key), '') is null
      or ms.final_category_key = public.purityloop_category_key(p_category_key)
    )
  ),
  total as (
    select count(*) as total_count from candidate_scans
  ),
  page as (
    select
      c.*,
      row_number() over (
        order by
          case when p_sort = 'confidence' and lower(p_direction) = 'asc' then c.overall_confidence end asc nulls last,
          case when p_sort = 'confidence' and lower(p_direction) <> 'asc' then c.overall_confidence end desc nulls last,
          case when p_sort <> 'confidence' and lower(p_direction) = 'asc' then c.created_at end asc nulls last,
          case when p_sort <> 'confidence' and lower(p_direction) <> 'asc' then c.created_at end desc nulls last,
          c.id desc
      ) as page_order
    from candidate_scans c
    order by
      case when p_sort = 'confidence' and lower(p_direction) = 'asc' then c.overall_confidence end asc nulls last,
      case when p_sort = 'confidence' and lower(p_direction) <> 'asc' then c.overall_confidence end desc nulls last,
      case when p_sort <> 'confidence' and lower(p_direction) = 'asc' then c.created_at end asc nulls last,
      case when p_sort <> 'confidence' and lower(p_direction) <> 'asc' then c.created_at end desc nulls last,
      c.id desc
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select result.scan, result.total_count, result.total_objects, result.confirmed_objects, result.needs_review_objects, result.rejected_objects
  from (
    select
      to_jsonb(page) - 'page_order' as scan,
      total.total_count,
      object_summary.total_objects,
      object_summary.confirmed_objects,
      object_summary.needs_review_objects,
      object_summary.rejected_objects,
      page.page_order
    from page
    cross join total
    cross join object_summary
    union all
    select
      null::jsonb,
      total.total_count,
      object_summary.total_objects,
      object_summary.confirmed_objects,
      object_summary.needs_review_objects,
      object_summary.rejected_objects,
      0
    from total
    cross join object_summary
    where not exists (select 1 from page)
  ) result
  order by result.page_order;
$function$;

revoke all on function public.scan_history_page(integer, integer, timestamp with time zone, timestamp with time zone, text, text, text, text, text) from public;
grant execute on function public.scan_history_page(integer, integer, timestamp with time zone, timestamp with time zone, text, text, text, text, text) to service_role;
