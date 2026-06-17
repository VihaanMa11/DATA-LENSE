create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'mlh_dashboard',
  source_dir text,
  source_signature text not null,
  upload_batch_id uuid,
  data jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.dashboard_snapshots
  add column if not exists upload_batch_id uuid;

create table if not exists public.dashboard_upload_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'mlh_dashboard',
  status text not null default 'processed',
  file_count integer not null default 0,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.dashboard_uploaded_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.dashboard_upload_batches(id) on delete cascade,
  file_name text not null,
  file_size bigint not null,
  mime_type text,
  file_ext text,
  content_base64 text not null,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_snapshots_active_idx
  on public.dashboard_snapshots (source_name, is_active, created_at desc);

create index if not exists dashboard_snapshots_signature_idx
  on public.dashboard_snapshots (source_name, source_signature);

create index if not exists dashboard_uploaded_files_batch_idx
  on public.dashboard_uploaded_files (batch_id);

alter table public.dashboard_snapshots enable row level security;
alter table public.dashboard_upload_batches enable row level security;
alter table public.dashboard_uploaded_files enable row level security;

comment on table public.dashboard_snapshots is
  'Prepared MIS dashboard JSON snapshots. Access is intended through the server-side Supabase service role key only.';

comment on table public.dashboard_upload_batches is
  'Upload audit batches for dashboard source files. Access is intended through the server-side Supabase service role key only.';

comment on table public.dashboard_uploaded_files is
  'Uploaded dashboard source files encoded as base64 for audit/reprocessing. Access is intended through the server-side Supabase service role key only.';
