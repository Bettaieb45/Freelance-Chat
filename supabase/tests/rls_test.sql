-- RLS / RPC tests. Run with scripts/test-db.sh. Any failed assertion aborts.
\set f1 '00000000-0000-0000-0000-0000000000f1'
\set f2 '00000000-0000-0000-0000-0000000000f2'
\set d1 '00000000-0000-0000-0000-0000000000d1'
\set d2 '00000000-0000-0000-0000-0000000000d2'

create function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: expected error: %', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;

create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', label; end if;
end $$;

-- Seed as superuser (what the auth callback does with the service role).
insert into auth.users (id, email) values (:'f1', 'me@example.com'), (:'f2', 'other@example.com');
insert into auth.users (id, is_anonymous) values (:'d1', true), (:'d2', true);
insert into public.freelancers (auth_user_id, name, email)
values (:'f1', 'Me', 'me@example.com'), (:'f2', 'Other', 'other@example.com');

-- Freelancer 1 creates a client --------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select public.create_client('Acme', 'a@acme.test', 'https://drive.google.com/x', 'tokA', 'hashA') as client_a \gset
select pg_temp.expect((select count(*) = 1 from public.clients), 'f1 sees its client');
select pg_temp.expect_error($$select * from public.client_access$$, 'f1 cannot read passcode hashes');
select pg_temp.expect_error(
  $$insert into public.clients (freelancer_id, name, magic_token) values (public.current_freelancer_id(), 'x', 't')$$,
  'direct client insert blocked');
select pg_temp.expect_error($$update public.clients set magic_token = 'mine'$$, 'cannot rewrite token directly');
update public.clients set name = 'Acme Inc' where id = :'client_a';
select pg_temp.expect((select name = 'Acme Inc' from public.clients where id = :'client_a'), 'f1 can rename');

insert into public.messages (client_id, sender, body) values (:'client_a', 'freelancer', 'Hello!');
select pg_temp.expect_error(
  format($$insert into public.messages (client_id, sender, body) values (%L, 'client', 'fake')$$, :'client_a'),
  'freelancer cannot impersonate client');
select pg_temp.expect_error(
  format($$insert into public.messages (client_id, sender, body, read_at) values (%L, 'freelancer', 'x', now())$$, :'client_a'),
  'freelancer cannot fake read receipts');
select pg_temp.expect_error($$update public.messages set body = 'edited'$$, 'messages are immutable');

-- Freelancer 2 sees nothing of freelancer 1 ---------------------------------
select set_config('request.jwt.claim.sub', :'f2', false);
select pg_temp.expect((select count(*) = 0 from public.clients), 'f2 sees no foreign clients');
select pg_temp.expect((select count(*) = 0 from public.messages), 'f2 sees no foreign messages');
select pg_temp.expect_error(format($$select public.reset_client_access(%L, 'h')$$, :'client_a'), 'f2 cannot reset');
select pg_temp.expect_error(format($$select public.set_client_archived(%L, true)$$, :'client_a'), 'f2 cannot archive');
select pg_temp.expect_error(format($$select public.mark_read(%L)$$, :'client_a'), 'f2 cannot mark read');
select pg_temp.expect_error(
  format($$insert into public.messages (client_id, sender, body) values (%L, 'freelancer', 'x')$$, :'client_a'),
  'f2 cannot post into foreign thread');

-- Device without a session ---------------------------------------------------
select set_config('request.jwt.claim.sub', :'d2', false);
select pg_temp.expect((select count(*) = 0 from public.messages), 'locked device sees nothing');
select pg_temp.expect((select count(*) = 0 from public.clients), 'locked device sees no clients');
select pg_temp.expect_error(format($$select public.client_send_message(%L, 'hi')$$, :'client_a'), 'locked device cannot send');
select pg_temp.expect_error(format($$select public.create_client('x','','','t','h')$$), 'device cannot create clients');
select pg_temp.expect_error(
  format($$insert into public.client_sessions (auth_user_id, client_id) values (%L, %L)$$, :'d2', :'client_a'),
  'device cannot grant itself a session');

-- Device with a session (server inserts it after a correct passcode) ---------
reset role;
insert into public.client_sessions (auth_user_id, client_id) values (:'d1', :'client_a');
set role authenticated;
select set_config('request.jwt.claim.sub', :'d1', false);
select pg_temp.expect((select count(*) = 1 from public.messages), 'unlocked device sees thread');
select pg_temp.expect((select count(*) = 0 from public.clients), 'device cannot read client row (token etc.)');
select pg_temp.expect_error(
  format($$insert into public.messages (client_id, sender, body) values (%L, 'client', 'x')$$, :'client_a'),
  'device cannot insert directly');
select public.client_send_message(:'client_a', '  Hi back  ');
select pg_temp.expect((select body = 'Hi back' from public.messages where sender = 'client'), 'body trimmed');
select pg_temp.expect(
  (select read_at is not null from public.messages where sender = 'freelancer'),
  'client reply marks earlier freelancer messages read');

-- Inbox fields maintained by trigger
reset role;
select pg_temp.expect(
  (select last_message_preview = 'Hi back' and last_message_sender = 'client' from public.clients where id = :'client_a'),
  'inbox preview updated');

-- Freelancer reads the client message
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
insert into public.messages (client_id, sender, body) values (:'client_a', 'freelancer', 'Second');
select public.mark_read(:'client_a');
select pg_temp.expect(
  (select read_at is not null from public.messages where sender = 'client'), 'freelancer marks client msgs read');
select pg_temp.expect(
  (select read_at is null from public.messages where body = 'Second'), 'freelancer cannot mark own msgs read');

-- Client marks freelancer messages read while page visible
select set_config('request.jwt.claim.sub', :'d1', false);
select public.mark_read(:'client_a');
select pg_temp.expect(
  (select read_at is not null from public.messages where body = 'Second'), 'client marks freelancer msgs read');

-- Archiving signs devices out ------------------------------------------------
select set_config('request.jwt.claim.sub', :'f1', false);
select public.set_client_archived(:'client_a', true);
select set_config('request.jwt.claim.sub', :'d1', false);
select pg_temp.expect((select count(*) = 0 from public.messages), 'archived: device loses access');
select pg_temp.expect_error(format($$select public.client_send_message(%L, 'hi')$$, :'client_a'), 'archived: cannot send');

-- Resetting access signs devices out and changes the link -------------------
select set_config('request.jwt.claim.sub', :'f1', false);
select public.set_client_archived(:'client_a', false);
reset role;
insert into public.client_sessions (auth_user_id, client_id) values (:'d1', :'client_a');
update public.client_access set failed_attempts = 3 where client_id = :'client_a';
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select public.reset_client_access(:'client_a', 'hashB', 'tokB');
reset role;
select pg_temp.expect((select count(*) = 0 from public.client_sessions), 'reset: sessions cleared');
select pg_temp.expect(
  (select passcode_hash = 'hashB' and failed_attempts = 0 from public.client_access), 'reset: new hash, counter cleared');
select pg_temp.expect((select magic_token = 'tokB' from public.clients), 'reset: new link');

-- Passcode lockout counter (service role only) -----------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select pg_temp.expect_error(format($$select public.record_passcode_failure(%L, 5, 15)$$, :'client_a'), 'freelancer cannot call lockout fn');
set role service_role;
select pg_temp.expect(public.record_passcode_failure(:'client_a', 3, 15) = 2, 'first failure: 2 left');
select pg_temp.expect(public.record_passcode_failure(:'client_a', 3, 15) = 1, 'second failure: 1 left');
select pg_temp.expect(public.record_passcode_failure(:'client_a', 3, 15) = 0, 'third failure: locked');
reset role;
select pg_temp.expect(
  (select locked_until > now() + interval '14 minutes' and failed_attempts = 0 from public.client_access),
  'locked for 15 minutes, counter reset');

-- anon role has no access at all ----------------------------------------------
set role anon;
select pg_temp.expect_error($$select * from public.messages$$, 'anon cannot read messages');
select pg_temp.expect_error(format($$select public.mark_read(%L)$$, :'client_a'), 'anon cannot call rpc');
reset role;
