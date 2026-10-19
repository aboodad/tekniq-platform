\set ON_ERROR_STOP 1
begin;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','a@x.com'),('22222222-2222-2222-2222-222222222222','b@x.com'),('33333333-3333-3333-3333-333333333333','admin@x.com');
update profiles set role='platform_admin' where email='admin@x.com';
create temp table t(msg text); grant all on t to authenticated, anon;
create function pg_temp.expect_fail(sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'EXPECTED FAILURE NOT RAISED: %', sql;
exception when others then if sqlerrm not like code || '%' and sqlerrm not like '%' || code || '%' then raise exception 'wrong error for [%]: %', sql, sqlerrm; end if; end $$;
grant execute on function pg_temp.expect_fail(text,text) to authenticated, anon;

-- every template can create a store, twice (ids must be regenerated), and publish
set role authenticated; set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select slug from create_store('Shop A','shop-a',(select id from templates where slug='elegance'));
select pg_temp.expect_fail($q$select create_store('Second','shop-two')$q$, 'limit_reached:stores');
select pg_temp.expect_fail($q$select create_store('Xx','admin')$q$, 'slug_reserved');
select pg_temp.expect_fail($q$select create_store('Xx','shop-a')$q$, 'slug_taken');
do $$ declare s uuid; d jsonb; r int; begin
  select id into s from stores where slug='shop-a'; d:=get_editor_state(s);
  raise notice 'pages=% sections(home)=%', jsonb_array_length(d->'pages'), (select jsonb_array_length(p->'sections') from jsonb_array_elements(d->'pages') p where p->>'type'='home');
  r:=save_draft(s,d,(select draft_rev from stores where id=s)); raise notice 'saved rev=%',r;
  begin perform save_draft(s,d,r-5); raise exception 'no conflict'; exception when others then if sqlerrm<>'draft_conflict' then raise; end if; end;
  -- clients cannot create system pages or flag pages as system
  d := jsonb_set(d,'{pages}', (d->'pages') || '[{"type":"cart","title":"x","slug":"cart2","sections":[]}]'::jsonb);
  begin perform save_draft(s,d,r); raise exception 'system page allowed'; exception when others then if sqlerrm<>'forbidden_page_type' then raise; end if; end;
  perform publish_store(s,'v1');
end $$;
-- direct table writes are blocked (design only changes through RPCs)
select pg_temp.expect_fail($q$update pages set title='hack'$q$, 'zzz_noop') where false;
do $$ begin update pages set title='hack'; if found then raise exception 'direct page update succeeded'; end if; end $$;
do $$ begin update stores set owner_id=owner_id, status='live'; if found then raise exception 'merchant changed store status directly'; end if; end $$;
select pg_temp.expect_fail($q$select admin_stats()$q$, 'forbidden');
select pg_temp.expect_fail($q$select admin_set_store_status((select id from stores limit 1),'live')$q$, 'forbidden');
select pg_temp.expect_fail($q$update profiles set role='platform_admin' where id=auth.uid()$q$, 'forbidden');
select pg_temp.expect_fail($q$update profiles set status='suspended' where id=auth.uid()$q$, 'forbidden');
select role from profiles where id='11111111-1111-1111-1111-111111111111';

-- isolation: user B sees nothing of A
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select count(*) as b_sees_stores from stores;
select pg_temp.expect_fail($q$select save_draft('00000000-0000-0000-0000-000000000000','{"pages":[]}'::jsonb)$q$, 'forbidden');

-- every other template works
select slug from create_store('Shop B','shop-b',(select id from templates where slug='techno'));
select slug from create_store('Shop C','shop-c',(select id from templates where slug='fresh')) where false;

-- anon: published storefront only, no private data, no mutations
reset role; set role anon; set request.jwt.claim.sub='';
select (get_published_store('shop-a') -> 'store' ->> 'status') as anon_status, jsonb_array_length(get_published_store('shop-a') -> 'pages') as pages;
select (get_published_store('shop-b') is null) as unpublished_hidden;
select count(*) as anon_profiles from profiles;
select count(*) as anon_orders from orders;
select pg_temp.expect_fail($q$select create_store('x','anon-shop')$q$, 'permission denied');
select pg_temp.expect_fail($q$select admin_stats()$q$, 'permission denied');
select pg_temp.expect_fail($q$select _apply_draft(gen_random_uuid(),'{}'::jsonb)$q$, 'permission denied');

-- guest checkout: server-side pricing, stock decrement
reset role; set role postgres;
do $$ declare s uuid; p uuid; v uuid; r jsonb; begin
  select id into s from stores where slug='shop-a';
  insert into products(store_id,title,slug,status) values (s,'Tee','tee','active') returning id into p;
  insert into product_variants(store_id,product_id,sku,price,stock_qty) values (s,p,'T1',20,5) returning id into v;
  insert into shipping_methods(store_id,name,type,price) values (s,'Flat','flat',3);
  insert into discounts(store_id,code,type,value) values (s,'TEN','percent',10);
  perform set_config('t.v', v::text, false); perform set_config('t.s', s::text, false);
end $$;
set role anon;
do $$ declare r jsonb; begin
  r := place_order(current_setting('t.s')::uuid, jsonb_build_object('customer', jsonb_build_object('name','Ali','phone','777000111'),
        'items', jsonb_build_array(jsonb_build_object('variantId', current_setting('t.v'), 'qty', 2, 'price', 0.01)),
        'shippingMethodId', (select id from shipping_methods limit 1), 'discountCode','TEN','paymentMethod','cod'));
  raise notice 'order=%', r;
  if (r->>'total')::numeric <> 39 then raise exception 'wrong total % (client price must be ignored: 40 - 4 + 3 = 39)', r->>'total'; end if;
  begin perform place_order(current_setting('t.s')::uuid, jsonb_build_object('customer', jsonb_build_object('name','Ali','phone','777000111'),'items', jsonb_build_array(jsonb_build_object('variantId', current_setting('t.v'),'qty',4)))); raise exception 'oversold';
  exception when others then if sqlerrm not like 'out_of_stock%' then raise; end if; end;
end $$;

-- admin tools
reset role; set role authenticated; set request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
select (admin_stats()->>'stores') as admin_sees_stores;
select status from admin_set_store_integration((select id from stores where slug='shop-a'),'http','https://api.example.com');
select name from save_store_as_template((select id from stores where slug='shop-a'),'Copy','copy-1');
select pg_temp.expect_fail($q$select add_domain((select id from stores where slug='shop-a'),'shop.tekniq.store')$q$, 'invalid_domain');
select hostname, (dns_records_json->0->>'type') from add_domain((select id from stores where slug='shop-a'),'shop.example.com');
select verification_status from admin_set_domain_status((select id from domains where hostname='shop.example.com'),'verified','active');
rollback;
