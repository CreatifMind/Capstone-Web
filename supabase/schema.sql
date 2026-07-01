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
  overall_status text,
  contamination_risk text,
  recommended_action text,
  human_review_required boolean default false,
  overall_confidence numeric,
  created_at timestamp with time zone default now()
);

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

-- Create this public bucket in Supabase Storage if uploaded scan images should be persisted online:
-- scan-images
