-- Phase 2 Telegram tests. Run with scripts/test-db.sh. Any failed assertion aborts.
\set f1 '10000000-0000-0000-0000-0000000000f1'
\set f2 '10000000-0000-0000-0000-0000000000f2'
\set d1 '10000000-0000-0000-0000-0000000000d1'
\set d2 '10000000-0000-0000-0000-0000000000d2'

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

insert into auth.users (id, email) values (:'f1', 'tg1@example.com'), (:'f2', 'tg2@example.com');
insert into auth.users (id, is_anonymous) values (:'d1', true), (:'d2', true);
insert into public.freelancers (auth_user_id, name, email)
values (:'f1', 'Me', 'tg1@example.com'), (:'f2', 'Other', 'tg2@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select public.create_client('Tele A', '', '', 'tgTokA', 'h') as client_a \gset
select public.create_client('Tele B', '', '', 'tgTokB', 'h') as client_b \gset
reset role;
insert into public.client_sessions (auth_user_id, client_id) values (:'d1', :'client_a');

-- Choosing a channel -------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'d1', false);
select public.client_set_preferred_channel(:'client_a', 'web');
select pg_temp.expect_error(format($$select public.client_set_preferred_channel(%L, 'telegram')$$, :'client_a'),
  'cannot pick telegram before linking');
select pg_temp.expect_error(format($$select public.client_set_preferred_channel(%L, 'email')$$, :'client_a'),
  'email not available yet');
select pg_temp.expect_error(format($$select public.client_set_preferred_channel(%L, 'web')$$, :'client_b'),
  'device cannot set channel of another client');
select set_config('request.jwt.claim.sub', :'d2', false);
select pg_temp.expect_error(format($$select public.client_set_preferred_channel(%L, 'web')$$, :'client_a'),
  'locked device cannot set channel');
reset role;
select pg_temp.expect((select channel_chosen_at is not null from public.clients where id = :'client_a'), 'choice recorded');

-- Codes and links are not writable or readable by app users -----------------
insert into public.telegram_link_codes (code, client_id, expires_at) values
  ('good', :'client_a', now() + interval '30 minutes'),
  ('old', :'client_a', now() - interval '1 minute'),
  ('forB', :'client_b', now() + interval '30 minutes');
set role authenticated;
select set_config('request.jwt.claim.sub', :'d1', false);
select pg_temp.expect_error($$select * from public.telegram_link_codes$$, 'device cannot read codes');
select pg_temp.expect_error(
  format($$insert into public.telegram_links (client_id, telegram_chat_id) values (%L, 1)$$, :'client_a'),
  'device cannot link itself');
select pg_temp.expect_error($$select public.redeem_telegram_link_code('good', 1, null, null)$$, 'device cannot redeem');
select set_config('request.jwt.claim.sub', :'f1', false);
select pg_temp.expect_error($$select public.redeem_telegram_link_code('good', 1, null, null)$$, 'freelancer cannot redeem');

-- Redeeming (service role, from the webhook) --------------------------------
set role service_role;
select pg_temp.expect(public.redeem_telegram_link_code('nope', 777, 'acme', 'Acme') is null, 'unknown code rejected');
select pg_temp.expect(public.redeem_telegram_link_code('old', 777, 'acme', 'Acme') is null, 'expired code rejected');
select pg_temp.expect(public.redeem_telegram_link_code('good', 777, 'acme', 'Acme') = :'client_a'::uuid, 'valid code links');
select pg_temp.expect(public.redeem_telegram_link_code('good', 888, 'evil', 'Evil') is null, 'code is single use');
reset role;
select pg_temp.expect(
  (select preferred_channel = 'telegram' from public.clients where id = :'client_a'), 'linking switches channel to telegram');
select pg_temp.expect((select count(*) = 0 from public.telegram_link_codes where client_id = :'client_a' and used_at is null),
  'other open codes cleared');

-- Who can see the link
set role authenticated;
select set_config('request.jwt.claim.sub', :'d1', false);
select pg_temp.expect((select telegram_username = 'acme' from public.telegram_links), 'device sees own link');
select set_config('request.jwt.claim.sub', :'d2', false);
select pg_temp.expect((select count(*) = 0 from public.telegram_links), 'locked device sees no links');
select set_config('request.jwt.claim.sub', :'f2', false);
select pg_temp.expect((select count(*) = 0 from public.telegram_links), 'other freelancer sees no links');
select pg_temp.expect_error(format($$select public.unlink_telegram(%L)$$, :'client_a'), 'other freelancer cannot unlink');
select set_config('request.jwt.claim.sub', :'f1', false);
select pg_temp.expect((select count(*) = 1 from public.telegram_links), 'freelancer sees link');

-- Same chat linked to another client moves over --------------------------------
set role service_role;
select pg_temp.expect(public.redeem_telegram_link_code('forB', 777, 'acme', 'Acme') = :'client_b'::uuid, 'chat relinked to B');
reset role;
select pg_temp.expect((select count(*) = 1 from public.telegram_links where telegram_chat_id = 777), 'chat linked once');
select pg_temp.expect((select client_id = :'client_b'::uuid from public.telegram_links), 'chat now belongs to B');
select pg_temp.expect((select preferred_channel = 'web' from public.clients where id = :'client_a'), 'A falls back to web');

-- Unlink and archive ----------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select public.unlink_telegram(:'client_b');
reset role;
select pg_temp.expect((select count(*) = 0 from public.telegram_links), 'unlinked');
select pg_temp.expect((select preferred_channel = 'web' from public.clients where id = :'client_b'), 'B back to web');

insert into public.telegram_links (client_id, telegram_chat_id) values (:'client_a', 999);
update public.clients set preferred_channel = 'telegram' where id = :'client_a';
insert into public.telegram_link_codes (code, client_id, expires_at) values ('late', :'client_a', now() + interval '30 minutes');
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select public.set_client_archived(:'client_a', true);
set role service_role;
select pg_temp.expect(public.redeem_telegram_link_code('late', 1, null, null) is null, 'archived: codes dead');
reset role;
select pg_temp.expect((select count(*) = 0 from public.telegram_links), 'archived: telegram disconnected');
select pg_temp.expect((select preferred_channel = 'web' from public.clients where id = :'client_a'), 'archived: back to web');

-- delivered_via can't be faked by the freelancer's browser
set role authenticated;
select set_config('request.jwt.claim.sub', :'f1', false);
select pg_temp.expect_error(
  format($$insert into public.messages (client_id, sender, body, delivered_via) values (%L, 'freelancer', 'x', 'telegram')$$, :'client_b'),
  'cannot fake delivery channel');
reset role;
