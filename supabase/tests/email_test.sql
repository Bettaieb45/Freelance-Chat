-- Phase 3 email tests. Run with scripts/test-db.sh. Any failed assertion aborts.
\set f1 '20000000-0000-0000-0000-0000000000f1'
\set d1 '20000000-0000-0000-0000-0000000000d1'
\set d2 '20000000-0000-0000-0000-0000000000d2'

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

insert into auth.users (id, email) values (:'f1', 'em1@example.com');
insert into auth.users (id, is_anonymous) values (:'d1', true), (:'d2', true);
insert into public.freelancers (auth_user_id, name, email) values (:'f1', 'Me', 'em1@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select public.create_client('No Email', '', '', 'emTokA', 'h') as client_a \gset
select public.create_client('Has Email', 'b@x.test', '', 'emTokB', 'h') as client_b \gset
reset role;
insert into public.client_sessions (auth_user_id, client_id) values (:'d1', :'client_a'), (:'d1', :'client_b');

-- Reply tokens
select pg_temp.expect((select bool_and(email_reply_token ~ '^[0-9a-f]{24}$') from public.clients), 'clients get 24-hex reply tokens');
select pg_temp.expect((select count(distinct email_reply_token) = count(*) from public.clients), 'reply tokens unique');

set role authenticated;
select set_config('request.jwt.claim.sub', :'d1', false);
select pg_temp.expect_error(format($$select public.client_set_preferred_channel(%L, 'email')$$, :'client_a'),
  'cannot pick email without an address');
select public.client_set_preferred_channel(:'client_b', 'email');
select pg_temp.expect_error(format($$select public.client_set_email(%L, 'not-an-email')$$, :'client_a'), 'invalid email rejected');
select public.client_set_email(:'client_a', '  Ana@Example.COM ');
select set_config('request.jwt.claim.sub', :'d2', false);
select pg_temp.expect_error(format($$select public.client_set_email(%L, 'x@y.z')$$, :'client_a'), 'locked device cannot set email');
select pg_temp.expect_error($$select public.new_email_reply_token()$$, 'app users cannot call token fn');
select pg_temp.expect_error($$select * from public.email_inbound$$, 'app users cannot read inbound log');
select pg_temp.expect_error($$select * from public.email_sync_state$$, 'app users cannot read sync state');
reset role;
select pg_temp.expect(
  (select email = 'ana@example.com' and preferred_channel = 'email' and channel_chosen_at is not null
     from public.clients where id = :'client_a'), 'email saved normalized, channel email');
select pg_temp.expect((select preferred_channel = 'email' from public.clients where id = :'client_b'), 'B on email');

-- Reset link rotates the reply address; reset passcode alone does not
select email_reply_token as tok_before from public.clients where id = :'client_a' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select public.reset_client_access(:'client_a', 'h2');
reset role;
select pg_temp.expect((select email_reply_token = :'tok_before' from public.clients where id = :'client_a'), 'new passcode keeps reply address');
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select public.reset_client_access(:'client_a', 'h3', 'emTokA2');
reset role;
select pg_temp.expect((select email_reply_token <> :'tok_before' from public.clients where id = :'client_a'), 'new link rotates reply address');
