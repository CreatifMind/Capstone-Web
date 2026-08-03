-- Durable MP4 uploads and Cloud Tasks-safe job claiming.
-- Review before applying.

create table if not exists public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.user_profiles(id) on delete set null,
  owner_auth_user_id uuid not null,
  original_filename text not null,
  content_type text not null,
  total_size bigint not null check (total_size > 0),
  received_size bigint not null default 0 check (received_size >= 0),
  drive_resumable_url text not null,
  drive_file_id text,
  status text not null default 'upload_pending'
    check (status in ('upload_pending', 'completed', 'failed', 'expired')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.upload_sessions enable row level security;

create index if not exists upload_sessions_owner_auth_idx
  on public.upload_sessions(owner_auth_user_id, created_at desc);

create index if not exists upload_sessions_drive_file_idx
  on public.upload_sessions(drive_file_id)
  where drive_file_id is not null;

create index if not exists upload_sessions_expiry_idx
  on public.upload_sessions(status, expires_at);

alter table public.processing_jobs
  add column if not exists lease_expires_at timestamptz,
  add column if not exists worker_id text,
  add column if not exists dispatched_at timestamptz,
  add column if not exists dispatch_error text;

alter table public.processing_jobs drop constraint if exists processing_jobs_status_check;
alter table public.processing_jobs add constraint processing_jobs_status_check
  check (status in ('upload_pending', 'queued', 'processing', 'complete', 'completed', 'completed_with_errors', 'failed', 'cancel_requested', 'cancelled')) not valid;

create index if not exists processing_jobs_lease_idx
  on public.processing_jobs(status, lease_expires_at);

create or replace function public.claim_processing_job(
  p_job_id uuid,
  p_lease_seconds integer default 1200,
  p_worker_id text default null
)
returns table(claimed boolean, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_job public.processing_jobs%rowtype;
  next_status text;
begin
  select *
    into current_job
    from public.processing_jobs
    where id = p_job_id
    for update;

  if not found then
    return query select false, 'missing'::text;
    return;
  end if;

  if current_job.status in ('complete', 'completed') then
    return query select false, current_job.status::text;
    return;
  end if;

  if current_job.status not in ('queued', 'processing') then
    return query select false, current_job.status::text;
    return;
  end if;

  if current_job.status = 'processing'
     and current_job.lease_expires_at is not null
     and current_job.lease_expires_at > now() then
    return query select false, current_job.status::text;
    return;
  end if;

  update public.processing_jobs
     set status = 'processing',
         started_at = coalesce(started_at, now()),
         lease_expires_at = now() + make_interval(secs => greatest(1, p_lease_seconds)),
         attempts = coalesce(attempts, 0) + 1,
         worker_id = p_worker_id,
         error = null,
         updated_at = now()
   where id = p_job_id
   returning public.processing_jobs.status into next_status;

  return query select true, next_status;
end;
$$;

revoke all on function public.claim_processing_job(uuid, integer, text) from public;
revoke all on function public.claim_processing_job(uuid, integer, text) from anon;
revoke all on function public.claim_processing_job(uuid, integer, text) from authenticated;
grant execute on function public.claim_processing_job(uuid, integer, text) to service_role;
