-- Keep deployed queue status values compatible during the complete/completed rename.
alter table public.processing_jobs drop constraint if exists processing_jobs_status_check;
alter table public.processing_jobs add constraint processing_jobs_status_check
  check (status in ('uploading', 'queued', 'processing', 'complete', 'completed', 'completed_with_errors', 'failed', 'cancel_requested', 'cancelled')) not valid;
