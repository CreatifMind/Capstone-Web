do $$
begin
  if exists (
    select 1
    from public.user_profiles
    where deleted_at is null
      and role not in ('operator', 'development_team', 'admin', 'plant_manager')
  ) then
    raise exception 'role unification blocked: remove or manually reassign deprecated user_profiles roles before applying this migration';
  end if;
end $$;

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('operator', 'development_team', 'admin', 'plant_manager'));

update public.model_review_tasks
set assignee_role = 'development_team'
where assignee_role not in ('development_team', 'plant_manager');

alter table public.model_review_tasks
  drop constraint if exists model_review_tasks_assignee_role_check;

alter table public.model_review_tasks
  add constraint model_review_tasks_assignee_role_check
  check (assignee_role in ('development_team', 'plant_manager'));

update public.model_review_notifications
set team = 'development'
where team <> 'development';

alter table public.model_review_notifications
  drop constraint if exists model_review_notifications_team_check;

alter table public.model_review_notifications
  add constraint model_review_notifications_team_check
  check (team in ('development'));
