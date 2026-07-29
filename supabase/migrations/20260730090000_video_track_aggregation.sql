alter table scan_results
  add column if not exists result_kind text,
  add column if not exists legacy_result boolean not null default false,
  add column if not exists total_unique_objects integer,
  add column if not exists video_tracking_summary jsonb not null default '{}'::jsonb;

alter table detected_materials
  add column if not exists stable_object_id text,
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
  add column if not exists track_debug jsonb not null default '{}'::jsonb,
  add column if not exists track_path jsonb not null default '[]'::jsonb,
  add column if not exists segmentation_mask jsonb,
  add column if not exists best_box jsonb;

alter table processing_jobs
  add column if not exists result_summary jsonb not null default '{}'::jsonb;

create index if not exists detected_materials_stable_object_id_idx on detected_materials(stable_object_id);
create index if not exists scan_results_result_kind_idx on scan_results(result_kind);
