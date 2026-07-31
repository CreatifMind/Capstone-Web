create or replace function public.purityloop_category_key(value text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when value is null then 'unknown'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%food%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%organic%' then 'food_organics'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%general%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%trash%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%waste%' then 'general_trash'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%textile%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%fabric%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%cloth%' then 'textile'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%battery%' then 'battery'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%cardboard%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%box%' then 'cardboard'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%glass%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%jar%' then 'glass'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%paper%' then 'paper'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%metal%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%aluminum%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%aluminium%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%can%' then 'metal'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%plastic%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%bottle%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%pet%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%film%' then 'plastic'
    else 'unknown'
  end;
$$;

create or replace function public.scan_history_page(
  p_limit integer default 10,
  p_offset integer default 0,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_search text default null,
  p_category_key text default null,
  p_status text default null,
  p_sort text default 'timestamp',
  p_direction text default 'desc'
)
returns table(scan jsonb, total_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      s.*,
      public.purityloop_category_key(coalesce(s.verified_category, latest_decision.chosen_category, first_material.category)) as final_category_key
    from scan_results s
    left join lateral (
      select m.*
      from detected_materials m
      where m.scan_result_id = s.id
      order by m.created_at asc nulls last, m.id asc
      limit 1
    ) first_material on true
    left join lateral (
      select d.*
      from scan_review_decisions d
      where d.detected_material_id = first_material.id
      order by d.created_at desc nulls last, d.id desc
      limit 1
    ) latest_decision on true
    where (p_start_date is null or s.created_at >= p_start_date)
      and (p_end_date is null or s.created_at < p_end_date)
      and (nullif(trim(p_search), '') is null or s.source_name ilike '%' || trim(p_search) || '%')
      and (
        nullif(trim(p_status), '') is null
        or (lower(p_status) = 'review_needed' and s.human_review_required is true)
        or (lower(p_status) = 'rejected' and lower(coalesce(s.overall_status, '')) in ('rejected', 'quarantined'))
        or (lower(p_status) = 'confirmed' and s.human_review_required is false)
      )
      and (
        nullif(trim(p_category_key), '') is null
        or public.purityloop_category_key(p_category_key) = public.purityloop_category_key(coalesce(s.verified_category, latest_decision.chosen_category, first_material.category))
      )
  )
  select to_jsonb(page_row) - 'final_category_key' as scan, count(*) over() as total_count
  from base page_row
  order by
    case when p_sort = 'confidence' and lower(p_direction) = 'asc' then page_row.overall_confidence end asc nulls last,
    case when p_sort = 'confidence' and lower(p_direction) <> 'asc' then page_row.overall_confidence end desc nulls last,
    case when p_sort <> 'confidence' and lower(p_direction) = 'asc' then page_row.created_at end asc nulls last,
    case when p_sort <> 'confidence' and lower(p_direction) <> 'asc' then page_row.created_at end desc nulls last,
    page_row.id desc
  limit greatest(1, least(coalesce(p_limit, 10), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke execute on function public.scan_history_page(integer, integer, timestamptz, timestamptz, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.scan_history_page(integer, integer, timestamptz, timestamptz, text, text, text, text, text) to service_role;
