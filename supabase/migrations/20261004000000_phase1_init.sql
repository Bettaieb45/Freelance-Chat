-- Phase 1: freelancer inbox, clients, passcode-protected client page, web chat.
--
-- Security model (see CLAUDE.md "Decisions"):
--   * The freelancer is a normal Supabase Auth user (Google). Their row in
--     `freelancers` is created by the server (service role) on first sign-in,
--     and only for the address in ALLOWED_EMAIL.
--   * A client device is an anonymous Supabase Auth user. After it enters the
--     right passcode, the server adds a `client_sessions` row linking that
--     anonymous user to one client. RLS then lets it read that conversation.
--   * Passcode hashes live in `client_access`, which has RLS enabled and no
--     policies, so only the service role can read it.

create type public.channel as enum ('web', 'telegram', 'email');
create type public.sender as enum ('freelancer', 'client');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.freelancers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  business_hours jsonb,
  auto_reply_text text,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.freelancers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text check (email is null or char_length(email) <= 254),
  drive_link text check (drive_link is null or drive_link ~ '^https://'),
  magic_token text not null unique,
  preferred_channel public.channel not null default 'web',
  archived boolean not null default false,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender public.sender,
  created_at timestamptz not null default now()
);

create index clients_inbox_idx
  on public.clients (freelancer_id, archived, last_message_at desc nulls last);

-- Service-role only: passcode hash and brute-force lockout state.
create table public.client_access (
  client_id uuid primary key references public.clients (id) on delete cascade,
  passcode_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- A browser (anonymous auth user) that unlocked a client page.
create table public.client_sessions (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, client_id)
);

create index client_sessions_client_idx on public.client_sessions (client_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  sender public.sender not null,
  body text not null check (char_length(body) between 1 and 5000),
  channel public.channel not null default 'web',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz
);

create index messages_thread_idx on public.messages (client_id, created_at);
create index messages_unread_idx on public.messages (client_id, sender) where read_at is null;

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------

create function public.current_freelancer_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.freelancers where auth_user_id = auth.uid()
$$;

create function public.owns_client(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    join public.freelancers f on f.id = c.freelancer_id
    where c.id = p_client_id and f.auth_user_id = auth.uid()
  )
$$;

create function public.has_client_session(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.client_sessions s
    join public.clients c on c.id = s.client_id
    where s.client_id = p_client_id
      and s.auth_user_id = auth.uid()
      and not c.archived
  )
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.freelancers enable row level security;
alter table public.clients enable row level security;
alter table public.client_access enable row level security;
alter table public.client_sessions enable row level security;
alter table public.messages enable row level security;

create policy "freelancer reads self" on public.freelancers
  for select to authenticated using (auth_user_id = auth.uid());
create policy "freelancer updates self" on public.freelancers
  for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy "freelancer reads own clients" on public.clients
  for select to authenticated using (freelancer_id = public.current_freelancer_id());
create policy "freelancer updates own clients" on public.clients
  for update to authenticated
  using (freelancer_id = public.current_freelancer_id())
  with check (freelancer_id = public.current_freelancer_id());
-- Inserts go through create_client() so the passcode row is created atomically.

-- client_access: no policies (service role only).

create policy "device reads own sessions" on public.client_sessions
  for select to authenticated using (auth_user_id = auth.uid());

create policy "freelancer or client device reads thread" on public.messages
  for select to authenticated
  using (public.owns_client(client_id) or public.has_client_session(client_id));
create policy "freelancer sends" on public.messages
  for insert to authenticated
  with check (
    public.owns_client(client_id)
    and sender = 'freelancer'
    and channel = 'web'
    and delivered_at is null
    and read_at is null
  );
-- Clients send through client_send_message(); read receipts through mark_read().

-- Lock down column-level writes: freelancers may edit these client fields only.
revoke update on public.clients from authenticated, anon;
grant update (name, email, drive_link) on public.clients to authenticated;
revoke update on public.freelancers from authenticated, anon;
grant update (name, business_hours, auto_reply_text) on public.freelancers to authenticated;
revoke all on public.client_access from authenticated, anon;
revoke insert, update, delete on public.client_sessions from authenticated, anon;
revoke update, delete on public.messages from authenticated, anon;
revoke all on public.freelancers, public.clients, public.client_sessions, public.messages from anon;
grant select on public.freelancers, public.clients, public.client_sessions, public.messages to authenticated;
grant insert on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Creates a client and its passcode row. The token and hash are generated in
-- the app server (Node crypto), never in the browser.
create function public.create_client(
  p_name text,
  p_email text,
  p_drive_link text,
  p_magic_token text,
  p_passcode_hash text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_freelancer uuid := public.current_freelancer_id();
  v_client uuid;
begin
  if v_freelancer is null then
    raise exception 'not a freelancer' using errcode = '42501';
  end if;
  insert into public.clients (freelancer_id, name, email, drive_link, magic_token)
  values (v_freelancer, p_name, nullif(p_email, ''), nullif(p_drive_link, ''), p_magic_token)
  returning id into v_client;
  insert into public.client_access (client_id, passcode_hash) values (v_client, p_passcode_hash);
  return v_client;
end
$$;

-- New passcode and/or new link. Either way, every device that unlocked the
-- page is signed out and must enter the (new) passcode again.
create function public.reset_client_access(
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
    update public.clients set magic_token = p_magic_token where id = p_client_id;
  end if;
  delete from public.client_sessions where client_id = p_client_id;
end
$$;

create function public.set_client_archived(p_client_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_client(p_client_id) then
    raise exception 'not your client' using errcode = '42501';
  end if;
  update public.clients set archived = p_archived where id = p_client_id;
  if p_archived then
    delete from public.client_sessions where client_id = p_client_id;
  end if;
end
$$;

create function public.client_send_message(p_client_id uuid, p_body text)
returns public.messages
language plpgsql security definer set search_path = ''
as $$
declare
  v_message public.messages;
begin
  if not public.has_client_session(p_client_id) then
    raise exception 'no access to this conversation' using errcode = '42501';
  end if;
  insert into public.messages (client_id, sender, body, channel)
  values (p_client_id, 'client', btrim(p_body), 'web')
  returning * into v_message;
  return v_message;
end
$$;

-- Marks the *other side's* messages in a thread as read. Called by the
-- freelancer when they open a chat, and by the client page while visible.
create function public.mark_read(p_client_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.owns_client(p_client_id) then
    update public.messages set read_at = now()
     where client_id = p_client_id and sender = 'client' and read_at is null;
  elsif public.has_client_session(p_client_id) then
    update public.messages set read_at = now()
     where client_id = p_client_id and sender = 'freelancer' and read_at is null;
  else
    raise exception 'no access to this conversation' using errcode = '42501';
  end if;
end
$$;

revoke execute on function
  public.create_client(text, text, text, text, text),
  public.reset_client_access(uuid, text, text),
  public.set_client_archived(uuid, boolean),
  public.client_send_message(uuid, text),
  public.mark_read(uuid)
from public, anon;
grant execute on function
  public.create_client(text, text, text, text, text),
  public.reset_client_access(uuid, text, text),
  public.set_client_archived(uuid, boolean),
  public.client_send_message(uuid, text),
  public.mark_read(uuid)
to authenticated;

-- Service role only: counts a wrong passcode atomically and locks the client
-- page after p_max failures. Returns attempts left before the lock (0 = locked).
create function public.record_passcode_failure(p_client_id uuid, p_max int, p_lock_minutes int)
returns int
language sql security definer set search_path = ''
as $$
  update public.client_access
     set failed_attempts = case when failed_attempts + 1 >= p_max then 0 else failed_attempts + 1 end,
         locked_until = case when failed_attempts + 1 >= p_max
                             then now() + make_interval(mins => p_lock_minutes) else locked_until end,
         updated_at = now()
   where client_id = p_client_id
  returning case when locked_until > now() then 0 else p_max - failed_attempts end
$$;

revoke execute on function public.record_passcode_failure(uuid, int, int) from public, anon, authenticated;
grant execute on function public.record_passcode_failure(uuid, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Keeps the inbox ordering/preview current, and applies the "a reply proves
-- they read it" rule: when the client sends anything, on any channel, every
-- earlier freelancer message counts as read.
create function public.on_message_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.clients
     set last_message_at = new.created_at,
         last_message_preview = left(new.body, 140),
         last_message_sender = new.sender
   where id = new.client_id;

  if new.sender = 'client' then
    update public.messages
       set read_at = now()
     where client_id = new.client_id
       and sender = 'freelancer'
       and read_at is null
       and created_at <= new.created_at;
  end if;
  return new;
end
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.on_message_inserted();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages, public.clients;
