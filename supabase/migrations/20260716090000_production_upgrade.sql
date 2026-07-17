-- Public-demo MP4 ingestion support. The FastAPI service owns these tables.

alter table public.mock_scan_results
  add column if not exists source_name text,
  add column if not exists source_ref text,
  add column if not exists batch_id text,
  add column if not exists model_version text,
  add column if not exists drive_upload_status text default 'pending',
  add column if not exists preview_upload_status text default 'pending';

alter table public.mock_detected_materials
  add column if not exists frame_time_seconds numeric;

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('drive_file', 'drive_folder')),
  source_ref text not null,
  options jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'complete', 'failed')),
  processed_count integer not null default 0,
  total_count integer,
  scan_ids uuid[] not null default '{}',
  attempts integer not null default 0,
  error text,
  created_by text,
  created_by_type text not null default 'public',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.processed_drive_files (
  drive_file_id text primary key,
  scan_result_id uuid references public.mock_scan_results(id) on delete set null,
  processed_at timestamptz not null default now()
);

create index if not exists mock_scan_results_created_at_idx on public.mock_scan_results (created_at desc);
create index if not exists mock_scan_results_batch_id_idx on public.mock_scan_results (batch_id);
create index if not exists mock_detected_materials_scan_result_id_idx on public.mock_detected_materials (scan_result_id);
create index if not exists processing_jobs_status_updated_at_idx on public.processing_jobs (status, updated_at);

alter table public.processing_jobs enable row level security;
alter table public.processed_drive_files enable row level security;
