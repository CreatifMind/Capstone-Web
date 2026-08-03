-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

REVOKE ALL ON FUNCTION public.claim_processing_scan(uuid, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.claim_processing_scan(uuid, uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.finish_processing_scan(uuid, uuid, boolean, text) FROM anon;

REVOKE ALL ON FUNCTION public.finish_processing_scan(uuid, uuid, boolean, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.scan_history_page(integer, integer, timestamp WITH time zone, timestamp WITH time zone, text, text, text, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.scan_history_page(integer, integer, timestamp WITH time zone, timestamp WITH time zone, text, text, text, text, text) FROM authenticated;

REVOKE ALL ON public.model_review_flags FROM anon;

REVOKE ALL ON public.model_review_flags FROM authenticated;

REVOKE ALL ON public.model_review_notifications FROM anon;

REVOKE ALL ON public.model_review_notifications FROM authenticated;

REVOKE ALL ON public.model_review_retrain_runs FROM anon;

REVOKE ALL ON public.model_review_retrain_runs FROM authenticated;

REVOKE ALL ON public.model_review_runs FROM anon;

REVOKE ALL ON public.model_review_runs FROM authenticated;

REVOKE ALL ON public.model_review_settings FROM anon;

REVOKE ALL ON public.model_review_settings FROM authenticated;

REVOKE ALL ON public.model_review_tasks FROM anon;

REVOKE ALL ON public.model_review_tasks FROM authenticated;

REVOKE ALL ON public.user_profiles FROM anon;

REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.user_profiles FROM authenticated;
