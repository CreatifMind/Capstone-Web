-- Run supabase/user_profiles_preflight.sql first. This guard also makes the migration safe to stop on bad legacy data.
do $$
begin
  if exists (
    select 1 from public.user_profiles
    where nullif(trim(coalesce(name, '')), '') is null
       or nullif(trim(coalesce(email, '')), '') is null
       or lower(regexp_replace(trim(coalesce(role, '')), '\s+', '_', 'g')) not in ('operator', 'development_team', 'admin', 'plant_manager')
  ) then
    raise exception 'user_profiles migration blocked: run supabase/user_profiles_preflight.sql and repair reported profiles';
  end if;
  if exists (select 1 from public.user_profiles group by lower(trim(email)) having count(*) > 1) then
    raise exception 'user_profiles migration blocked: duplicate normalized profile emails';
  end if;
  if exists (select 1 from auth.users where email is not null group by lower(trim(email)) having count(*) > 1) then
    raise exception 'user_profiles migration blocked: duplicate normalized Auth emails';
  end if;
end $$;

alter table public.user_profiles
  add column if not exists auth_user_id uuid,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

update public.user_profiles
set email = lower(trim(email)),
    name = trim(name),
    role = lower(regexp_replace(trim(role), '\s+', '_', 'g')),
    status = lower(trim(status));

update public.user_profiles profile
set auth_user_id = auth_user.id
from auth.users auth_user
where lower(trim(profile.email)) = lower(trim(auth_user.email));

alter table public.user_profiles drop constraint if exists users_email_key;
create unique index if not exists user_profiles_email_normalized_key on public.user_profiles (lower(email));
create unique index if not exists user_profiles_auth_user_id_key on public.user_profiles (auth_user_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_auth_user_id_fkey') then
    alter table public.user_profiles add constraint user_profiles_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_role_check') then
    alter table public.user_profiles add constraint user_profiles_role_check check (role in ('operator', 'development_team', 'admin', 'plant_manager'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_status_check') then
    alter table public.user_profiles add constraint user_profiles_status_check check (status in ('active', 'inactive'));
  end if;
end $$;

alter table public.user_profiles
  alter column name set not null,
  alter column email set not null,
  alter column role set not null,
  alter column role set default 'operator',
  alter column created_at set not null;

create or replace function public.normalize_user_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := trim(new.name);
  new.email := lower(trim(new.email));
  new.role := lower(regexp_replace(trim(new.role), '\s+', '_', 'g'));
  new.status := lower(trim(new.status));
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists normalize_user_profile on public.user_profiles;
create trigger normalize_user_profile before insert or update on public.user_profiles
for each row execute function public.normalize_user_profile();

create or replace function public.prevent_last_active_admin_removal()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.role = 'admin' and old.status = 'active' and old.deleted_at is null
     and (new.role <> 'admin' or new.status <> 'active' or new.deleted_at is not null) then
    perform pg_advisory_xact_lock(hashtext('public.user_profiles.active_admin'));
    if not exists (
      select 1 from public.user_profiles
      where id <> old.id and role = 'admin' and status = 'active' and deleted_at is null
    ) then
      raise exception 'cannot remove the final active administrator';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists prevent_last_active_admin_removal on public.user_profiles;
create trigger prevent_last_active_admin_removal before update on public.user_profiles
for each row execute function public.prevent_last_active_admin_removal();

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;
drop policy if exists user_profiles_read_own on public.user_profiles;
create policy user_profiles_read_own on public.user_profiles
for select to authenticated using (auth.uid() = auth_user_id);
