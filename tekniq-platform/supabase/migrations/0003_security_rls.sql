-- =====================================================================
-- Tekniq Platform — 0003: access helpers + Row Level Security
--
-- Model
--   platform_admin : full access to everything
--   support        : read access to every store (viewer level) + tickets
--   merchant       : only the stores they are a member of
--       store_members.role  owner  > editor > viewer
--   anon           : only published storefront data (see store_is_public)
--
-- Writes to design tables (pages, sections, blocks, themes, menus, presets)
-- only happen through the RPCs in 0004 (save_draft, publish_store ...), so
-- those tables have SELECT policies only (plus the admin_all policy).
-- =====================================================================

-- ---------- helpers ---------------------------------------------------
create or replace function public.current_user_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'active' and role in ('platform_admin', 'support'))
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'active' and role = 'platform_admin')
$$;

-- true when the caller has at least p_min access to the store
create or replace function public.has_store_role(p_store uuid, p_min public.store_role) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when public.is_staff() then p_min = 'viewer'
    when not public.current_user_active() then false
    else coalesce((
      select (case m.role when 'owner' then 3 when 'editor' then 2 else 1 end)
           >= (case p_min when 'owner' then 3 when 'editor' then 2 else 1 end)
      from public.store_members m
      where m.store_id = p_store and m.user_id = auth.uid()
    ), false)
  end
$$;

-- a store whose published storefront may be read by anyone
create or replace function public.store_is_public(p_store uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stores s
    where s.id = p_store
      and s.published_version_id is not null
      and s.status in ('ready_for_integration', 'live')
      and s.deleted_at is null
  )
$$;

-- ---------- profile guard --------------------------------------------
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role
      or new.status is distinct from old.status
      or lower(new.email) is distinct from lower(old.email)) and not public.is_admin() then
    -- allow the auth trigger / service role (no auth.uid()) to sync email
    if auth.uid() is not null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard_trg before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- enable RLS on every table --------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------- admin: everything ----------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t.tablename);
  end loop;
end $$;

-- ---------- reference data -------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- store teammates can see each other's name/email
create policy profiles_select_teammates on public.profiles for select to authenticated
  using (exists (
    select 1 from public.store_members a
    join public.store_members b on b.store_id = a.store_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));

create policy plans_select on public.plans for select to anon, authenticated
  using (is_active or public.is_staff());
create policy platform_settings_select on public.platform_settings for select to anon, authenticated
  using (true);
create policy templates_select on public.templates for select to authenticated
  using (status = 'published' or public.is_staff());
create policy component_types_select on public.component_types for select to authenticated using (true);
create policy data_sources_select on public.data_sources for select to authenticated using (public.is_staff());

-- ---------- stores & membership --------------------------------------
create policy stores_select on public.stores for select to authenticated
  using (public.has_store_role(id, 'viewer'));
create policy store_members_select on public.store_members for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy store_invites_select on public.store_invites for select to authenticated
  using (public.has_store_role(store_id, 'owner') or public.is_staff());

-- ---------- billing (owner only) --------------------------------------
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.has_store_role(store_id, 'owner') or public.is_staff());
create policy invoices_select on public.invoices for select to authenticated
  using (public.has_store_role(store_id, 'owner') or public.is_staff());

-- ---------- design (read only; writes go through RPCs) ----------------
create policy domains_select on public.domains for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy themes_select on public.themes for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy pages_select on public.pages for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy sections_select on public.sections for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy blocks_select on public.blocks for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy menus_select on public.navigation_menus for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy menu_items_select on public.menu_items for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy card_presets_select on public.card_presets for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy store_versions_select on public.store_versions for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy translations_select on public.translations for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy translations_write on public.translations for all to authenticated
  using (public.has_store_role(store_id, 'editor')) with check (public.has_store_role(store_id, 'editor'));

-- ---------- media -----------------------------------------------------
create policy media_select on public.media_assets for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy media_insert on public.media_assets for insert to authenticated
  with check (public.has_store_role(store_id, 'editor')
              and uploaded_by = auth.uid()
              and storage_path like store_id::text || '/%');
create policy media_update on public.media_assets for update to authenticated
  using (public.has_store_role(store_id, 'editor')) with check (public.has_store_role(store_id, 'editor'));
create policy media_delete on public.media_assets for delete to authenticated
  using (public.has_store_role(store_id, 'editor'));

-- ---------- integrations (secrets: staff only) ------------------------
create policy store_integrations_select on public.store_integrations for select to authenticated
  using (public.is_staff());

-- ---------- audit / support -------------------------------------------
create policy activity_select on public.activity_logs for select to authenticated
  using ((store_id is not null and public.has_store_role(store_id, 'owner')) or public.is_staff());

create policy tickets_select on public.support_tickets for select to authenticated
  using (public.has_store_role(store_id, 'viewer'));
create policy tickets_insert on public.support_tickets for insert to authenticated
  with check (public.has_store_role(store_id, 'editor') and user_id = auth.uid());
create policy tickets_staff_update on public.support_tickets for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy ticket_messages_select on public.ticket_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t
                 where t.id = ticket_id and public.has_store_role(t.store_id, 'viewer')));
create policy ticket_messages_insert on public.ticket_messages for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.support_tickets t
                          where t.id = ticket_id
                            and (public.has_store_role(t.store_id, 'editor') or public.is_staff())));

-- ---------- commerce: public catalog + merchant management -----------
-- Public (anon) can read the catalog of any published store.
create policy collections_public on public.collections for select to anon, authenticated
  using ((is_published and public.store_is_public(store_id)) or public.has_store_role(store_id, 'viewer'));
create policy products_public on public.products for select to anon, authenticated
  using ((status = 'active' and public.store_is_public(store_id)) or public.has_store_role(store_id, 'viewer'));
create policy variants_public on public.product_variants for select to anon, authenticated
  using ((public.store_is_public(store_id)
          and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'))
         or public.has_store_role(store_id, 'viewer'));
create policy images_public on public.product_images for select to anon, authenticated
  using ((public.store_is_public(store_id)
          and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'))
         or public.has_store_role(store_id, 'viewer'));
create policy collection_products_public on public.collection_products for select to anon, authenticated
  using (public.store_is_public(store_id) or public.has_store_role(store_id, 'viewer'));
create policy shipping_public on public.shipping_methods for select to anon, authenticated
  using ((is_active and public.store_is_public(store_id)) or public.has_store_role(store_id, 'viewer'));
create policy reviews_public on public.reviews for select to anon, authenticated
  using ((status = 'approved' and public.store_is_public(store_id)) or public.has_store_role(store_id, 'viewer'));
create policy blog_public on public.blog_posts for select to anon, authenticated
  using ((status = 'published' and public.store_is_public(store_id)) or public.has_store_role(store_id, 'viewer'));

-- Merchants (editor+) manage catalog content.
do $$
declare t text;
begin
  foreach t in array array['collections','products','product_variants','product_images','collection_products',
                           'shipping_methods','discounts','blog_posts','reviews'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_store_role(store_id, ''editor'')) with check (public.has_store_role(store_id, ''editor''))',
      t || '_manage', t);
  end loop;
end $$;

-- Discount rows are private (codes are validated through validate_discount()).
create policy discounts_select on public.discounts for select to authenticated
  using (public.has_store_role(store_id, 'editor'));

-- Orders & customer data: editor+ only, no direct inserts (orders come from place_order()).
do $$
declare t text;
begin
  foreach t in array array['customers','addresses','carts','cart_items','orders','order_items','payments','wishlist_items'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_store_role(store_id, ''editor''))',
      t || '_select', t);
  end loop;
end $$;
create policy orders_update on public.orders for update to authenticated
  using (public.has_store_role(store_id, 'editor')) with check (public.has_store_role(store_id, 'editor'));
