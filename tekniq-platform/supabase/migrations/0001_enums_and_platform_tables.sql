-- =====================================================================
-- Tekniq Platform — 0001: enums + platform tables
-- Layer 1 of the schema: accounts, stores, design (pages/sections/blocks),
-- versions, media, domains, billing, integrations, support, audit.
-- Every store-owned table carries store_id (multi-tenancy).
-- =====================================================================

-- ---------- enums -----------------------------------------------------
create type public.user_role        as enum ('platform_admin', 'support', 'merchant');
create type public.account_status   as enum ('active', 'suspended', 'pending');
create type public.store_role       as enum ('owner', 'editor', 'viewer');
create type public.store_status     as enum ('draft', 'ready_for_integration', 'live', 'suspended', 'archived');
create type public.data_mode        as enum ('mock', 'supabase', 'http');
create type public.page_type        as enum ('home','collection','product','cart','checkout','search','account','login','register','blog','blog_post','article','contact','not_found','custom');
create type public.section_region   as enum ('announcement', 'header', 'content', 'footer');
create type public.component_kind   as enum ('section', 'block');
create type public.template_status  as enum ('draft', 'published', 'archived');
create type public.version_status   as enum ('draft', 'published', 'archived');
create type public.sub_status       as enum ('trialing', 'active', 'past_due', 'canceled');
create type public.billing_cycle    as enum ('monthly', 'yearly');
create type public.invoice_status   as enum ('draft', 'unpaid', 'paid', 'void');
create type public.domain_type      as enum ('subdomain', 'custom');
create type public.verify_status    as enum ('pending', 'verified', 'failed');
create type public.ssl_status       as enum ('pending', 'active', 'failed');
create type public.media_type       as enum ('image', 'video', 'file');
create type public.card_kind        as enum ('product', 'collection', 'blog', 'testimonial');
create type public.ds_kind          as enum ('list', 'single', 'action');
create type public.ds_status        as enum ('planned', 'mock', 'ready');
create type public.integration_status as enum ('pending', 'connected', 'error');
create type public.ticket_status    as enum ('open', 'pending', 'resolved', 'closed');
create type public.ticket_priority  as enum ('low', 'normal', 'high');

-- ---------- generic trigger ------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- platform settings (non secret) ---------------------------
create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- accounts --------------------------------------------------
-- One row per auth.users row (created by trigger in 0005).
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text,
  phone         text,
  avatar_url    text,
  role          public.user_role not null default 'merchant',
  status        public.account_status not null default 'active',
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  description    text,
  price_monthly  numeric(10,2) not null default 0,
  price_yearly   numeric(10,2) not null default 0,
  currency       char(3) not null default 'USD',
  -- keys: stores, custom_pages, seats, domains, media_mb
  limits_json    jsonb not null default '{}'::jsonb,
  features_json  jsonb not null default '[]'::jsonb,
  is_active      boolean not null default true,
  sort           int not null default 0,
  created_at     timestamptz not null default now()
);

create table public.templates (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  category             text not null default 'general',
  description          text,
  thumbnail_url        text,
  preview_url          text,
  theme_defaults_json  jsonb not null default '{}'::jsonb,
  -- a full "Draft" document (theme, cardPresets, menus, layout, pages) without ids
  layout_json          jsonb not null,
  is_premium           boolean not null default false,
  price                numeric(10,2),
  status               public.template_status not null default 'draft',
  sort                 int not null default 0,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger templates_updated before update on public.templates
  for each row execute function public.set_updated_at();

-- ---------- component registry ---------------------------------------
create table public.component_types (
  id                   uuid primary key default gen_random_uuid(),
  key                  text not null unique,
  kind                 public.component_kind not null,
  name_ar              text not null,
  name_en              text,
  category             text not null default 'general',
  schema_json          jsonb not null default '{}'::jsonb,
  allowed_pages_json   jsonb not null default '"all"'::jsonb,
  allowed_blocks_json  jsonb not null default '[]'::jsonb,
  max_blocks           int,
  version              text not null default '1.0.0',
  status               text not null default 'active' check (status in ('active','deprecated')),
  thumbnail_url        text,
  sort                 int not null default 0
);

-- ---------- stores (tenants) -----------------------------------------
create table public.stores (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles (id) on delete restrict,
  template_id           uuid references public.templates (id) on delete set null,
  name                  text not null,
  slug                  text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  status                public.store_status not null default 'draft',
  default_locale        text not null default 'ar',
  direction             text not null default 'rtl' check (direction in ('rtl','ltr')),
  currency              char(3) not null default 'USD',
  timezone              text not null default 'Asia/Aden',
  logo_url              text,
  favicon_url           text,
  data_mode             public.data_mode not null default 'mock',
  data_api_url          text,
  draft_rev             int not null default 1,
  published_version_id  uuid,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index stores_owner_idx on public.stores (owner_id);
create trigger stores_updated before update on public.stores
  for each row execute function public.set_updated_at();

create table public.store_members (
  store_id     uuid not null references public.stores (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.store_role not null default 'viewer',
  invited_by   uuid references public.profiles (id) on delete set null,
  accepted_at  timestamptz default now(),
  created_at   timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_members_user_idx on public.store_members (user_id);

create table public.store_invites (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  email       text not null,
  role        public.store_role not null default 'viewer',
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (store_id, email)
);

-- ---------- billing ---------------------------------------------------
create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null unique references public.stores (id) on delete cascade,
  plan_id               uuid not null references public.plans (id) on delete restrict,
  status                public.sub_status not null default 'trialing',
  billing_cycle         public.billing_cycle not null default 'monthly',
  trial_ends_at         timestamptz,
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz,
  canceled_at           timestamptz,
  created_at            timestamptz not null default now()
);

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions (id) on delete restrict,
  store_id         uuid not null references public.stores (id) on delete cascade,
  number           text not null unique,
  amount           numeric(10,2) not null,
  currency         char(3) not null default 'USD',
  status           public.invoice_status not null default 'unpaid',
  issued_at        timestamptz not null default now(),
  paid_at          timestamptz,
  payment_ref      text,
  created_at       timestamptz not null default now()
);
create index invoices_store_idx on public.invoices (store_id);

-- ---------- domains ---------------------------------------------------
create table public.domains (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores (id) on delete cascade,
  hostname             text not null,
  type                 public.domain_type not null default 'custom',
  is_primary           boolean not null default false,
  verification_status  public.verify_status not null default 'pending',
  ssl_status           public.ssl_status not null default 'pending',
  dns_records_json     jsonb not null default '[]'::jsonb,
  verification_token   text not null default replace(gen_random_uuid()::text, '-', ''),
  verified_at          timestamptz,
  created_at           timestamptz not null default now()
);
create unique index domains_hostname_key on public.domains (lower(hostname));
create index domains_store_idx on public.domains (store_id);
create unique index domains_one_primary on public.domains (store_id) where is_primary;

-- ---------- design (draft state) -------------------------------------
create table public.themes (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores (id) on delete cascade,
  name         text not null default 'default',
  is_active    boolean not null default true,
  tokens_json  jsonb not null default '{}'::jsonb,
  custom_css   text,
  updated_at   timestamptz not null default now()
);
create unique index themes_one_active on public.themes (store_id) where is_active;

create table public.pages (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id) on delete cascade,
  type             public.page_type not null,
  title            text not null,
  slug             text not null,
  is_enabled       boolean not null default true,
  is_system        boolean not null default false,
  seo_title        text,
  seo_description  text,
  og_image         text,
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, slug)
);
create trigger pages_updated before update on public.pages
  for each row execute function public.set_updated_at();

create table public.sections (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  page_id           uuid references public.pages (id) on delete cascade,
  region            public.section_region not null default 'content',
  type_key          text not null references public.component_types (key) on update cascade,
  position          int not null default 0,
  is_visible        boolean not null default true,
  settings_json     jsonb not null default '{}'::jsonb,
  data_source_key   text,
  created_at        timestamptz not null default now(),
  -- page sections live on a page, global ones (header/footer/announcement) do not
  constraint sections_region_page check ((region = 'content') = (page_id is not null))
);
create index sections_page_idx  on public.sections (page_id, position);
create index sections_store_idx on public.sections (store_id, region, position);

create table public.blocks (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  section_id     uuid not null references public.sections (id) on delete cascade,
  type_key       text not null references public.component_types (key) on update cascade,
  position       int not null default 0,
  is_visible     boolean not null default true,
  settings_json  jsonb not null default '{}'::jsonb
);
create index blocks_section_idx on public.blocks (section_id, position);

create table public.navigation_menus (
  id        uuid primary key default gen_random_uuid(),
  store_id  uuid not null references public.stores (id) on delete cascade,
  handle    text not null,
  title     text not null,
  unique (store_id, handle)
);

create table public.menu_items (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  menu_id           uuid not null references public.navigation_menus (id) on delete cascade,
  parent_id         uuid references public.menu_items (id) on delete cascade,
  label             text not null,
  link_type         text not null default 'page' check (link_type in ('page','collection','product','url')),
  link_ref          text not null default '',
  position          int not null default 0,
  open_in_new_tab   boolean not null default false
);
create index menu_items_menu_idx on public.menu_items (menu_id, parent_id, position);

create table public.card_presets (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  kind           public.card_kind not null,
  name           text not null,
  settings_json  jsonb not null default '{}'::jsonb,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index card_presets_store_idx on public.card_presets (store_id);

-- ---------- versions --------------------------------------------------
create table public.store_versions (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  version_no     int not null,
  status         public.version_status not null default 'published',
  snapshot_json  jsonb not null,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  published_by   uuid references public.profiles (id) on delete set null,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (store_id, version_no)
);

alter table public.stores
  add constraint stores_published_version_fk
  foreign key (published_version_id) references public.store_versions (id) on delete set null;

-- ---------- media -----------------------------------------------------
create table public.media_assets (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores (id) on delete cascade,
  type          public.media_type not null default 'image',
  file_name     text not null,
  storage_path  text not null,
  url           text not null,
  mime_type     text,
  size_bytes    bigint not null default 0,
  width         int,
  height        int,
  alt_text      text,
  uploaded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index media_assets_store_idx on public.media_assets (store_id, created_at desc);

-- ---------- integrations (company backend hand-off) ------------------
create table public.data_sources (
  id                    uuid primary key default gen_random_uuid(),
  key                   text not null unique,
  name                  text not null,
  kind                  public.ds_kind not null default 'list',
  method                text not null default 'GET',
  endpoint_template     text not null,
  params_schema_json    jsonb not null default '{}'::jsonb,
  response_schema_json  jsonb not null default '{}'::jsonb,
  status                public.ds_status not null default 'planned'
);

create table public.store_integrations (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  data_source_id    uuid not null references public.data_sources (id) on delete cascade,
  mode              text not null default 'mock' check (mode in ('mock','live')),
  base_url          text,
  auth_config_json  jsonb not null default '{}'::jsonb,   -- secrets: staff only (see RLS)
  status            public.integration_status not null default 'pending',
  last_checked_at   timestamptz,
  unique (store_id, data_source_id)
);

create table public.translations (
  id        uuid primary key default gen_random_uuid(),
  store_id  uuid not null references public.stores (id) on delete cascade,
  locale    text not null,
  key       text not null,
  value     text not null,
  unique (store_id, locale, key)
);

-- ---------- audit + support ------------------------------------------
create table public.activity_logs (
  id           bigint generated always as identity primary key,
  store_id     uuid references public.stores (id) on delete set null,
  user_id      uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    text,
  meta_json    jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index activity_logs_store_idx on public.activity_logs (store_id, created_at desc);

create table public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  assigned_to  uuid references public.profiles (id) on delete set null,
  subject      text not null,
  body         text not null,
  status       public.ticket_status not null default 'open',
  priority     public.ticket_priority not null default 'normal',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index support_tickets_store_idx on public.support_tickets (store_id, created_at desc);
create trigger support_tickets_updated before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  is_staff    boolean not null default false,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);
