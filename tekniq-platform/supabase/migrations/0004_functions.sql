-- =====================================================================
-- Tekniq Platform — 0004: RPC functions and triggers
--
-- Error contract: every failure raises an exception whose MESSAGE is a
-- stable code (not_authenticated, forbidden, slug_taken, draft_conflict,
-- limit_reached:<key> ...). The web app maps these codes to Arabic text.
-- Functions whose name starts with "_" are internal (not callable by clients).
-- =====================================================================

-- ---------- internal: audit ------------------------------------------
create or replace function public._log(p_store uuid, p_action text, p_type text default null,
                                       p_entity text default null, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_logs (store_id, user_id, action, entity_type, entity_id, meta_json)
  values (p_store, auth.uid(), p_action, p_type, p_entity, coalesce(p_meta, '{}'::jsonb))
$$;

create or replace function public._plan_limit(p_store uuid, p_key text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((p.limits_json ->> p_key)::int, 2147483647)
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.store_id = p_store
$$;

-- ---------- internal: JSON builders ----------------------------------
create or replace function public._menu_tree(p_menu uuid, p_parent uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'label', i.label, 'linkType', i.link_type, 'linkRef', i.link_ref,
           'newTab', i.open_in_new_tab, 'children', public._menu_tree(p_menu, i.id)
         ) order by i.position), '[]'::jsonb)
  from public.menu_items i
  where i.menu_id = p_menu and i.parent_id is not distinct from p_parent
$$;

create or replace function public._sections_json(p_store uuid, p_page uuid, p_region public.section_region) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'type', s.type_key, 'visible', s.is_visible, 'settings', s.settings_json,
           'dataSource', s.data_source_key,
           'blocks', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', b.id, 'type', b.type_key, 'visible', b.is_visible, 'settings', b.settings_json
                       ) order by b.position)
                       from public.blocks b where b.section_id = s.id), '[]'::jsonb)
         ) order by s.position), '[]'::jsonb)
  from public.sections s
  where s.store_id = p_store and s.region = p_region and s.page_id is not distinct from p_page
$$;

-- The whole editable design of a store, as one JSON document ("Draft").
create or replace function public.get_editor_state(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_store_role(p_store, 'viewer') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'theme', coalesce((select t.tokens_json from public.themes t where t.store_id = p_store and t.is_active limit 1), '{}'::jsonb),
    'cardPresets', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', c.id, 'kind', c.kind, 'name', c.name, 'settings', c.settings_json, 'isDefault', c.is_default
                    ) order by c.created_at, c.id) from public.card_presets c where c.store_id = p_store), '[]'::jsonb),
    'menus', coalesce((select jsonb_agg(jsonb_build_object(
                      'handle', m.handle, 'title', m.title, 'items', public._menu_tree(m.id, null)
                    ) order by m.handle) from public.navigation_menus m where m.store_id = p_store), '[]'::jsonb),
    'layout', jsonb_build_object(
      'announcement', public._sections_json(p_store, null, 'announcement'),
      'header',       public._sections_json(p_store, null, 'header'),
      'footer',       public._sections_json(p_store, null, 'footer')),
    'pages', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', p.id, 'type', p.type, 'title', p.title, 'slug', p.slug,
                      'enabled', p.is_enabled, 'system', p.is_system,
                      'seo', jsonb_build_object('title', p.seo_title, 'description', p.seo_description, 'og', p.og_image),
                      'sections', public._sections_json(p_store, p.id, 'content')
                    ) order by p.position, p.created_at) from public.pages p where p.store_id = p_store), '[]'::jsonb)
  );
end $$;

-- ---------- internal: writing a Draft --------------------------------
create or replace function public._insert_menu_items(p_store uuid, p_menu uuid, p_items jsonb, p_parent uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_id uuid;
begin
  for r in select e, n from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, n) loop
    insert into public.menu_items (store_id, menu_id, parent_id, label, link_type, link_ref, position, open_in_new_tab)
    values (p_store, p_menu, p_parent, coalesce(r.e ->> 'label', ''),
            coalesce(nullif(r.e ->> 'linkType', ''), 'page'), coalesce(r.e ->> 'linkRef', ''),
            r.n::int, coalesce((r.e ->> 'newTab')::boolean, false))
    returning id into v_id;
    perform public._insert_menu_items(p_store, p_menu, r.e -> 'children', v_id);
  end loop;
end $$;

create or replace function public._insert_sections(p_store uuid, p_page uuid, p_region text, p_list jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r record; b record; v_sid uuid;
begin
  for r in select e, n from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) with ordinality as t(e, n) loop
    insert into public.sections (id, store_id, page_id, region, type_key, position, is_visible, settings_json, data_source_key)
    values (coalesce(nullif(r.e ->> 'id', '')::uuid, gen_random_uuid()), p_store, p_page, p_region::public.section_region,
            r.e ->> 'type', r.n::int, coalesce((r.e ->> 'visible')::boolean, true),
            coalesce(r.e -> 'settings', '{}'::jsonb), nullif(r.e ->> 'dataSource', ''))
    returning id into v_sid;
    for b in select e, n from jsonb_array_elements(coalesce(r.e -> 'blocks', '[]'::jsonb)) with ordinality as t(e, n) loop
      insert into public.blocks (id, store_id, section_id, type_key, position, is_visible, settings_json)
      values (coalesce(nullif(b.e ->> 'id', '')::uuid, gen_random_uuid()), p_store, v_sid, b.e ->> 'type',
              b.n::int, coalesce((b.e ->> 'visible')::boolean, true), coalesce(b.e -> 'settings', '{}'::jsonb));
    end loop;
  end loop;
end $$;

-- p_trusted = true only from create_store / restore / admin tools: lets the
-- document create system pages. Client saves (save_draft) can only create custom pages.
create or replace function public._apply_draft(p_store uuid, p_draft jsonb, p_trusted boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record; mn record; v_menu uuid; v_pid uuid; v_type public.page_type;
  v_keep uuid[] := '{}';
begin
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or jsonb_typeof(p_draft -> 'pages') <> 'array' then
    raise exception 'invalid_draft';
  end if;

  -- theme
  update public.themes set tokens_json = coalesce(p_draft -> 'theme', '{}'::jsonb), updated_at = now()
  where store_id = p_store and is_active;
  if not found then
    insert into public.themes (store_id, tokens_json) values (p_store, coalesce(p_draft -> 'theme', '{}'::jsonb));
  end if;

  -- card presets (replace all)
  delete from public.card_presets where store_id = p_store;
  insert into public.card_presets (id, store_id, kind, name, settings_json, is_default)
  select coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid()), p_store, (e ->> 'kind')::public.card_kind,
         coalesce(e ->> 'name', 'نمط'), coalesce(e -> 'settings', '{}'::jsonb), coalesce((e ->> 'isDefault')::boolean, false)
  from jsonb_array_elements(coalesce(p_draft -> 'cardPresets', '[]'::jsonb)) e;

  -- menus (replace all)
  delete from public.navigation_menus where store_id = p_store;
  for mn in select e from jsonb_array_elements(coalesce(p_draft -> 'menus', '[]'::jsonb)) as t(e) loop
    insert into public.navigation_menus (store_id, handle, title)
    values (p_store, mn.e ->> 'handle', coalesce(mn.e ->> 'title', mn.e ->> 'handle'))
    returning id into v_menu;
    perform public._insert_menu_items(p_store, v_menu, mn.e -> 'items', null);
  end loop;

  -- pages + their sections
  for r in select e, n from jsonb_array_elements(p_draft -> 'pages') with ordinality as t(e, n) loop
    v_pid  := coalesce(nullif(r.e ->> 'id', '')::uuid, gen_random_uuid());
    v_type := (r.e ->> 'type')::public.page_type;

    if not p_trusted and v_type <> 'custom'
       and not exists (select 1 from public.pages where id = v_pid and store_id = p_store) then
      raise exception 'forbidden_page_type';
    end if;

    insert into public.pages (id, store_id, type, title, slug, is_enabled, is_system, seo_title, seo_description, og_image, position)
    values (v_pid, p_store, v_type, coalesce(nullif(r.e ->> 'title', ''), 'صفحة'),
            coalesce(nullif(r.e ->> 'slug', ''), v_type::text),
            coalesce((r.e ->> 'enabled')::boolean, true),
            case when p_trusted then coalesce((r.e ->> 'system')::boolean, false) else false end,
            r.e #>> '{seo,title}', r.e #>> '{seo,description}', r.e #>> '{seo,og}', r.n::int)
    on conflict (id) do update set
      title = excluded.title,
      slug = case when public.pages.is_system then public.pages.slug else excluded.slug end,
      is_enabled = excluded.is_enabled,
      seo_title = excluded.seo_title, seo_description = excluded.seo_description, og_image = excluded.og_image,
      position = excluded.position
    where public.pages.store_id = excluded.store_id;
    if not found then raise exception 'id_conflict'; end if;

    delete from public.sections where page_id = v_pid;
    perform public._insert_sections(p_store, v_pid, 'content', r.e -> 'sections');
    v_keep := v_keep || v_pid;
  end loop;
  delete from public.pages where store_id = p_store and not is_system and not (id = any (v_keep));

  -- global sections
  delete from public.sections where store_id = p_store and page_id is null;
  perform public._insert_sections(p_store, null, 'announcement', p_draft #> '{layout,announcement}');
  perform public._insert_sections(p_store, null, 'header',       p_draft #> '{layout,header}');
  perform public._insert_sections(p_store, null, 'footer',       p_draft #> '{layout,footer}');
end $$;

create or replace function public._strip_ids(j jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; r jsonb;
begin
  if jsonb_typeof(j) = 'object' then
    r := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      if k = 'id' then continue; end if;
      if k = 'settings' then r := r || jsonb_build_object(k, v);        -- settings are kept verbatim
      else r := r || jsonb_build_object(k, public._strip_ids(v)); end if;
    end loop;
    return r;
  elsif jsonb_typeof(j) = 'array' then
    return coalesce((select jsonb_agg(public._strip_ids(e) order by n) from jsonb_array_elements(j) with ordinality as t(e, n)), '[]'::jsonb);
  end if;
  return j;
end $$;

-- ---------- auth triggers --------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email,
          nullif(new.raw_user_meta_data ->> 'full_name', ''),
          nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;

  -- accept pending team invitations sent to this email
  insert into public.store_members (store_id, user_id, role, invited_by)
  select i.store_id, new.id, i.role, i.invited_by from public.store_invites i where lower(i.email) = lower(new.email)
  on conflict do nothing;
  delete from public.store_invites where lower(email) = lower(new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_login() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_login_at = now() where id = auth.uid()
$$;

-- ---------- stores ----------------------------------------------------
create or replace function public.create_store(
  p_name text, p_slug text, p_template_id uuid default null,
  p_locale text default 'ar', p_currency text default 'USD', p_direction text default 'rtl')
returns public.stores language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_tpl public.templates;
  v_store public.stores;
  v_plan public.plans;
  v_root text;
  v_max int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.current_user_active() then raise exception 'account_inactive' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'invalid_slug'; end if;
  if v_slug = any (array['www','app','admin','api','mail','static','assets','cdn','dashboard','login','signup','support','help','status','blog','docs','shop','store','stores','s','preview','demo','tekniq','platform','cname'])
    then raise exception 'slug_reserved'; end if;
  if exists (select 1 from public.stores where slug = v_slug) then raise exception 'slug_taken' using errcode = '23505'; end if;

  select coalesce(max((p.limits_json ->> 'stores')::int),
                  (select (limits_json ->> 'stores')::int from public.plans where code = 'starter'), 1)
    into v_max
  from public.stores s join public.subscriptions sub on sub.store_id = s.id join public.plans p on p.id = sub.plan_id
  where s.owner_id = v_uid and s.status <> 'archived';
  if (select count(*) from public.stores where owner_id = v_uid and status <> 'archived') >= greatest(coalesce(v_max, 1), 1)
     and not public.is_admin() then
    raise exception 'limit_reached:stores';
  end if;

  select * into v_tpl from public.templates
   where status = 'published' and id = coalesce(p_template_id, (select id from public.templates where slug = 'blank'));
  if not found then raise exception 'template_not_found'; end if;
  select * into v_plan from public.plans where code = 'starter';

  insert into public.stores (owner_id, template_id, name, slug, default_locale, direction, currency)
  values (v_uid, v_tpl.id, trim(p_name), v_slug, coalesce(p_locale, 'ar'),
          case when p_direction = 'ltr' then 'ltr' else 'rtl' end, upper(coalesce(p_currency, 'USD')))
  returning * into v_store;

  insert into public.store_members (store_id, user_id, role) values (v_store.id, v_uid, 'owner');
  insert into public.subscriptions (store_id, plan_id, status, trial_ends_at, current_period_end)
  values (v_store.id, v_plan.id, 'trialing', now() + interval '14 days', now() + interval '14 days');

  select coalesce(value #>> '{}', 'tekniq.store') into v_root from public.platform_settings where key = 'root_domain';
  insert into public.domains (store_id, hostname, type, is_primary, verification_status, ssl_status, verified_at)
  values (v_store.id, v_slug || '.' || coalesce(v_root, 'tekniq.store'), 'subdomain', true, 'verified', 'active', now());

  perform public._apply_draft(v_store.id, v_tpl.layout_json, true);
  perform public._log(v_store.id, 'store.create', 'store', v_store.id::text, jsonb_build_object('template', v_tpl.slug));
  return v_store;
end $$;

create or replace function public.update_store_settings(p_store uuid, p_patch jsonb)
returns public.stores language plpgsql security definer set search_path = public as $$
declare v public.stores;
begin
  if not public.has_store_role(p_store, 'editor') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.stores set
    name           = coalesce(nullif(trim(p_patch ->> 'name'), ''), name),
    default_locale = coalesce(nullif(p_patch ->> 'default_locale', ''), default_locale),
    direction      = coalesce(nullif(p_patch ->> 'direction', ''), direction),
    currency       = coalesce(upper(nullif(p_patch ->> 'currency', '')), currency),
    timezone       = coalesce(nullif(p_patch ->> 'timezone', ''), timezone),
    logo_url       = case when p_patch ? 'logo_url' then nullif(p_patch ->> 'logo_url', '') else logo_url end,
    favicon_url    = case when p_patch ? 'favicon_url' then nullif(p_patch ->> 'favicon_url', '') else favicon_url end
  where id = p_store and status <> 'archived'
  returning * into v;
  if not found then raise exception 'not_found'; end if;
  perform public._log(p_store, 'store.settings', 'store', p_store::text, p_patch);
  return v;
end $$;

create or replace function public.archive_store(p_store uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_store_role(p_store, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.stores set status = 'archived', deleted_at = now() where id = p_store;
  perform public._log(p_store, 'store.archive', 'store', p_store::text);
end $$;

-- ---------- draft / publish / versions -------------------------------
create or replace function public.save_draft(p_store uuid, p_draft jsonb, p_base_rev int default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_rev int; v_status public.store_status; v_custom int;
begin
  if not public.has_store_role(p_store, 'editor') then raise exception 'forbidden' using errcode = '42501'; end if;
  select draft_rev, status into v_rev, v_status from public.stores where id = p_store for update;
  if not found then raise exception 'not_found'; end if;
  if v_status in ('suspended', 'archived') then raise exception 'store_locked'; end if;
  if p_base_rev is not null and p_base_rev <> v_rev then raise exception 'draft_conflict'; end if;
  if pg_column_size(p_draft) > 4000000 then raise exception 'draft_too_large'; end if;

  select count(*) into v_custom from jsonb_array_elements(coalesce(p_draft -> 'pages', '[]'::jsonb)) e where e ->> 'type' = 'custom';
  if v_custom > public._plan_limit(p_store, 'custom_pages') then raise exception 'limit_reached:custom_pages'; end if;

  perform public._apply_draft(p_store, p_draft, false);
  update public.stores set draft_rev = draft_rev + 1 where id = p_store returning draft_rev into v_rev;
  return v_rev;
end $$;

create or replace function public.publish_store(p_store uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_store public.stores; v_no int; v_id uuid; v_snap jsonb; v_missing text;
begin
  if not public.has_store_role(p_store, 'editor') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_store from public.stores where id = p_store for update;
  if not found then raise exception 'not_found'; end if;
  if v_store.status in ('suspended', 'archived') then raise exception 'store_locked'; end if;

  -- readiness check: the system pages that make a store work must exist
  select string_agg(t, ',') into v_missing
  from unnest(array['home','collection','product','cart','checkout']) t
  where not exists (select 1 from public.pages p where p.store_id = p_store and p.type::text = t and p.is_enabled);
  if v_missing is not null then raise exception 'not_ready:%', v_missing; end if;

  v_no := coalesce((select max(version_no) from public.store_versions where store_id = p_store), 0) + 1;
  v_snap := public.get_editor_state(p_store) || jsonb_build_object(
    'version', v_no,
    'store', jsonb_build_object(
      'id', v_store.id, 'name', v_store.name, 'slug', v_store.slug, 'locale', v_store.default_locale,
      'direction', v_store.direction, 'currency', v_store.currency, 'timezone', v_store.timezone,
      'dataMode', v_store.data_mode, 'dataApiUrl', v_store.data_api_url,
      'logoUrl', v_store.logo_url, 'faviconUrl', v_store.favicon_url));

  update public.store_versions set status = 'archived' where store_id = p_store and status = 'published';
  insert into public.store_versions (store_id, version_no, status, snapshot_json, note, created_by, published_by, published_at)
  values (p_store, v_no, 'published', v_snap, p_note, auth.uid(), auth.uid(), now())
  returning id into v_id;

  update public.stores set
    published_version_id = v_id,
    published_at = now(),
    status = case when status = 'draft'
                  then (case when data_mode = 'mock' then 'ready_for_integration' else 'live' end)::public.store_status
                  else status end
  where id = p_store;

  delete from public.store_versions where store_id = p_store and version_no <= v_no - 30;
  perform public._log(p_store, 'store.publish', 'store_version', v_id::text, jsonb_build_object('version', v_no));
  return jsonb_build_object('id', v_id, 'versionNo', v_no);
end $$;

create or replace function public.list_store_versions(p_store uuid)
returns table (id uuid, version_no int, status public.version_status, note text, author text, published_at timestamptz, is_current boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_store_role(p_store, 'viewer') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select v.id, v.version_no, v.status, v.note, coalesce(pr.full_name, pr.email), v.published_at, (v.id = s.published_version_id)
    from public.store_versions v
    join public.stores s on s.id = v.store_id
    left join public.profiles pr on pr.id = v.published_by
    where v.store_id = p_store
    order by v.version_no desc;
end $$;

create or replace function public.restore_store_version(p_store uuid, p_version uuid, p_publish boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare v_snap jsonb; v_no int; v_rev int;
begin
  if not public.has_store_role(p_store, 'editor') then raise exception 'forbidden' using errcode = '42501'; end if;
  select snapshot_json, version_no into v_snap, v_no from public.store_versions where id = p_version and store_id = p_store;
  if not found then raise exception 'not_found'; end if;
  perform 1 from public.stores where id = p_store and status not in ('suspended', 'archived') for update;
  if not found then raise exception 'store_locked'; end if;

  perform public._apply_draft(p_store, v_snap, true);
  update public.stores set draft_rev = draft_rev + 1 where id = p_store returning draft_rev into v_rev;
  perform public._log(p_store, 'store.restore', 'store_version', p_version::text, jsonb_build_object('version', v_no));
  if p_publish then perform public.publish_store(p_store, 'استرجاع النسخة ' || v_no); end if;
  return v_rev;
end $$;

-- Public entry point used by every storefront (anon).
create or replace function public.get_published_store(p_slug text default null, p_host text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.stores; v_snap jsonb;
begin
  if p_host is not null and length(p_host) > 0 then
    select s.* into v from public.stores s join public.domains d on d.store_id = s.id
    where lower(d.hostname) = lower(p_host) and d.verification_status = 'verified';
  end if;
  if v.id is null and p_slug is not null and length(p_slug) > 0 then
    select * into v from public.stores where slug = lower(p_slug);
  end if;
  if v.id is null or v.published_version_id is null or v.deleted_at is not null
     or v.status not in ('ready_for_integration', 'live') then
    return null;
  end if;
  select snapshot_json into v_snap from public.store_versions where id = v.published_version_id;
  return v_snap || jsonb_build_object('store',
    coalesce(v_snap -> 'store', '{}'::jsonb) || jsonb_build_object(
      'status', v.status, 'dataMode', v.data_mode, 'dataApiUrl', v.data_api_url));
end $$;

-- ---------- domains ---------------------------------------------------
create or replace function public.add_domain(p_store uuid, p_hostname text)
returns public.domains language plpgsql security definer set search_path = public as $$
declare
  v_host text := lower(trim(coalesce(p_hostname, '')));
  v_root text; v_cname text; v_dom public.domains; v_count int;
begin
  if not public.has_store_role(p_store, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' then raise exception 'invalid_domain'; end if;
  select coalesce(value #>> '{}', 'tekniq.store') into v_root from public.platform_settings where key = 'root_domain';
  select coalesce(value #>> '{}', 'stores.tekniq.store') into v_cname from public.platform_settings where key = 'cname_target';
  v_root := coalesce(v_root, 'tekniq.store'); v_cname := coalesce(v_cname, 'stores.tekniq.store');
  if v_host = v_root or v_host like '%.' || v_root then raise exception 'invalid_domain'; end if;
  if exists (select 1 from public.domains where lower(hostname) = v_host) then raise exception 'domain_taken' using errcode = '23505'; end if;
  select count(*) into v_count from public.domains where store_id = p_store and type = 'custom';
  if v_count >= public._plan_limit(p_store, 'domains') then raise exception 'limit_reached:domains'; end if;

  insert into public.domains (store_id, hostname, type) values (p_store, v_host, 'custom') returning * into v_dom;
  update public.domains set dns_records_json = jsonb_build_array(
      jsonb_build_object('type', 'CNAME', 'name', v_host, 'value', v_cname),
      jsonb_build_object('type', 'TXT', 'name', '_tekniq.' || v_host, 'value', 'tekniq-verify=' || v_dom.verification_token))
  where id = v_dom.id returning * into v_dom;
  perform public._log(p_store, 'domain.add', 'domain', v_dom.id::text, jsonb_build_object('hostname', v_host));
  return v_dom;
end $$;

create or replace function public.remove_domain(p_domain uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.domains;
begin
  select * into v from public.domains where id = p_domain;
  if not found then raise exception 'not_found'; end if;
  if not public.has_store_role(v.store_id, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v.type = 'subdomain' then raise exception 'cannot_remove_subdomain'; end if;
  delete from public.domains where id = p_domain;
  -- make sure a primary domain always exists
  if v.is_primary then
    update public.domains set is_primary = true
    where id = (select id from public.domains where store_id = v.store_id and type = 'subdomain' limit 1);
  end if;
  perform public._log(v.store_id, 'domain.remove', 'domain', p_domain::text, jsonb_build_object('hostname', v.hostname));
end $$;

create or replace function public.set_primary_domain(p_domain uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.domains;
begin
  select * into v from public.domains where id = p_domain;
  if not found then raise exception 'not_found'; end if;
  if not public.has_store_role(v.store_id, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v.verification_status <> 'verified' then raise exception 'domain_not_verified'; end if;
  update public.domains set is_primary = false where store_id = v.store_id and is_primary;
  update public.domains set is_primary = true where id = p_domain;
  perform public._log(v.store_id, 'domain.primary', 'domain', p_domain::text, jsonb_build_object('hostname', v.hostname));
end $$;

-- DNS cannot be checked from SQL: verification runs in the verify-domain Edge
-- Function (service role) or manually from the admin console through this RPC.
create or replace function public.admin_set_domain_status(p_domain uuid, p_verification public.verify_status, p_ssl public.ssl_status)
returns public.domains language plpgsql security definer set search_path = public as $$
declare v public.domains;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.domains set verification_status = p_verification, ssl_status = p_ssl,
         verified_at = case when p_verification = 'verified' then coalesce(verified_at, now()) else null end
  where id = p_domain returning * into v;
  if not found then raise exception 'not_found'; end if;
  perform public._log(v.store_id, 'domain.status', 'domain', p_domain::text, jsonb_build_object('verification', p_verification, 'ssl', p_ssl));
  return v;
end $$;

-- ---------- team ------------------------------------------------------
create or replace function public.list_store_members(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_store_role(p_store, 'viewer') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'userId', m.user_id, 'email', p.email, 'name', p.full_name, 'role', m.role, 'joinedAt', m.created_at
      ) order by (m.role = 'owner') desc, m.created_at)
      from public.store_members m join public.profiles p on p.id = m.user_id where m.store_id = p_store), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'role', i.role, 'createdAt', i.created_at) order by i.created_at)
      from public.store_invites i where i.store_id = p_store), '[]'::jsonb));
end $$;

create or replace function public.invite_member(p_store uuid, p_email text, p_role public.store_role)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_user uuid; v_seats int; v_used int;
begin
  if not public.has_store_role(p_store, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if p_role = 'owner' then raise exception 'invalid_role'; end if;
  v_seats := public._plan_limit(p_store, 'seats');
  select (select count(*) from public.store_members where store_id = p_store)
       + (select count(*) from public.store_invites where store_id = p_store) into v_used;
  if v_used >= v_seats then raise exception 'limit_reached:seats'; end if;

  select id into v_user from public.profiles where lower(email) = v_email;
  if v_user is not null then
    insert into public.store_members (store_id, user_id, role, invited_by) values (p_store, v_user, p_role, auth.uid())
    on conflict (store_id, user_id) do update set role = excluded.role where public.store_members.role <> 'owner';
    perform public._log(p_store, 'member.add', 'user', v_user::text, jsonb_build_object('role', p_role));
    return jsonb_build_object('status', 'added');
  end if;
  insert into public.store_invites (store_id, email, role, invited_by) values (p_store, v_email, p_role, auth.uid())
  on conflict (store_id, email) do update set role = excluded.role;
  perform public._log(p_store, 'member.invite', 'email', v_email, jsonb_build_object('role', p_role));
  return jsonb_build_object('status', 'invited');
end $$;

create or replace function public.update_member_role(p_store uuid, p_user uuid, p_role public.store_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_store_role(p_store, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'owner' then raise exception 'invalid_role'; end if;
  update public.store_members set role = p_role where store_id = p_store and user_id = p_user and role <> 'owner';
  if not found then raise exception 'not_found'; end if;
  perform public._log(p_store, 'member.role', 'user', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.remove_member(p_store uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_store_role(p_store, 'owner') or p_user = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.store_members where store_id = p_store and user_id = p_user and role <> 'owner';
  if not found then raise exception 'not_found'; end if;
  perform public._log(p_store, 'member.remove', 'user', p_user::text);
end $$;

create or replace function public.cancel_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_store uuid;
begin
  select store_id into v_store from public.store_invites where id = p_invite;
  if not found then raise exception 'not_found'; end if;
  if not public.has_store_role(v_store, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.store_invites where id = p_invite;
end $$;

-- ---------- billing ---------------------------------------------------
create or replace function public.change_plan(p_store uuid, p_plan uuid, p_cycle public.billing_cycle default 'monthly')
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare v_plan public.plans; v_sub public.subscriptions; v_amount numeric; v_n int;
begin
  if not public.has_store_role(p_store, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_plan from public.plans where id = p_plan and is_active;
  if not found then raise exception 'not_found'; end if;

  -- a downgrade must fit what the store already uses
  select count(*) into v_n from public.store_members where store_id = p_store;
  if v_n > coalesce((v_plan.limits_json ->> 'seats')::int, 2147483647) then raise exception 'plan_limit_exceeded:seats'; end if;
  select count(*) into v_n from public.domains where store_id = p_store and type = 'custom';
  if v_n > coalesce((v_plan.limits_json ->> 'domains')::int, 2147483647) then raise exception 'plan_limit_exceeded:domains'; end if;
  select count(*) into v_n from public.pages where store_id = p_store and type = 'custom';
  if v_n > coalesce((v_plan.limits_json ->> 'custom_pages')::int, 2147483647) then raise exception 'plan_limit_exceeded:custom_pages'; end if;

  v_amount := case when p_cycle = 'yearly' then v_plan.price_yearly else v_plan.price_monthly end;
  update public.subscriptions set plan_id = p_plan, billing_cycle = p_cycle,
         status = case when v_amount = 0 then 'active' else status end,
         current_period_end = case when v_amount = 0 then null else current_period_end end
  where store_id = p_store returning * into v_sub;

  -- paid plans produce an unpaid invoice; it is settled by your payment
  -- provider webhook (or manually in the admin console via admin_mark_invoice_paid)
  if v_amount > 0 then
    insert into public.invoices (subscription_id, store_id, number, amount, currency, status)
    values (v_sub.id, p_store, 'INV-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0'),
            v_amount, v_plan.currency, 'unpaid');
  end if;
  perform public._log(p_store, 'billing.change_plan', 'plan', p_plan::text, jsonb_build_object('cycle', p_cycle));
  return v_sub;
end $$;

create or replace function public.admin_mark_invoice_paid(p_invoice uuid, p_ref text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.invoices;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.invoices set status = 'paid', paid_at = now(), payment_ref = p_ref where id = p_invoice returning * into v;
  if not found then raise exception 'not_found'; end if;
  update public.subscriptions s set status = 'active', current_period_start = now(),
         current_period_end = now() + (case s.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end)
  where s.id = v.subscription_id;
  perform public._log(v.store_id, 'billing.paid', 'invoice', p_invoice::text);
end $$;

-- ---------- admin tools ----------------------------------------------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'stores', (select count(*) from public.stores where status <> 'archived'),
    'storesByStatus', coalesce((select jsonb_object_agg(status, c) from (select status, count(*) c from public.stores group by status) x), '{}'::jsonb),
    'subscriptionsByPlan', coalesce((select jsonb_object_agg(code, c) from (select p.code, count(*) c from public.subscriptions s join public.plans p on p.id = s.plan_id group by p.code) x), '{}'::jsonb),
    'openTickets', (select count(*) from public.support_tickets where status in ('open', 'pending')),
    'unpaidInvoices', (select count(*) from public.invoices where status = 'unpaid'),
    'pendingDomains', (select count(*) from public.domains where verification_status = 'pending'));
end $$;

create or replace function public.admin_set_store_status(p_store uuid, p_status public.store_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status = 'live' and not exists (select 1 from public.stores where id = p_store and published_version_id is not null) then
    raise exception 'not_published';
  end if;
  update public.stores set status = p_status, deleted_at = case when p_status = 'archived' then coalesce(deleted_at, now()) else null end
  where id = p_store;
  if not found then raise exception 'not_found'; end if;
  perform public._log(p_store, 'admin.store_status', 'store', p_store::text, jsonb_build_object('status', p_status));
end $$;

-- Switch a store's data source: mock (demo catalog) | supabase (tables from 0002) | http (company API)
create or replace function public.admin_set_store_integration(p_store uuid, p_mode public.data_mode, p_url text default null)
returns public.stores language plpgsql security definer set search_path = public as $$
declare v public.stores;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_mode = 'http' and coalesce(p_url, '') !~ '^https?://' then raise exception 'invalid_url'; end if;
  update public.stores set data_mode = p_mode, data_api_url = case when p_mode = 'http' then p_url else null end,
         status = case when p_mode <> 'mock' and status = 'ready_for_integration' then 'live'
                       when p_mode = 'mock' and status = 'live' then 'ready_for_integration'
                       else status end
  where id = p_store returning * into v;
  if not found then raise exception 'not_found'; end if;
  perform public._log(p_store, 'admin.integration', 'store', p_store::text, jsonb_build_object('mode', p_mode, 'url', p_url));
  return v;
end $$;

create or replace function public.save_store_as_template(
  p_store uuid, p_name text, p_slug text, p_category text default 'general',
  p_premium boolean default false, p_price numeric default null)
returns public.templates language plpgsql security definer set search_path = public as $$
declare v_layout jsonb; v public.templates;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_layout := public._strip_ids(public.get_editor_state(p_store));
  insert into public.templates (slug, name, category, theme_defaults_json, layout_json, is_premium, price, status, created_by)
  values (lower(trim(p_slug)), trim(p_name), coalesce(p_category, 'general'), coalesce(v_layout -> 'theme', '{}'::jsonb),
          v_layout, p_premium, p_price, 'draft', auth.uid())
  returning * into v;
  perform public._log(p_store, 'admin.template_from_store', 'template', v.id::text);
  return v;
end $$;

-- ---------- support ticket helpers -----------------------------------
create or replace function public.ticket_message_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.is_staff := public.is_staff();
  update public.support_tickets set updated_at = now(),
         status = case when new.is_staff and status = 'open' then 'pending'
                       when not new.is_staff and status in ('pending', 'resolved') then 'open'
                       else status end
  where id = new.ticket_id;
  return new;
end $$;
create trigger ticket_messages_before before insert on public.ticket_messages
  for each row execute function public.ticket_message_before();

-- ---------- media quota ----------------------------------------------
create or replace function public.media_quota_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_used bigint; v_limit bigint;
begin
  select coalesce(sum(size_bytes), 0) into v_used from public.media_assets where store_id = new.store_id;
  v_limit := public._plan_limit(new.store_id, 'media_mb')::bigint * 1024 * 1024;
  if v_used + new.size_bytes > v_limit then raise exception 'limit_reached:media_mb'; end if;
  return new;
end $$;
create trigger media_quota_trg before insert on public.media_assets
  for each row execute function public.media_quota_check();

-- ---------- storefront commerce (anon) -------------------------------
create or replace function public.validate_discount(p_store uuid, p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.discounts; v_amount numeric := 0;
begin
  if not public.store_is_public(p_store) then raise exception 'store_unavailable'; end if;
  select * into d from public.discounts
  where store_id = p_store and lower(code) = lower(trim(p_code)) and is_active
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
    and (usage_limit is null or used_count < usage_limit);
  if not found then raise exception 'invalid_code'; end if;
  if d.min_order_amount is not null and p_subtotal < d.min_order_amount then raise exception 'min_order_not_met'; end if;
  if d.type = 'percent' then v_amount := round(p_subtotal * d.value / 100, 2);
  elsif d.type = 'fixed' then v_amount := least(d.value, p_subtotal); end if;
  return jsonb_build_object('code', d.code, 'type', d.type, 'value', d.value, 'amount', v_amount, 'freeShipping', d.type = 'free_shipping');
end $$;

-- Guest checkout. Prices and stock are always read from the database,
-- never trusted from the client.
create or replace function public.place_order(p_store uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_store public.stores; it jsonb; v_var public.product_variants; v_prod public.products;
  v_qty int; v_sub numeric := 0; v_ship numeric := 0; v_disc numeric := 0; v_total numeric;
  v_ship_row public.shipping_methods; v_disc_row public.discounts; v_order public.orders; v_num text;
  v_method public.payment_method;
  v_name text := trim(coalesce(p_payload #>> '{customer,name}', ''));
  v_phone text := trim(coalesce(p_payload #>> '{customer,phone}', ''));
begin
  select * into v_store from public.stores where id = p_store;
  if not found or not public.store_is_public(p_store) then raise exception 'store_unavailable'; end if;
  if length(v_name) < 2 or length(v_phone) < 5 then raise exception 'invalid_customer'; end if;
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') = 0 then raise exception 'empty_cart'; end if;
  if jsonb_array_length(p_payload -> 'items') > 100 then raise exception 'too_many_items'; end if;

  v_num := to_char(now(), 'YYMMDD') || '-' || nextval('public.order_number_seq')::text;
  insert into public.orders (store_id, order_number, customer_name, customer_phone, customer_email, currency,
                             shipping_address_json, notes)
  values (p_store, v_num, v_name, v_phone, nullif(trim(p_payload #>> '{customer,email}'), ''), v_store.currency,
          coalesce(p_payload -> 'address', '{}'::jsonb), left(p_payload ->> 'notes', 1000))
  returning * into v_order;

  for it in select * from jsonb_array_elements(p_payload -> 'items') loop
    v_qty := greatest(least(coalesce((it ->> 'qty')::int, 1), 99), 1);
    select v.* into v_var from public.product_variants v where v.id = (it ->> 'variantId')::uuid and v.store_id = p_store;
    if not found then raise exception 'item_unavailable'; end if;
    select * into v_prod from public.products where id = v_var.product_id and status = 'active';
    if not found then raise exception 'item_unavailable'; end if;
    if v_var.track_inventory and v_var.stock_qty < v_qty then raise exception 'out_of_stock:%', v_prod.title; end if;
    insert into public.order_items (store_id, order_id, variant_id, title_snapshot, sku_snapshot, options_snapshot, quantity, unit_price, total)
    values (p_store, v_order.id, v_var.id, v_prod.title, v_var.sku, v_var.options_json, v_qty, v_var.price, v_var.price * v_qty);
    if v_var.track_inventory then update public.product_variants set stock_qty = stock_qty - v_qty where id = v_var.id; end if;
    v_sub := v_sub + v_var.price * v_qty;
  end loop;

  if p_payload ->> 'shippingMethodId' is not null then
    select * into v_ship_row from public.shipping_methods
    where id = (p_payload ->> 'shippingMethodId')::uuid and store_id = p_store and is_active;
    if found then
      v_ship := case when v_ship_row.type in ('free', 'pickup') then 0
                     when v_ship_row.min_order_amount is not null and v_sub >= v_ship_row.min_order_amount then 0
                     else v_ship_row.price end;
      update public.orders set shipping_method_id = v_ship_row.id where id = v_order.id;
    end if;
  end if;

  if nullif(trim(p_payload ->> 'discountCode'), '') is not null then
    select * into v_disc_row from public.discounts
    where store_id = p_store and lower(code) = lower(trim(p_payload ->> 'discountCode')) and is_active
      and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
      and (usage_limit is null or used_count < usage_limit)
      and (min_order_amount is null or v_sub >= min_order_amount);
    if found then
      v_disc := case v_disc_row.type when 'percent' then round(v_sub * v_disc_row.value / 100, 2)
                                      when 'fixed' then least(v_disc_row.value, v_sub) else 0 end;
      if v_disc_row.type = 'free_shipping' then v_ship := 0; end if;
      update public.discounts set used_count = used_count + 1 where id = v_disc_row.id;
      update public.orders set discount_id = v_disc_row.id where id = v_order.id;
    end if;
  end if;

  v_total := greatest(v_sub - v_disc + v_ship, 0);
  update public.orders set subtotal = v_sub, discount_total = v_disc, shipping_total = v_ship, grand_total = v_total where id = v_order.id;

  v_method := case when p_payload ->> 'paymentMethod' in ('cod', 'bank_transfer') then (p_payload ->> 'paymentMethod')::public.payment_method else 'cod' end;
  insert into public.payments (store_id, order_id, method, amount, status) values (p_store, v_order.id, v_method, v_total, 'pending');

  return jsonb_build_object('orderNumber', v_num, 'total', v_total, 'currency', v_store.currency);
end $$;

-- ---------- privileges -------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default (and Supabase also grants it to
-- anon/authenticated). Lock everything down, then open only what is intended.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname as name
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.name in ('is_staff', 'is_admin', 'has_store_role', 'store_is_public', 'current_user_active',
                  'get_published_store', 'place_order', 'validate_discount') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);   -- also used by RLS policies
    elsif f.name not like '\_%' and f.name not in ('handle_new_user', 'profiles_guard', 'set_updated_at',
                  'ticket_message_before', 'media_quota_check') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
