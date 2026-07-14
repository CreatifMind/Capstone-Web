create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  role text default 'operator',
  created_at timestamp with time zone default now()
);

create table if not exists scan_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
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

alter table mock_scan_results
add column if not exists preview_image_url text;

create table if not exists scan_review_decisions (
  id uuid primary key default gen_random_uuid(),
  scan_result_id uuid not null references mock_scan_results(id) on delete cascade,
  detected_material_id uuid not null references mock_detected_materials(id) on delete cascade,
  chosen_category text not null,
  disposition text not null check (disposition in ('recyclable', 'contaminant')),
  reviewer_email text,
  created_at timestamp with time zone default now()
);

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

-- Google Drive stores uploaded files for the planned flow.
-- Supabase stores file references, scan status, YOLOv8 result summaries, and detected material rows.
