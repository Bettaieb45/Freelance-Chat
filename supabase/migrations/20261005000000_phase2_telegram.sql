-- Phase 2: Telegram bridge.
--
-- * A client links Telegram by tapping a deep link t.me/<bot>?start=<code>.
--   The code is one-time, short-lived, and only created for a browser that
--   already unlocked the client page (CLAUDE.md decision 2).
-- * The Telegram webhook (service role) stores the chat_id in telegram_links,
--   saves incoming texts as client messages, and the app delivers freelancer
--   replies to that chat.

alter table public.clients
  add column channel_chosen_at timestamptz;

alter table public.messages
  add column delivered_via public.channel;

-- Delivery is recorded by the server only.
drop policy "freelancer sends" on public.messages;
create policy "freelancer sends" on public.messages
  for insert to authenticated
  with check (
    public.owns_client(client_id)
    and sender = 'freelancer'
    and channel = 'web'
    and delivered_at is null
    and delivered_via is null
    and read_at is null
  );

-- One Telegram chat belongs to at most one client, so incoming messages are
-- never ambiguous. Linking it to another client moves it.
create table public.telegram_links (
  client_id uuid primary key references public.clients (id) on delete cascade,
  telegram_chat_id bigint not null unique,
  telegram_username text,
  telegram_name text,
  linked_at timestamptz not null default now()
);

-- Service role only.
create table public.telegram_link_codes (
  code text primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index telegram_link_codes_client_idx on public.telegram_link_codes (client_id);

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;

create policy "freelancer or client device reads telegram link" on public.telegram_links
  for select to authenticated
  using (public.owns_client(client_id) or public.has_client_session(client_id));

revoke all on public.telegram_links, public.telegram_link_codes from anon, authenticated;
grant select on public.telegram_links to authenticated;

-- The client device picks how it wants updates. Telegram can only be picked
-- once a chat is linked (linking itself happens in the webhook). Email comes
-- in Phase 3.
create function public.client_set_preferred_channel(p_client_id uuid, p_channel public.channel)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_client_session(p_client_id) then
    raise exception 'no access to this conversation' using errcode = '42501';
  end if;
  if p_channel = 'email' then
    raise exception 'email updates are not available yet' using errcode = '22023';
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

-- Either side can disconnect Telegram; updates fall back to the web page.
create function public.unlink_telegram(p_client_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.owns_client(p_client_id) or public.has_client_session(p_client_id)) then
    raise exception 'no access to this conversation' using errcode = '42501';
  end if;
  delete from public.telegram_links where client_id = p_client_id;
  update public.clients set preferred_channel = 'web'
   where id = p_client_id and preferred_channel = 'telegram';
end
$$;

-- Service role only: called by the webhook on /start <code>. Returns the
-- client id, or null if the code is unknown, used, expired or the client is
-- archived. Moves the chat away from any client it was linked to before.
create function public.redeem_telegram_link_code(
  p_code text,
  p_chat_id bigint,
  p_username text,
  p_name text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_client uuid;
begin
  update public.telegram_link_codes c
     set used_at = now()
    from public.clients cl
   where c.code = p_code
     and c.used_at is null
     and c.expires_at > now()
     and cl.id = c.client_id
     and not cl.archived
  returning c.client_id into v_client;

  if v_client is null then
    return null;
  end if;

  -- Detach this chat from another client, and fall that client back to web.
  update public.clients set preferred_channel = 'web'
   where preferred_channel = 'telegram'
     and id in (select client_id from public.telegram_links
                 where telegram_chat_id = p_chat_id and client_id <> v_client);
  delete from public.telegram_links where telegram_chat_id = p_chat_id and client_id <> v_client;

  insert into public.telegram_links (client_id, telegram_chat_id, telegram_username, telegram_name)
  values (v_client, p_chat_id, p_username, p_name)
  on conflict (client_id) do update
    set telegram_chat_id = excluded.telegram_chat_id,
        telegram_username = excluded.telegram_username,
        telegram_name = excluded.telegram_name,
        linked_at = now();

  update public.clients
     set preferred_channel = 'telegram', channel_chosen_at = now()
   where id = v_client;

  -- Any other outstanding codes for this client are no longer needed.
  delete from public.telegram_link_codes where client_id = v_client and used_at is null;
  return v_client;
end
$$;

-- Archiving or resetting access also disconnects Telegram, so a closed or
-- reissued conversation can't keep receiving messages from an old chat.
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
    update public.clients set magic_token = p_magic_token where id = p_client_id;
  end if;
  delete from public.client_sessions where client_id = p_client_id;
  delete from public.telegram_link_codes where client_id = p_client_id;
end
$$;

create or replace function public.set_client_archived(p_client_id uuid, p_archived boolean)
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
    delete from public.telegram_links where client_id = p_client_id;
    delete from public.telegram_link_codes where client_id = p_client_id;
    update public.clients set preferred_channel = 'web' where id = p_client_id;
  end if;
end
$$;

revoke execute on function
  public.client_set_preferred_channel(uuid, public.channel),
  public.unlink_telegram(uuid),
  public.redeem_telegram_link_code(text, bigint, text, text)
from public, anon;
grant execute on function
  public.client_set_preferred_channel(uuid, public.channel),
  public.unlink_telegram(uuid)
to authenticated;
revoke execute on function public.redeem_telegram_link_code(text, bigint, text, text) from authenticated;
grant execute on function public.redeem_telegram_link_code(text, bigint, text, text) to service_role;

alter publication supabase_realtime add table public.telegram_links;
