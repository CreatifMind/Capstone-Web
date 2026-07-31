create unique index if not exists model_review_retrain_runs_one_pending
  on model_review_retrain_runs ((1))
  where status = 'complete' and integrated = false;

alter table model_review_flags
  add constraint model_review_flags_retrain_run_id_fkey
  foreign key (retrain_run_id) references model_review_retrain_runs(id) on delete set null;
