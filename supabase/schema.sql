create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'mlh_dashboard',
  source_dir text,
  source_signature text not null,
  data jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_snapshots_active_idx
  on public.dashboard_snapshots (source_name, is_active, created_at desc);

create index if not exists dashboard_snapshots_signature_idx
  on public.dashboard_snapshots (source_name, source_signature);

alter table public.dashboard_snapshots enable row level security;

comment on table public.dashboard_snapshots is
  'Prepared MIS dashboard JSON snapshots. Access is intended through the server-side Supabase service role key only.';
