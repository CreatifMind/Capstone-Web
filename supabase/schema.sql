create extension if not exists pgcrypto;

create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  role text not null default 'operator' check (role in ('operator', 'team_lead', 'operations_manager', 'model_team', 'project_manager', 'web_team', 'admin')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone
);

create unique index if not exists user_profiles_email_normalized_key on user_profiles (lower(email));

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

drop trigger if exists normalize_user_profile on user_profiles;
create trigger normalize_user_profile before insert or update on user_profiles
for each row execute function public.normalize_user_profile();

create or replace function public.prevent_last_active_admin_removal()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.role = 'admin' and old.status = 'active' and old.deleted_at is null
     and (new.role <> 'admin' or new.status <> 'active' or new.deleted_at is not null) then
    perform pg_advisory_xact_lock(hashtext('public.user_profiles.active_admin'));
    if not exists (select 1 from public.user_profiles where id <> old.id and role = 'admin' and status = 'active' and deleted_at is null) then
      raise exception 'cannot remove the final active administrator';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists prevent_last_active_admin_removal on user_profiles;
create trigger prevent_last_active_admin_removal before update on user_profiles
for each row execute function public.prevent_last_active_admin_removal();

alter table user_profiles enable row level security;
revoke all on user_profiles from anon, authenticated;
grant select on user_profiles to authenticated;
drop policy if exists user_profiles_read_own on user_profiles;
create policy user_profiles_read_own on user_profiles for select to authenticated using (auth.uid() = auth_user_id);

create table if not exists scan_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references user_profiles(id) on delete set null,
  image_url text,
  preview_image_url text,
  storage_provider text default 'google_drive',
  drive_file_id text,
  drive_file_name text,
  drive_web_url text,
  upload_status text default 'uploaded',
  processing_status text default 'pending',
  total_images integer,
  source_type text default 'image',
  overall_status text,
  contamination_risk text,
  recommended_action text,
  human_review_required boolean default false,
  overall_confidence numeric,
  created_at timestamp with time zone default now()
);

alter table scan_results
add column if not exists preview_image_url text,
add column if not exists storage_provider text default 'google_drive',
add column if not exists drive_file_id text,
add column if not exists drive_file_name text,
add column if not exists drive_web_url text,
add column if not exists upload_status text default 'uploaded',
add column if not exists processing_status text default 'pending',
add column if not exists total_images integer,
add column if not exists source_type text default 'image';

alter table scan_results
add column if not exists image_url text,
add column if not exists preview_image_url text,
add column if not exists drive_file_id text,
add column if not exists drive_file_name text,
add column if not exists drive_web_url text,
add column if not exists review_status text,
add column if not exists verified_category text,
add column if not exists reviewed_at timestamp with time zone;

alter table detected_materials
add column if not exists original_category text;

create table if not exists scan_review_decisions (
  id uuid primary key default gen_random_uuid(),
  scan_result_id uuid not null references scan_results(id) on delete cascade,
  detected_material_id uuid not null references detected_materials(id) on delete cascade,
  chosen_category text not null,
  disposition text not null check (disposition in ('recyclable', 'contaminant')),
  outcome text not null default 'confirmed' check (outcome in ('confirmed', 'rejected')),
  reviewer_email text,
  created_at timestamp with time zone default now()
);

alter table scan_review_decisions
add column if not exists outcome text not null default 'confirmed'
check (outcome in ('confirmed', 'rejected'));

create index if not exists scan_review_decisions_scan_material_created_idx
  on scan_review_decisions (scan_result_id, detected_material_id, created_at desc);

create table if not exists detected_materials (
  id uuid primary key default gen_random_uuid(),
  scan_result_id uuid references scan_results(id) on delete cascade,
  material_name text,
  category text,
  confidence numeric,
  recyclable_status text,
  contaminant_status text,
  bbox_x numeric,
  bbox_y numeric,
  bbox_width numeric,
  bbox_height numeric,
  created_at timestamp with time zone default now()
);

-- Correct historical auto-review flags without touching reviewed, rejected, quarantined, or empty scans.
update scan_results as scan
set
  human_review_required = exists (
    select 1 from detected_materials material
    where material.scan_result_id = scan.id and coalesce(material.confidence, 0) < 0.85
  ),
  overall_status = case when exists (
    select 1 from detected_materials material
    where material.scan_result_id = scan.id and coalesce(material.confidence, 0) < 0.85
  ) then 'review_required' else 'accepted' end,
  recommended_action = case when exists (
    select 1 from detected_materials material
    where material.scan_result_id = scan.id and coalesce(material.confidence, 0) < 0.85
  ) then 'Human review required before sorting.' else 'Confirmed sorting routes applied.' end
where lower(coalesce(scan.overall_status, '')) not in ('rejected', 'quarantined')
  and exists (select 1 from detected_materials material where material.scan_result_id = scan.id)
  and not exists (select 1 from scan_review_decisions review where review.scan_result_id = scan.id);

-- Google Drive stores uploaded files for the planned flow.
-- Supabase stores file references, scan status, YOLOv8 result summaries, and detected material rows.

-- Production shared-API and video-ingestion tables. The service role owns these tables;
-- browser reads go through FastAPI after Supabase Auth verification.
alter table scan_results
  add column if not exists source_name text,
  add column if not exists source_ref text,
  add column if not exists batch_id text,
  add column if not exists model_version text,
  add column if not exists drive_upload_status text default 'pending',
  add column if not exists preview_upload_status text default 'pending';

alter table detected_materials add column if not exists frame_time_seconds numeric;

alter table scan_results
  add column if not exists result_kind text,
  add column if not exists legacy_result boolean not null default false,
  add column if not exists total_unique_objects integer,
  add column if not exists video_tracking_summary jsonb not null default '{}'::jsonb;

alter table detected_materials
  add column if not exists stable_object_id text,
  add column if not exists object_uid text,
  add column if not exists source_track_ids jsonb not null default '[]'::jsonb,
  add column if not exists result_type text,
  add column if not exists track_id text,
  add column if not exists track_first_frame integer,
  add column if not exists track_last_frame integer,
  add column if not exists track_first_timestamp numeric,
  add column if not exists track_last_timestamp numeric,
  add column if not exists track_duration_seconds numeric,
  add column if not exists track_avg_confidence numeric,
  add column if not exists track_max_confidence numeric,
  add column if not exists track_frame_count integer,
  add column if not exists track_hazard_status text,
  add column if not exists track_counted boolean,
  add column if not exists track_start_center jsonb not null default '{}'::jsonb,
  add column if not exists track_end_center jsonb not null default '{}'::jsonb,
  add column if not exists track_avg_width numeric,
  add column if not exists track_avg_height numeric,
  add column if not exists track_avg_aspect_ratio numeric,
  add column if not exists track_debug jsonb not null default '{}'::jsonb,
  add column if not exists track_path jsonb not null default '[]'::jsonb,
  add column if not exists segmentation_mask jsonb,
  add column if not exists best_box jsonb,
  add column if not exists best_bbox_norm jsonb;

create table if not exists api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null unique,
  key_hash text not null unique,
  scopes text[] not null default array['scan:write', 'scan:read', 'job:read'],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists processing_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_ref text not null,
  options jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  processed_count integer not null default 0,
  total_count integer,
  scan_ids uuid[] not null default '{}',
  attempts integer not null default 0,
  error text,
  created_by uuid,
  created_by_type text not null default 'api_key',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table processing_jobs
  add column if not exists result_summary jsonb not null default '{}'::jsonb;

create table if not exists processed_drive_files (
  drive_file_id text primary key,
  scan_result_id uuid references scan_results(id) on delete set null,
  processed_at timestamptz not null default now()
);

create index if not exists processing_jobs_status_updated_at_idx on processing_jobs(status, updated_at);
create index if not exists scan_results_user_id_idx on scan_results(user_id);
create index if not exists scan_results_result_kind_idx on scan_results(result_kind);
create index if not exists detected_materials_scan_result_id_idx on detected_materials(scan_result_id);
create index if not exists detected_materials_stable_object_id_idx on detected_materials(stable_object_id);
create unique index if not exists detected_materials_scan_object_uid_key
  on detected_materials(scan_result_id, object_uid)
  where object_uid is not null;
