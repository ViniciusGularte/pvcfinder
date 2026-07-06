create extension if not exists pgcrypto;

create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  item_name text not null,
  store_id text,
  store_name text not null,
  price numeric(12, 4),
  currency text default 'market',
  stock integer,
  available boolean default true,
  raw_data jsonb,
  snapshot_date date not null default current_date,
  created_at timestamptz default now(),
  unique (item_id, store_name, snapshot_date)
);

create index if not exists idx_price_snapshots_item_id
on public.price_snapshots(item_id);

create index if not exists idx_price_snapshots_snapshot_date
on public.price_snapshots(snapshot_date);

create index if not exists idx_price_snapshots_store_name
on public.price_snapshots(store_name);

create table if not exists public.price_watch_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  item_id text not null,
  item_name text not null,
  target_price numeric(12, 4) not null,
  currency text default 'market',
  push_endpoint text,
  push_p256dh text,
  push_auth text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_price_watch_item_id
on public.price_watch_subscriptions(item_id);

create index if not exists idx_price_watch_player_name
on public.price_watch_subscriptions(player_name);

create index if not exists idx_price_watch_active
on public.price_watch_subscriptions(active);

create table if not exists public.price_watch_notifications (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.price_watch_subscriptions(id) on delete cascade,
  item_id text not null,
  item_name text not null,
  store_name text,
  price numeric(12, 4),
  target_price numeric(12, 4),
  delivery_status text not null default 'sent',
  delivery_error text,
  sent_at timestamptz default now(),
  snapshot_date date not null default current_date
);

alter table public.price_watch_notifications
add column if not exists delivery_status text not null default 'sent';

alter table public.price_watch_notifications
add column if not exists delivery_error text;

create index if not exists idx_notifications_subscription_id
on public.price_watch_notifications(subscription_id);

create unique index if not exists unique_daily_notification
on public.price_watch_notifications(subscription_id, item_id, snapshot_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_price_watch_subscriptions_updated_at
on public.price_watch_subscriptions;

create trigger set_price_watch_subscriptions_updated_at
before update on public.price_watch_subscriptions
for each row
execute function public.set_updated_at();
