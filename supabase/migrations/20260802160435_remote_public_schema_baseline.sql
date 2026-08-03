-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE FUNCTION public.normalize_user_profile()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  new.name := trim(new.name);
  new.email := lower(trim(new.email));
  new.role := lower(regexp_replace(trim(new.role), '\s+', '_', 'g'));
  new.status := lower(trim(new.status));
  new.updated_at := now();
  return new;
end $function$;

GRANT ALL ON FUNCTION public.normalize_user_profile() TO anon;

GRANT ALL ON FUNCTION public.normalize_user_profile() TO authenticated;

GRANT ALL ON FUNCTION public.normalize_user_profile() TO service_role;

CREATE FUNCTION public.prevent_last_active_admin_removal()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.prevent_last_active_admin_removal() TO anon;

GRANT ALL ON FUNCTION public.prevent_last_active_admin_removal() TO authenticated;

GRANT ALL ON FUNCTION public.prevent_last_active_admin_removal() TO service_role;

CREATE FUNCTION public.purityloop_category_key (
  value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  AS $function$
  select case
    when value is null then 'unknown'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%food%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%organic%' then 'food_organics'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%general%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%trash%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%waste%' then 'general_trash'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%textile%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%fabric%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%cloth%' then 'textile'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%battery%' then 'battery'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%cardboard%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%box%' then 'cardboard'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%glass%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%jar%' then 'glass'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%paper%' then 'paper'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%metal%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%aluminum%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%aluminium%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%can%' then 'metal'
    when lower(replace(replace(value, '_', ' '), '-', ' ')) like '%plastic%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%bottle%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%pet%'
      or lower(replace(replace(value, '_', ' '), '-', ' ')) like '%film%' then 'plastic'
    else 'unknown'
  end;
$function$;

GRANT ALL ON FUNCTION public.purityloop_category_key(text) TO anon;

GRANT ALL ON FUNCTION public.purityloop_category_key(text) TO authenticated;

GRANT ALL ON FUNCTION public.purityloop_category_key(text) TO service_role;

CREATE FUNCTION public.scan_history_page (
  p_limit        integer                  DEFAULT 10,
  p_offset       integer                  DEFAULT 0,
  p_start_date   timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_end_date     timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_search       text                     DEFAULT NULL::text,
  p_category_key text                     DEFAULT NULL::text,
  p_status       text                     DEFAULT NULL::text,
  p_sort         text                     DEFAULT 'timestamp'::text,
  p_direction    text                     DEFAULT 'desc'::text
)
  RETURNS TABLE (
    scan        jsonb,
    total_count bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with base as (
    select
      s.*,
      public.purityloop_category_key(coalesce(s.verified_category, latest_decision.chosen_category, first_material.category)) as final_category_key
    from scan_results s
    left join lateral (
      select m.*
      from detected_materials m
      where m.scan_result_id = s.id
      order by m.created_at asc nulls last, m.id asc
      limit 1
    ) first_material on true
    left join lateral (
      select d.*
      from scan_review_decisions d
      where d.detected_material_id = first_material.id
      order by d.created_at desc nulls last, d.id desc
      limit 1
    ) latest_decision on true
    where (p_start_date is null or s.created_at >= p_start_date)
      and (p_end_date is null or s.created_at < p_end_date)
      and (nullif(trim(p_search), '') is null or s.source_name ilike '%' || trim(p_search) || '%')
      and (
        nullif(trim(p_status), '') is null
        or (lower(p_status) = 'review_needed' and s.human_review_required is true)
        or (lower(p_status) = 'rejected' and lower(coalesce(s.overall_status, '')) in ('rejected', 'quarantined'))
        or (lower(p_status) = 'confirmed' and s.human_review_required is false)
      )
      and (
        nullif(trim(p_category_key), '') is null
        or public.purityloop_category_key(p_category_key) = public.purityloop_category_key(coalesce(s.verified_category, latest_decision.chosen_category, first_material.category))
      )
  )
  select to_jsonb(page_row) - 'final_category_key' as scan, count(*) over() as total_count
  from base page_row
  order by
    case when p_sort = 'confidence' and lower(p_direction) = 'asc' then page_row.overall_confidence end asc nulls last,
    case when p_sort = 'confidence' and lower(p_direction) <> 'asc' then page_row.overall_confidence end desc nulls last,
    case when p_sort <> 'confidence' and lower(p_direction) = 'asc' then page_row.created_at end asc nulls last,
    case when p_sort <> 'confidence' and lower(p_direction) <> 'asc' then page_row.created_at end desc nulls last,
    page_row.id desc
  limit greatest(1, least(coalesce(p_limit, 10), 100))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

REVOKE ALL ON FUNCTION public.scan_history_page(integer, integer, timestamp WITH time zone, timestamp WITH time zone, text, text, text, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.scan_history_page(integer, integer, timestamp WITH time zone, timestamp WITH time zone, text, text, text, text, text) TO service_role;

CREATE TABLE public.detected_materials (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  scan_result_id     uuid,
  material_name      text,
  category           text,
  confidence         numeric,
  recyclable_status  text,
  contaminant_status text,
  bbox_x             numeric,
  bbox_y             numeric,
  bbox_width         numeric,
  bbox_height        numeric,
  created_at         timestamp with time zone DEFAULT now(),
  original_category  text,
  frame_time_seconds numeric,
  detection_key      text
);

ALTER TABLE public.detected_materials
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.detected_materials
  ADD CONSTRAINT detected_materials_pkey PRIMARY KEY (id);

GRANT ALL ON public.detected_materials TO anon;

GRANT ALL ON public.detected_materials TO authenticated;

GRANT ALL ON public.detected_materials TO service_role;

CREATE INDEX mock_detected_materials_scan_result_id_idx ON public.detected_materials (scan_result_id);

CREATE UNIQUE INDEX mock_detected_materials_scan_detection_key_uidx ON public.detected_materials (scan_result_id, detection_key)
  WHERE detection_key IS NOT NULL;

CREATE POLICY "Allow anon read mock_detected_materials" ON public.detected_materials
  FOR SELECT
  TO anon
  USING (true);

CREATE TABLE public.model_review_flags (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  run_id           uuid,
  class_name       text                     NOT NULL,
  confidence       numeric                  NOT NULL,
  x1               numeric                  NOT NULL,
  y1               numeric                  NOT NULL,
  x2               numeric                  NOT NULL,
  y2               numeric                  NOT NULL,
  signal_type      text                     NOT NULL,
  suggested_label  text                     DEFAULT ''::text NOT NULL,
  flagged_by_email text                     NOT NULL,
  resolved_at      timestamp with time zone,
  retrain_run_id   uuid,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.model_review_flags
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.model_review_flags
  ADD CONSTRAINT model_review_flags_pkey PRIMARY KEY (id);

ALTER TABLE public.model_review_flags
  ADD CONSTRAINT model_review_flags_signal_type_check CHECK (signal_type = ANY (ARRAY['fp'::text, 'fn'::text]));

GRANT ALL ON public.model_review_flags TO service_role;

CREATE INDEX model_review_flags_created_at_idx ON public.model_review_flags (created_at DESC);

CREATE INDEX model_review_flags_unresolved_idx ON public.model_review_flags (resolved_at)
  WHERE resolved_at IS NULL;

CREATE TABLE public.model_review_notifications (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  team              text                     NOT NULL,
  notified_by_email text                     NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.model_review_notifications
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.model_review_notifications
  ADD CONSTRAINT model_review_notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.model_review_notifications
  ADD CONSTRAINT model_review_notifications_team_check CHECK (team = 'development'::text);

GRANT ALL ON public.model_review_notifications TO service_role;

CREATE TABLE public.model_review_retrain_runs (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  status              text                     NOT NULL,
  base_version        text                     NOT NULL,
  new_version         text,
  started_by_email    text                     NOT NULL,
  started_at          timestamp with time zone DEFAULT now() NOT NULL,
  completed_at        timestamp with time zone,
  integrated          boolean                  DEFAULT false NOT NULL,
  integrated_by_email text,
  integrated_at       timestamp with time zone
);

ALTER TABLE public.model_review_retrain_runs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.model_review_retrain_runs
  ADD CONSTRAINT model_review_retrain_runs_pkey PRIMARY KEY (id);

ALTER TABLE public.model_review_flags
  ADD CONSTRAINT model_review_flags_retrain_run_id_fkey FOREIGN KEY (retrain_run_id) REFERENCES public.model_review_retrain_runs(id) ON DELETE SET NULL;

ALTER TABLE public.model_review_retrain_runs
  ADD CONSTRAINT model_review_retrain_runs_status_check CHECK (status = ANY (ARRAY['queued'::text, 'training'::text, 'complete'::text]));

GRANT ALL ON public.model_review_retrain_runs TO service_role;

CREATE UNIQUE INDEX model_review_retrain_runs_one_pending ON public.model_review_retrain_runs ((1))
  WHERE status = 'complete'::text AND integrated = false;

CREATE TABLE public.model_review_runs (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  run_by_email    text                     NOT NULL,
  detection_count integer                  DEFAULT 0 NOT NULL,
  duration_ms     numeric                  NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.model_review_runs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.model_review_runs
  ADD CONSTRAINT model_review_runs_pkey PRIMARY KEY (id);

ALTER TABLE public.model_review_flags
  ADD CONSTRAINT model_review_flags_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.model_review_runs(id) ON DELETE SET NULL;

GRANT ALL ON public.model_review_runs TO service_role;

CREATE INDEX model_review_runs_created_at_idx ON public.model_review_runs (created_at DESC);

CREATE TABLE public.model_review_settings (
  id                   boolean                  DEFAULT true NOT NULL,
  confidence_threshold numeric                  DEFAULT 0.32 NOT NULL,
  retrain_threshold    integer                  DEFAULT 5 NOT NULL,
  updated_by_email     text,
  updated_at           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.model_review_settings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.model_review_settings
  ADD CONSTRAINT model_review_settings_id_check CHECK (id);

ALTER TABLE public.model_review_settings
  ADD CONSTRAINT model_review_settings_pkey PRIMARY KEY (id);

GRANT ALL ON public.model_review_settings TO service_role;

CREATE TABLE public.model_review_tasks (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title            text                     NOT NULL,
  assignee_role    text                     NOT NULL,
  status           text                     DEFAULT 'todo'::text NOT NULL,
  url              text                     DEFAULT ''::text NOT NULL,
  created_by_email text                     NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.model_review_tasks
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.model_review_tasks
  ADD CONSTRAINT model_review_tasks_assignee_role_check CHECK (assignee_role = ANY (ARRAY['development_team'::text, 'plant_manager'::text]));

ALTER TABLE public.model_review_tasks
  ADD CONSTRAINT model_review_tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.model_review_tasks
  ADD CONSTRAINT model_review_tasks_status_check CHECK (status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'blocked'::text, 'done'::text]));

GRANT ALL ON public.model_review_tasks TO service_role;

CREATE TABLE public.processed_drive_files (
  drive_file_id  text                     NOT NULL,
  scan_result_id uuid,
  processed_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.processed_drive_files
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.processed_drive_files
  ADD CONSTRAINT processed_drive_files_pkey PRIMARY KEY (drive_file_id);

GRANT ALL ON public.processed_drive_files TO anon;

GRANT ALL ON public.processed_drive_files TO authenticated;

GRANT ALL ON public.processed_drive_files TO service_role;

CREATE TABLE public.processing_job_drive_files (
  processing_job_id uuid                     NOT NULL,
  drive_file_id     text                     NOT NULL,
  scan_result_id    uuid,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.processing_job_drive_files
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.processing_job_drive_files
  ADD CONSTRAINT processing_job_drive_files_pkey PRIMARY KEY (processing_job_id, drive_file_id);

GRANT ALL ON public.processing_job_drive_files TO anon;

GRANT ALL ON public.processing_job_drive_files TO authenticated;

GRANT ALL ON public.processing_job_drive_files TO service_role;

CREATE TABLE public.processing_jobs (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  source          text                     NOT NULL,
  source_ref      text                     NOT NULL,
  options         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  status          text                     DEFAULT 'queued'::text NOT NULL,
  processed_count integer                  DEFAULT 0 NOT NULL,
  total_count     integer,
  scan_ids        uuid[]                   DEFAULT '{}'::uuid[] NOT NULL,
  attempts        integer                  DEFAULT 0 NOT NULL,
  error           text,
  created_by      text,
  created_by_type text                     DEFAULT 'public'::text NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  started_at      timestamp with time zone,
  completed_at    timestamp with time zone,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL,
  user_id         uuid,
  failed_count    integer                  DEFAULT 0 NOT NULL
);

CREATE FUNCTION public.finish_processing_scan (
  p_scan_id uuid,
  p_job_id  uuid,
  p_failed  boolean,
  p_error   text    DEFAULT NULL::text
)
  RETURNS public.processing_jobs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare job public.processing_jobs;
begin
  update public.mock_scan_results
  set processing_status = case when p_failed then 'failed' else 'completed' end,
      processing_completed_at = now(), processing_error = p_error
  where id = p_scan_id and processing_job_id = p_job_id and processing_status = 'processing';
  if not found then return null; end if;
  update public.processing_jobs
  set processed_count = processed_count + 1,
      failed_count = failed_count + case when p_failed then 1 else 0 end,
      status = 'processing', updated_at = now()
  where id = p_job_id
  returning * into job;
  update public.processing_jobs
  set status = case when failed_count > 0 then 'completed_with_errors' else 'completed' end,
      completed_at = now(), updated_at = now()
  where id = p_job_id and processed_count = total_count
  returning * into job;
  return job;
end $function$;

REVOKE ALL ON FUNCTION public.finish_processing_scan(uuid, uuid, boolean, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.finish_processing_scan(uuid, uuid, boolean, text) TO service_role;

CREATE POLICY processing_job_drive_files_owner_select ON public.processing_job_drive_files
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.processing_jobs job
  WHERE ((job.id = processing_job_drive_files.processing_job_id) AND (job.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.processing_jobs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.processing_jobs
  ADD CONSTRAINT processing_jobs_pkey PRIMARY KEY (id);

ALTER TABLE public.processing_job_drive_files
  ADD CONSTRAINT processing_job_drive_files_processing_job_id_fkey FOREIGN KEY (processing_job_id) REFERENCES public.processing_jobs(id) ON DELETE CASCADE;

ALTER TABLE public.processing_jobs
  ADD CONSTRAINT processing_jobs_source_check CHECK (source = ANY (ARRAY['upload'::text, 'drive_file'::text, 'drive_folder'::text])) NOT VALID;

ALTER TABLE public.processing_jobs
  ADD CONSTRAINT processing_jobs_status_check
    CHECK
    (status = ANY (ARRAY['uploading'::text, 'queued'::text, 'processing'::text, 'complete'::text, 'completed'::text, 'completed_with_errors'::text, 'failed'::text,
    'cancel_requested'::text, 'cancelled'::text])) NOT VALID;

GRANT ALL ON public.processing_jobs TO anon;

GRANT ALL ON public.processing_jobs TO authenticated;

GRANT ALL ON public.processing_jobs TO service_role;

CREATE INDEX processing_jobs_user_active_idx ON public.processing_jobs (user_id, status, updated_at DESC);

CREATE INDEX processing_jobs_status_updated_at_idx ON public.processing_jobs (status, updated_at);

CREATE POLICY processing_jobs_owner_insert ON public.processing_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY processing_jobs_owner_select ON public.processing_jobs
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.scan_results (
  id                      uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                 uuid,
  image_url               text,
  storage_provider        text                     DEFAULT 'google_drive'::text,
  drive_file_id           text,
  drive_file_name         text,
  drive_web_url           text,
  upload_status           text                     DEFAULT 'uploaded'::text,
  processing_status       text                     DEFAULT 'pending'::text,
  total_images            integer,
  source_type             text                     DEFAULT 'image'::text,
  overall_status          text,
  contamination_risk      text,
  recommended_action      text,
  human_review_required   boolean                  DEFAULT false,
  overall_confidence      numeric,
  created_at              timestamp with time zone DEFAULT now(),
  preview_image_url       text,
  review_status           text                     DEFAULT 'review_needed'::text,
  reviewed_category       text,
  review_action           text,
  reviewed_at             timestamp with time zone,
  is_reviewed             boolean                  DEFAULT false,
  verified_category       text,
  source_name             text,
  source_ref              text,
  batch_id                text,
  model_version           text,
  drive_upload_status     text                     DEFAULT 'pending'::text,
  preview_upload_status   text                     DEFAULT 'pending'::text,
  processing_job_id       uuid,
  processing_started_at   timestamp with time zone,
  processing_completed_at timestamp with time zone,
  processing_error        text,
  processing_attempts     integer                  DEFAULT 0 NOT NULL,
  registration_key        text,
  detection_key           text,
  sequence_number         integer,
  drive_mime_type         text,
  legacy_result           boolean,
  result_kind             text,
  total_unique_objects    integer,
  video_tracking_summary  jsonb
);

CREATE FUNCTION public.claim_processing_scan (
  p_scan_id uuid,
  p_job_id  uuid
)
  RETURNS public.scan_results
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare claimed public.mock_scan_results;
begin
  update public.mock_scan_results
  set processing_status = 'processing', processing_started_at = coalesce(processing_started_at, now()),
      processing_attempts = processing_attempts + 1, processing_error = null
  where id = p_scan_id and processing_job_id = p_job_id and processing_status = 'queued'
  returning * into claimed;
  return claimed;
end $function$;

REVOKE ALL ON FUNCTION public.claim_processing_scan(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.claim_processing_scan(uuid, uuid) TO service_role;

CREATE POLICY mock_detected_materials_job_owner_select ON public.detected_materials
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (public.scan_results scan
     JOIN public.processing_jobs job ON ((job.id = scan.processing_job_id)))
  WHERE ((scan.id = detected_materials.scan_result_id) AND (job.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.scan_results
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scan_results
  ADD CONSTRAINT mock_scan_results_processing_job_id_fkey FOREIGN KEY (processing_job_id) REFERENCES public.processing_jobs(id) ON DELETE CASCADE;

ALTER TABLE public.scan_results
  ADD CONSTRAINT mock_scan_results_processing_status_check
    CHECK (processing_status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'complete'::text, 'pending'::text])) NOT VALID;

ALTER TABLE public.scan_results
  ADD CONSTRAINT mock_scan_results_review_status_check CHECK (review_status = ANY (ARRAY['review_needed'::text, 'verified'::text, 'corrected'::text, 'rejected'::text]));

ALTER TABLE public.scan_results
  ADD CONSTRAINT scan_results_pkey PRIMARY KEY (id);

ALTER TABLE public.detected_materials
  ADD CONSTRAINT detected_materials_scan_result_id_fkey FOREIGN KEY (scan_result_id) REFERENCES public.scan_results(id) ON DELETE CASCADE;

ALTER TABLE public.processed_drive_files
  ADD CONSTRAINT processed_drive_files_scan_result_id_fkey FOREIGN KEY (scan_result_id) REFERENCES public.scan_results(id) ON DELETE SET NULL;

ALTER TABLE public.processing_job_drive_files
  ADD CONSTRAINT processing_job_drive_files_scan_result_id_fkey FOREIGN KEY (scan_result_id) REFERENCES public.scan_results(id) ON DELETE SET NULL;

GRANT ALL ON public.scan_results TO anon;

GRANT ALL ON public.scan_results TO authenticated;

GRANT ALL ON public.scan_results TO service_role;

CREATE INDEX mock_scan_results_batch_id_idx ON public.scan_results (batch_id);

CREATE INDEX mock_scan_results_job_completed_idx ON public.scan_results (processing_job_id, processing_completed_at DESC);

CREATE INDEX mock_scan_results_job_status_idx ON public.scan_results (processing_job_id, processing_status);

CREATE INDEX mock_scan_results_processing_job_id_idx ON public.scan_results (processing_job_id);

CREATE UNIQUE INDEX mock_scan_results_job_registration_key_uidx ON public.scan_results (processing_job_id, registration_key)
  WHERE processing_job_id IS NOT NULL AND registration_key IS NOT NULL;

CREATE INDEX mock_scan_results_created_at_idx ON public.scan_results (created_at DESC);

CREATE POLICY "Allow anon read mock_scan_results" ON public.scan_results
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY mock_scan_results_job_owner_select ON public.scan_results
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.processing_jobs job
  WHERE ((job.id = scan_results.processing_job_id) AND (job.user_id = ( SELECT auth.uid() AS uid))))));

CREATE TABLE public.scan_review_decisions (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  scan_result_id       uuid                     NOT NULL,
  detected_material_id uuid                     NOT NULL,
  chosen_category      text                     NOT NULL,
  disposition          text                     NOT NULL,
  outcome              text                     DEFAULT 'confirmed'::text NOT NULL,
  reviewer_email       text,
  created_at           timestamp with time zone DEFAULT now()
);

ALTER TABLE public.scan_review_decisions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scan_review_decisions
  ADD CONSTRAINT scan_review_decisions_detected_material_id_fkey FOREIGN KEY (detected_material_id) REFERENCES public.detected_materials(id) ON DELETE CASCADE;

ALTER TABLE public.scan_review_decisions
  ADD CONSTRAINT scan_review_decisions_disposition_check CHECK (disposition = ANY (ARRAY['recyclable'::text, 'contaminant'::text]));

ALTER TABLE public.scan_review_decisions
  ADD CONSTRAINT scan_review_decisions_outcome_check CHECK (outcome = ANY (ARRAY['confirmed'::text, 'rejected'::text]));

ALTER TABLE public.scan_review_decisions
  ADD CONSTRAINT scan_review_decisions_pkey PRIMARY KEY (id);

ALTER TABLE public.scan_review_decisions
  ADD CONSTRAINT scan_review_decisions_scan_result_id_fkey FOREIGN KEY (scan_result_id) REFERENCES public.scan_results(id) ON DELETE CASCADE;

GRANT ALL ON public.scan_review_decisions TO anon;

GRANT ALL ON public.scan_review_decisions TO authenticated;

GRANT ALL ON public.scan_review_decisions TO service_role;

CREATE INDEX scan_review_decisions_scan_material_created_idx ON public.scan_review_decisions (scan_result_id, detected_material_id, created_at DESC);

CREATE TABLE public.user_profiles (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name         text                     NOT NULL,
  email        text                     NOT NULL,
  role         text                     DEFAULT 'operator'::text NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  auth_user_id uuid,
  status       text                     DEFAULT 'active'::text NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at   timestamp with time zone
);

ALTER TABLE public.user_profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (role = ANY (ARRAY['operator'::text, 'development_team'::text, 'admin'::text, 'plant_manager'::text]));

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));

ALTER TABLE public.user_profiles
  ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE public.scan_results
  ADD CONSTRAINT scan_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;

GRANT SELECT ON public.user_profiles TO authenticated;

GRANT ALL ON public.user_profiles TO service_role;

CREATE UNIQUE INDEX user_profiles_auth_user_id_key ON public.user_profiles (auth_user_id);

CREATE UNIQUE INDEX user_profiles_email_normalized_key ON public.user_profiles (lower(email));

CREATE TRIGGER normalize_user_profile
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_user_profile();

CREATE TRIGGER prevent_last_active_admin_removal
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_active_admin_removal();

CREATE POLICY user_profiles_read_own ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = auth_user_id));
