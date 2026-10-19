\set ON_ERROR_STOP 1
begin;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','a@x.com'),('33333333-3333-3333-3333-333333333333','admin@x.com');
update profiles set role='platform_admin' where email='admin@x.com';
create function pg_temp.expect_fail(sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'EXPECTED FAILURE NOT RAISED: %', sql;
exception when others then if sqlerrm not like '%' || code || '%' then raise exception 'wrong error for [%]: %', sql, sqlerrm; end if; end $$;
grant execute on function pg_temp.expect_fail(text,text) to authenticated;
set role authenticated; set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select slug from create_store('Shop A','shop-a');
-- settings, versions, restore
select name from update_store_settings((select id from stores), '{"name":"Renamed","currency":"sar"}'::jsonb);
select publish_store((select id from stores),'one') ->> 'versionNo' as v1;
select publish_store((select id from stores),'two') ->> 'versionNo' as v2;
select count(*) as versions from list_store_versions((select id from stores));
select restore_store_version((select id from stores),(select id from store_versions where version_no=1),true) as restored_rev;
-- team: invite unknown email, then that user signs up and is auto-added
select invite_member((select id from stores),'newbie@x.com','editor') ->> 'status';
select pg_temp.expect_fail($q$select invite_member((select id from stores),'newbie2@x.com','viewer')$q$, 'limit_reached:seats');
reset role; insert into auth.users(id,email) values ('44444444-4444-4444-4444-444444444444','newbie@x.com');
select role from store_members where user_id='44444444-4444-4444-4444-444444444444';
set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
select count(*) as editor_sees from pages;
select pg_temp.expect_fail($q$select add_domain((select id from stores),'shop.example.com')$q$, 'forbidden');
select save_draft((select id from stores), get_editor_state((select id from stores)), (select draft_rev from stores)) as editor_saves;
-- editor (not owner) cannot see billing
select count(*) as editor_sees_subs from subscriptions;
-- tickets
insert into support_tickets(store_id,user_id,subject,body) values ((select id from stores),auth.uid(),'Help','body');
insert into ticket_messages(ticket_id,user_id,body) values ((select id from support_tickets),auth.uid(),'hi');
-- media: insert OK for own store folder, quota enforced, wrong folder rejected
insert into media_assets(store_id,type,file_name,storage_path,url,mime_type,size_bytes,uploaded_by) values ((select id from stores),'image','a.png',(select id from stores)||'/a.png','http://x/a.png','image/png',1000,auth.uid());
select pg_temp.expect_fail($q$insert into media_assets(store_id,type,file_name,storage_path,url,mime_type,size_bytes,uploaded_by) values ((select id from stores),'image','b.png','other/b.png','u','image/png',1,auth.uid())$q$, 'row-level security');
select pg_temp.expect_fail($q$insert into media_assets(store_id,type,file_name,storage_path,url,mime_type,size_bytes,uploaded_by) values ((select id from stores),'image','c.png',(select id from stores)||'/c.png','u','image/png',200000000,auth.uid())$q$, 'limit_reached:media_mb');
-- owner billing
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select status from change_plan((select id from stores),(select id from plans where code='pro'),'yearly');
select number, status, amount from invoices;
set request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
select admin_mark_invoice_paid((select id from invoices limit 1),'ref-1');
select s.status, s.billing_cycle from subscriptions s;
select staff.s as staff_count from (select count(*) s from templates) staff;
update templates set status='archived' where slug='fresh';
-- support role is read-only
reset role; update profiles set role='support' where email='admin@x.com'; set role authenticated;
select count(*) as support_sees_stores from stores;
select pg_temp.expect_fail($q$select save_draft((select id from stores), '{"pages":[]}'::jsonb)$q$, 'forbidden');
select pg_temp.expect_fail($q$select admin_set_store_status((select id from stores),'suspended')$q$, 'forbidden');
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select archive_store((select id from stores));
select pg_temp.expect_fail($q$select save_draft((select id from stores), get_editor_state((select id from stores)))$q$, 'store_locked');
rollback;
