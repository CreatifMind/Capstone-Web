create table if not exists scan_review_decisions (
  id uuid primary key default gen_random_uuid(),
  scan_result_id uuid not null references mock_scan_results(id) on delete cascade,
  detected_material_id uuid not null references mock_detected_materials(id) on delete cascade,
  chosen_category text not null,
  disposition text not null check (disposition in ('recyclable', 'contaminant')),
  outcome text not null default 'confirmed' check (outcome in ('confirmed', 'rejected')),
  reviewer_email text,
  created_at timestamp with time zone default now()
);

create index if not exists scan_review_decisions_scan_material_created_idx
  on scan_review_decisions (scan_result_id, detected_material_id, created_at desc);

alter table mock_detected_materials
add column if not exists original_category text;
