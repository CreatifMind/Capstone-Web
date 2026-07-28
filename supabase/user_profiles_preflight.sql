-- Run before applying the admin-user migration. Any returned row blocks the migration.
with issues as (
  select 'blank_name_or_email' as issue, id::text as profile_id from public.user_profiles where nullif(trim(coalesce(name, '')), '') is null or nullif(trim(coalesce(email, '')), '') is null
  union all
  select 'duplicate_normalized_email', min(id::text) from public.user_profiles where nullif(trim(coalesce(email, '')), '') is not null group by lower(trim(email)) having count(*) > 1
  union all
  select 'unknown_role', id::text from public.user_profiles where lower(regexp_replace(trim(coalesce(role, '')), '\\s+', '_', 'g')) not in ('operator', 'team_lead', 'operations_manager', 'model_team', 'project_manager', 'web_team', 'admin')
  union all
  select 'duplicate_auth_email', min(id::text) from auth.users where email is not null group by lower(trim(email)) having count(*) > 1
)
select issue, count(*) as affected_records, array_agg(profile_id order by profile_id) as record_ids
from issues group by issue order by issue;
