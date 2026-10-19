-- Behavioural tests. Run against a DB with shim + migrations. Raises on failure.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u uuid, r text default 'authenticated') returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); execute format('set role %I', r); end $$;
create or replace function pg_temp.chk(c boolean, m text) returns void language plpgsql as $$ begin if c is not true then raise exception 'ASSERT FAILED: %', m; end if; end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub','',false); end $$;
create or replace function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm like code || '%' then return; end if;
    raise exception 'expected % but got: %', code, sqlerrm;
  end;
  raise exception 'expected error % but succeeded: %', code, q;
end $$;

-- fixtures
insert into plans(code,name,limits_json,price_monthly) values
 ('starter','Starter','{"stores":1,"custom_pages":2,"seats":2,"domains":1,"media_mb":1}',0),
 ('pro','Pro','{"stores":5,"custom_pages":50,"seats":10,"domains":5,"media_mb":500}',29);
insert into platform_settings values ('root_domain','"tekniq.store"',now()),('cname_target','"stores.tekniq.store"',now());
insert into component_types(key,kind,name_ar) values ('hero','section','هيرو'),('header','section','ترويسة'),('text','block','نص');
insert into templates(slug,name,status,layout_json) values ('blank','Blank','published', $j${
 "theme":{"colors":{"primary":"#000"}},"cardPresets":[],"menus":[{"handle":"main","title":"Main","items":[{"label":"Home","linkType":"page","linkRef":"home","children":[]}]}],
 "layout":{"announcement":[],"header":[{"type":"header","settings":{}}],"footer":[]},
 "pages":[
  {"type":"home","title":"Home","slug":"home","enabled":true,"system":true,"sections":[{"type":"hero","settings":{"a":1},"blocks":[{"type":"text","settings":{}}]}]},
  {"type":"collection","title":"C","slug":"collection","enabled":true,"system":true,"sections":[]},
  {"type":"product","title":"P","slug":"product","enabled":true,"system":true,"sections":[]},
  {"type":"cart","title":"Cart","slug":"cart","enabled":true,"system":true,"sections":[]},
  {"type":"checkout","title":"Co","slug":"checkout","enabled":true,"system":true,"sections":[]}]}$j$);
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','alice@x.com'),('00000000-0000-0000-0000-00000000000b','bob@x.com'),
 ('00000000-0000-0000-0000-0000000000ad','admin@x.com');
update profiles set role='platform_admin' where email='admin@x.com';

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select to_jsonb(create_store('Alice Shop','alice-shop')) as s \gset
select (:'s'::jsonb->>'id')::uuid as sid \gset
-- limit: second store on starter plan
select pg_temp.expect_err($$select create_store('Two','alice-two')$$,'limit_reached:stores');
select pg_temp.expect_err($$select create_store('Bad','www')$$,'slug_reserved');
select pg_temp.expect_err($$select create_store('Dup','alice-shop')$$,'slug_taken');

-- editor state roundtrip
select get_editor_state(:'sid') as d \gset
select pg_temp.chk(jsonb_array_length((:'d'::jsonb)->'pages')=5, 'pages');

-- bob cannot see or write alice's store
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.chk((select count(*) from stores)=0, 'bob sees stores');
select pg_temp.expect_err(format($$select save_draft(%L,%L::jsonb)$$, :'sid', :'d'),'forbidden');

-- alice: save draft, conflict, forged system page, publish
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select save_draft(:'sid', :'d'::jsonb, 1) as rev \gset
select pg_temp.chk(:rev = 2, 'rev bump');
select pg_temp.expect_err(format($$select save_draft(%L,%L::jsonb,1)$$, :'sid', :'d'),'draft_conflict');
select pg_temp.expect_err(format($$select save_draft(%L,%L::jsonb)$$, :'sid',
  jsonb_set((:'d')::jsonb,'{pages}',(:'d'::jsonb->'pages') || '[{"type":"home","title":"x","slug":"x2","sections":[]}]'::jsonb)::text),'forbidden_page_type');
-- direct table writes are blocked
do $$ declare n int; begin update pages set title='hack'; get diagnostics n = row_count; assert n=0, 'direct write allowed'; end $$;
select pg_temp.expect_err($$select _apply_draft(gen_random_uuid(),'{}'::jsonb)$$,'permission denied');

select publish_store(:'sid','v1') as pub \gset
select pg_temp.as_user(null,'anon');
select get_published_store('alice-shop') is not null as ok \gset
select pg_temp.chk(:'ok'::boolean, 'published store not visible to anon');
select pg_temp.chk((select count(*) from stores)=0, 'anon reads stores');
select pg_temp.chk((select count(*) from orders)=0, 'anon reads orders');

-- catalog + order (as admin fixtures)
select pg_temp.reset();
insert into products(id,store_id,title,slug,status) values ('00000000-0000-0000-0000-0000000000f1',:'sid','Shirt','shirt','active');
insert into product_variants(id,store_id,product_id,price,stock_qty) values ('00000000-0000-0000-0000-0000000000f2',:'sid','00000000-0000-0000-0000-0000000000f1',10,5);
select pg_temp.as_user(null,'anon');
select place_order(:'sid', '{"customer":{"name":"Ali","phone":"777123"},"items":[{"variantId":"00000000-0000-0000-0000-0000000000f2","qty":2,"price":0.01}]}') as o \gset
select pg_temp.chk((:'o'::jsonb->>'total')::numeric = 20, 'client price trusted?');
select pg_temp.expect_err(format($$select place_order(%L,%L::jsonb)$$, :'sid','{"customer":{"name":"Ali","phone":"777123"},"items":[{"variantId":"00000000-0000-0000-0000-0000000000f2","qty":4}]}'),'out_of_stock');
select pg_temp.reset();
select pg_temp.chk((select stock_qty from product_variants)=3, 'stock');

-- alice sees the order, bob does not
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.chk((select count(*) from orders)=1, '(select count(*) from orders)=1');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.chk((select count(*) from orders)=0, '(select count(*) from orders)=0');

-- privilege escalation attempts
select pg_temp.expect_err($$update profiles set role='platform_admin' where id='00000000-0000-0000-0000-00000000000b'$$,'forbidden');
select pg_temp.expect_err($$select admin_stats()$$,'forbidden');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select pg_temp.chk((admin_stats()->>'stores')::int=1, '(admin_stats()->>stores)::int=1');
select pg_temp.reset();
\echo ALL TESTS PASSED
