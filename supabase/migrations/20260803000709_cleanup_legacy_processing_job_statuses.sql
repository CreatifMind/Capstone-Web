-- Forward-only cleanup for legacy pre-ingest processing job statuses.
-- Ten jobs have no related scan_results; one has pending scan_results with no processing start, completion, or error.
-- Map to upload_pending so historical incomplete uploads are not requeued for processing.

update public.processing_jobs
   set status = 'upload_pending'
 where status = 'uploading'
   and id in (
    '14ef1b11-d8a9-4966-85c6-4573d951f38c',
    '1adf7cc7-e010-4dd7-9d05-6397e18bcef3',
    '1c3eefc8-f40d-424f-b15f-125a8e45a200',
    '236b36e6-8c28-4a03-94d7-61e557fae3c9',
    '4394f723-dfd9-4384-8452-506b7ec1b031',
    '9f0a37d2-dcc9-4208-b400-3d4f8860841d',
    'c49104c2-b361-4222-a2c8-9f8f46efae39',
    'e1ba643f-2844-44c8-97f9-41ae8d297071',
    'e5afe1b9-cbd1-4115-af1f-0ebfd43625bc',
    'f1ac60bc-b38e-44a8-b1da-62d4044bb7c4',
    'f58c37c7-8c68-4c65-8987-cf4417f9b071'
   );

do $$
begin
  if exists (
    select 1
      from public.processing_jobs
     where status not in (
       'upload_pending',
       'queued',
       'processing',
       'complete',
       'completed',
       'completed_with_errors',
       'failed',
       'cancel_requested',
       'cancelled'
     )
  ) then
    raise exception 'processing_jobs contains statuses outside processing_jobs_status_check';
  end if;
end;
$$;

alter table public.processing_jobs
  validate constraint processing_jobs_status_check;
