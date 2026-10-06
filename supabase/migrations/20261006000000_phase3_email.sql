-- Phase 3: two-way email through the freelancer's Gmail (CLAUDE.md decision 6).
--
-- * Outbound: the app emails the client from the freelancer's Gmail (SMTP,
--   App Password). Reply-To is a per-client plus address:
--   <gmail user>+c<email_reply_token>@gmail.com
-- * Inbound: a timer (Supabase pg_cron -> /api/cron/email) reads the mailbox
--   over IMAP and saves replies sent to a plus address as client messages.

-- 24 hex chars (~96 random bits) from two v4 UUIDs; gen_random_uuid is core
-- Postgres and cryptographically random.
create function public.new_email_reply_token()
returns text
language sql volatile
as $$
  select left(replace(gen_random_uuid()::text, '-', ''), 12) || right(replace(gen_random_uuid()::text, '-', ''), 12)
$$;

alter table public.clients
  add column email_reply_token text unique default public.new_email_reply_token(),
  add column email_thread_message_id text;

update public.clients set email_reply_token = public.new_email_reply_token() where email_reply_token is null;
alter table public.clients alter column email_reply_token set not null;

-- Service role only: every inbound email we've looked at, so a message is
-- never saved twice (overlapping timer runs, re-syncs).
create table public.email_inbound (
  message_id text primary key,
  client_id uuid references public.clients (id) on delete cascade,
  status text not null,
  received_at timestamptz not null default now()
);

-- Service role only: where the IMAP sync left off, and its health.
create table public.email_sync_state (
  id int primary key default 1 check (id = 1),
  uidvalidity bigint,
  last_uid bigint,
  last_run_at timestamptz,
  last_error text
);

alter table public.email_inbound enable row level security;
alter table public.email_sync_state enable row level security;
revoke all on public.email_inbound, public.email_sync_state from anon, authenticated;

-- Email can now be chosen, if the client has an address.
create or replace function public.client_set_preferred_channel(p_client_id uuid, p_channel public.channel)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_client_session(p_client_id) then
    raise exception 'no access to this conversation' using errcode = '42501';
  end if;
  if p_channel = 'email'
     and not exists (select 1 from public.clients where id = p_client_id and email is not null) then
    raise exception 'no email address' using errcode = '22023';
  end if;
  if p_channel = 'telegram'
     and not exists (select 1 from public.telegram_links where client_id = p_client_id) then
    raise exception 'telegram is not linked' using errcode = '22023';
  end if;
  update public.clients
     set preferred_channel = p_channel, channel_chosen_at = now()
   where id = p_client_id;
end
$$;

-- The client picks email updates and gives (or corrects) their address.
create function public.client_set_email(p_client_id uuid, p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if not public.has_client_session(p_client_id) then
    raise exception 'no access to this conversation' using errcode = '42501';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email address' using errcode = '22023';
  end if;
  update public.clients
     set email = v_email, preferred_channel = 'email', channel_chosen_at = now()
   where id = p_client_id;
end
$$;

revoke execute on function public.client_set_email(uuid, text) from public, anon;
grant execute on function public.client_set_email(uuid, text) to authenticated;
revoke execute on function public.new_email_reply_token() from public, anon, authenticated;

-- Reset link also rotates the reply address, so old emails can't post into
-- the conversation anymore.
create or replace function public.reset_client_access(
  p_client_id uuid,
  p_passcode_hash text,
  p_magic_token text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_client(p_client_id) then
    raise exception 'not your client' using errcode = '42501';
  end if;
  update public.client_access
     set passcode_hash = p_passcode_hash, failed_attempts = 0, locked_until = null, updated_at = now()
   where client_id = p_client_id;
  if p_magic_token is not null then
    update public.clients
       set magic_token = p_magic_token,
           email_reply_token = public.new_email_reply_token(),
           email_thread_message_id = null
     where id = p_client_id;
  end if;
  delete from public.client_sessions where client_id = p_client_id;
  delete from public.telegram_link_codes where client_id = p_client_id;
end
$$;
