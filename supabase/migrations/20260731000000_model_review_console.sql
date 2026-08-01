create table if not exists model_review_runs (
  id uuid primary key default gen_random_uuid(),
  run_by_email text not null,
  detection_count integer not null default 0,
  duration_ms numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists model_review_runs_created_at_idx on model_review_runs (created_at desc);
alter table model_review_runs enable row level security;
revoke all on model_review_runs from anon, authenticated;

create table if not exists model_review_flags (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references model_review_runs(id) on delete set null,
  class_name text not null,
  confidence numeric not null,
  x1 numeric not null, y1 numeric not null, x2 numeric not null, y2 numeric not null,
  signal_type text not null check (signal_type in ('fp','fn')),
  suggested_label text not null default '',
  flagged_by_email text not null,
  resolved_at timestamptz,
  retrain_run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists model_review_flags_created_at_idx on model_review_flags (created_at desc);
create index if not exists model_review_flags_unresolved_idx on model_review_flags (resolved_at) where resolved_at is null;
alter table model_review_flags enable row level security;
revoke all on model_review_flags from anon, authenticated;

create table if not exists model_review_retrain_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('queued','training','complete')),
  base_version text not null,
  new_version text,
  started_by_email text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  integrated boolean not null default false,
  integrated_by_email text,
  integrated_at timestamptz
);
alter table model_review_retrain_runs enable row level security;
revoke all on model_review_retrain_runs from anon, authenticated;

create table if not exists model_review_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee_role text not null check (assignee_role in ('model_team','web_team','project_manager')),
  status text not null check (status in ('todo','in_progress','blocked','done')) default 'todo',
  url text not null default '',
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table model_review_tasks enable row level security;
revoke all on model_review_tasks from anon, authenticated;

create table if not exists model_review_notifications (
  id uuid primary key default gen_random_uuid(),
  team text not null check (team in ('model','web')),
  notified_by_email text not null,
  created_at timestamptz not null default now()
);
alter table model_review_notifications enable row level security;
revoke all on model_review_notifications from anon, authenticated;

create table if not exists model_review_settings (
  id boolean primary key default true check (id),
  confidence_threshold numeric not null default 0.32,
  retrain_threshold integer not null default 5,
  updated_by_email text,
  updated_at timestamptz not null default now()
);
insert into model_review_settings (id) values (true) on conflict do nothing;
alter table model_review_settings enable row level security;
revoke all on model_review_settings from anon, authenticated;
