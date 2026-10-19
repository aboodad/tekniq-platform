-- Tekniq: all migrations + seed in one file (paste into Supabase SQL Editor). Generated; see scripts/bundle-sql.sh

-- ===== supabase/migrations/0001_enums_and_platform_tables.sql =====
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

-- ===== supabase/migrations/0002_commerce_tables.sql =====
-- =====================================================================
-- Tekniq Platform — 0002: commerce tables
-- Catalog, orders and blog content that storefronts read. The platform
-- works without any rows here (storefronts fall back to demo data when a
-- store's data_mode = 'mock'). Customer *accounts* are expected to live in
-- the company's own backend; the tables are provided for it to adopt.
-- =====================================================================

create type public.product_status   as enum ('draft', 'active', 'archived');
create type public.customer_status  as enum ('active', 'blocked');
create type public.cart_status      as enum ('active', 'converted', 'abandoned');
create type public.order_status     as enum ('pending','confirmed','processing','shipped','delivered','canceled','refunded');
create type public.payment_state    as enum ('unpaid','paid','partially_refunded','refunded');
create type public.payment_method   as enum ('cod','card','bank_transfer','wallet');
create type public.payment_tx_status as enum ('pending','authorized','captured','failed','refunded');
create type public.shipping_type    as enum ('flat','free','pickup','by_weight');
create type public.discount_type    as enum ('percent','fixed','free_shipping');
create type public.review_status    as enum ('pending','approved','rejected');
create type public.post_status      as enum ('draft','published');
create type public.collection_sort  as enum ('manual','newest','best_selling','price_asc','price_desc');

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores (id) on delete cascade,
  email              text,
  phone              text,
  full_name          text not null,
  password_hash      text,
  status             public.customer_status not null default 'active',
  accepts_marketing  boolean not null default false,
  created_at         timestamptz not null default now()
);
create unique index customers_email_key on public.customers (store_id, lower(email)) where email is not null;

create table public.addresses (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores (id) on delete cascade,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  label        text,
  recipient    text,
  phone        text,
  country      text,
  city         text,
  district     text,
  street       text,
  notes        text,
  is_default   boolean not null default false
);

create table public.collections (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores (id) on delete cascade,
  parent_id       uuid references public.collections (id) on delete set null,
  title           text not null,
  slug            text not null,
  description     text,
  image_url       text,
  sort_mode       public.collection_sort not null default 'manual',
  is_published    boolean not null default true,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  unique (store_id, slug)
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id) on delete cascade,
  title            text not null,
  slug             text not null,
  description      text,
  status           public.product_status not null default 'draft',
  brand            text,
  badge            text check (badge in ('new','sale','soldout')),
  tags_json        jsonb not null default '[]'::jsonb,
  options_json     jsonb not null default '[]'::jsonb,   -- [{name, values[]}]
  seo_title        text,
  seo_description  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, slug)
);
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_variants (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete cascade,
  sku               text,
  options_json      jsonb not null default '{}'::jsonb,
  price             numeric(10,2) not null check (price >= 0),
  compare_at_price  numeric(10,2),
  stock_qty         int not null default 0,
  track_inventory   boolean not null default true,
  weight            numeric(8,2),
  is_default        boolean not null default false
);
create index product_variants_product_idx on public.product_variants (product_id);
create unique index product_variants_sku_key on public.product_variants (store_id, sku) where sku is not null;

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  variant_id  uuid references public.product_variants (id) on delete set null,
  media_id    uuid references public.media_assets (id) on delete set null,
  url         text not null,
  position    int not null default 0,
  alt_text    text
);
create index product_images_product_idx on public.product_images (product_id, position);

create table public.collection_products (
  store_id       uuid not null references public.stores (id) on delete cascade,
  collection_id  uuid not null references public.collections (id) on delete cascade,
  product_id     uuid not null references public.products (id) on delete cascade,
  position       int not null default 0,
  primary key (collection_id, product_id)
);

create table public.carts (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  customer_id    uuid references public.customers (id) on delete set null,
  session_token  text not null unique,
  currency       char(3) not null default 'USD',
  status         public.cart_status not null default 'active',
  expires_at     timestamptz,
  created_at     timestamptz not null default now()
);

create table public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  cart_id     uuid not null references public.carts (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id) on delete restrict,
  quantity    int not null check (quantity > 0),
  unit_price  numeric(10,2) not null
);

create table public.shipping_methods (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  name              text not null,
  type              public.shipping_type not null default 'flat',
  price             numeric(10,2) not null default 0,
  min_order_amount  numeric(10,2),
  est_days          text,
  zones_json        jsonb not null default '[]'::jsonb,
  is_active         boolean not null default true
);

create table public.discounts (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  code              text not null,
  type              public.discount_type not null,
  value             numeric(10,2) not null default 0,
  min_order_amount  numeric(10,2),
  starts_at         timestamptz,
  ends_at           timestamptz,
  usage_limit       int,
  used_count        int not null default 0,
  is_active         boolean not null default true,
  unique (store_id, code)
);

create sequence public.order_number_seq start 10001;

create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores (id) on delete cascade,
  order_number          text not null,
  customer_id           uuid references public.customers (id) on delete set null,
  customer_name         text not null,
  customer_phone        text not null,
  customer_email        text,
  status                public.order_status not null default 'pending',
  payment_status        public.payment_state not null default 'unpaid',
  currency              char(3) not null default 'USD',
  subtotal              numeric(10,2) not null default 0,
  discount_total        numeric(10,2) not null default 0,
  shipping_total        numeric(10,2) not null default 0,
  tax_total             numeric(10,2) not null default 0,
  grand_total           numeric(10,2) not null default 0,
  shipping_address_json jsonb not null default '{}'::jsonb,
  billing_address_json  jsonb not null default '{}'::jsonb,
  notes                 text,
  shipping_method_id    uuid references public.shipping_methods (id) on delete set null,
  discount_id           uuid references public.discounts (id) on delete set null,
  placed_at             timestamptz not null default now(),
  unique (store_id, order_number)
);
create index orders_store_idx on public.orders (store_id, placed_at desc);

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores (id) on delete cascade,
  order_id        uuid not null references public.orders (id) on delete cascade,
  variant_id      uuid references public.product_variants (id) on delete set null,
  title_snapshot  text not null,
  sku_snapshot    text,
  options_snapshot jsonb not null default '{}'::jsonb,
  quantity        int not null check (quantity > 0),
  unit_price      numeric(10,2) not null,
  total           numeric(10,2) not null
);
create index order_items_order_idx on public.order_items (order_id);

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  order_id          uuid not null references public.orders (id) on delete restrict,
  method            public.payment_method not null default 'cod',
  provider          text,
  transaction_ref   text,
  amount            numeric(10,2) not null,
  status            public.payment_tx_status not null default 'pending',
  paid_at           timestamptz,
  raw_response_json jsonb not null default '{}'::jsonb
);

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  customer_id  uuid references public.customers (id) on delete set null,
  author_name  text,
  rating       smallint not null check (rating between 1 and 5),
  title        text,
  body         text,
  status       public.review_status not null default 'pending',
  created_at   timestamptz not null default now()
);

create table public.wishlist_items (
  store_id     uuid not null references public.stores (id) on delete cascade,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (customer_id, product_id)
);

create table public.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores (id) on delete cascade,
  title           text not null,
  slug            text not null,
  author          text,
  excerpt         text,
  content         text,
  cover_url       text,
  status          public.post_status not null default 'draft',
  published_at    timestamptz,
  unique (store_id, slug)
);

-- ===== supabase/migrations/0003_security_rls.sql =====
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

-- ===== supabase/migrations/0004_functions.sql =====
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

-- ===== supabase/migrations/0005_storage.sql =====
-- =====================================================================
-- Tekniq Platform — 0005: storage bucket for store media
-- Files are stored as  media/<store_id>/<uuid>.<ext>
-- Anyone can read (images are shown on public storefronts); only editors of
-- that store can upload / replace / delete inside its own folder.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'video/mp4', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- first path segment -> store uuid (null when it is not a uuid)
create or replace function public.storage_store_id(p_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when (string_to_array(p_name, '/'))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((string_to_array(p_name, '/'))[1])::uuid end
$$;
revoke all on function public.storage_store_id(text) from public, anon, authenticated;
grant execute on function public.storage_store_id(text) to anon, authenticated;

create policy "media_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'media');

create policy "media_editor_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
              and public.storage_store_id(name) is not null
              and public.has_store_role(public.storage_store_id(name), 'editor'));

create policy "media_editor_update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.storage_store_id(name) is not null
         and public.has_store_role(public.storage_store_id(name), 'editor'))
  with check (bucket_id = 'media' and public.storage_store_id(name) is not null
              and public.has_store_role(public.storage_store_id(name), 'editor'));

create policy "media_editor_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.storage_store_id(name) is not null
         and public.has_store_role(public.storage_store_id(name), 'editor'));

-- ===== supabase/seed.sql =====
-- GENERATED by scripts/gen-seed.mjs — do not edit by hand. Safe to run more than once.
begin;

insert into public.platform_settings (key, value) values ('root_domain', '"tekniq.store"'), ('cname_target', '"stores.tekniq.store"')
  on conflict (key) do nothing;

insert into public.plans (code, name, description, price_monthly, price_yearly, currency, limits_json, features_json, is_active, sort) values
  ('starter', 'المبتدئ', 'لبدء متجرك', 0, 0, 'USD', '{"stores":1,"custom_pages":3,"seats":2,"domains":1,"media_mb":100}'::jsonb, '["متجر واحد","3 صفحات مخصصة","نطاق فرعي"]'::jsonb, true, 1),
  ('pro', 'الاحترافي', 'للمتاجر النامية', 29, 290, 'USD', '{"stores":3,"custom_pages":20,"seats":5,"domains":3,"media_mb":1000}'::jsonb, '["3 متاجر","20 صفحة مخصصة","نطاقات خاصة"]'::jsonb, true, 2),
  ('business', 'الأعمال', 'للفرق الكبيرة', 79, 790, 'USD', '{"stores":10,"custom_pages":100,"seats":20,"domains":10,"media_mb":10000}'::jsonb, '["10 متاجر","صفحات غير محدودة تقريباً","أولوية الدعم"]'::jsonb, true, 3)
on conflict (code) do update set name = excluded.name, description = excluded.description, price_monthly = excluded.price_monthly, price_yearly = excluded.price_yearly,
  limits_json = excluded.limits_json, features_json = excluded.features_json, sort = excluded.sort;

insert into public.component_types (key, kind, name_ar, category, schema_json, sort) values
  ('heading', 'block', 'عنوان', 'blocks', '{"fields":[{"key":"text","label":"النص","type":"text"},{"key":"size","label":"الحجم","type":"select"}]}'::jsonb, 0),
  ('text', 'block', 'نص', 'blocks', '{"fields":[{"key":"text","label":"النص","type":"textarea"}]}'::jsonb, 1),
  ('button', 'block', 'زر', 'blocks', '{"fields":[{"key":"label","label":"نص الزر","type":"text"},{"key":"href","label":"الرابط","type":"link"},{"key":"style","label":"النمط","type":"select"}]}'::jsonb, 2),
  ('image', 'block', 'صورة', 'blocks', '{"fields":[{"key":"src","label":"الصورة","type":"image"},{"key":"alt","label":"نص بديل","type":"text"},{"key":"href","label":"الرابط","type":"link"}]}'::jsonb, 3),
  ('feature', 'block', 'ميزة', 'blocks', '{"fields":[{"key":"icon","label":"الأيقونة","type":"select"},{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"الوصف","type":"text"}]}'::jsonb, 4),
  ('slide', 'block', 'شريحة', 'blocks', '{"fields":[{"key":"image","label":"الصورة","type":"image"},{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"text"},{"key":"cta","label":"نص الزر","type":"text"},{"key":"href","label":"الرابط","type":"link"}]}'::jsonb, 5),
  ('testimonial', 'block', 'رأي عميل', 'blocks', '{"fields":[{"key":"quote","label":"الرأي","type":"textarea"},{"key":"name","label":"الاسم","type":"text"},{"key":"role","label":"الصفة","type":"text"},{"key":"rating","label":"التقييم","type":"range"}]}'::jsonb, 6),
  ('faq-item', 'block', 'سؤال', 'blocks', '{"fields":[{"key":"q","label":"السؤال","type":"text"},{"key":"a","label":"الجواب","type":"textarea"}]}'::jsonb, 7),
  ('logo', 'block', 'شعار', 'blocks', '{"fields":[{"key":"src","label":"الشعار","type":"image"},{"key":"alt","label":"الاسم","type":"text"},{"key":"href","label":"الرابط","type":"link"}]}'::jsonb, 8),
  ('stat', 'block', 'رقم', 'blocks', '{"fields":[{"key":"value","label":"القيمة","type":"text"},{"key":"label","label":"الوصف","type":"text"}]}'::jsonb, 9),
  ('gallery-image', 'block', 'صورة معرض', 'blocks', '{"fields":[{"key":"src","label":"الصورة","type":"image"},{"key":"alt","label":"نص بديل","type":"text"},{"key":"href","label":"الرابط","type":"link"}]}'::jsonb, 10),
  ('footer-column', 'block', 'عمود روابط', 'blocks', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"menu","label":"القائمة","type":"select"}]}'::jsonb, 11),
  ('footer-text', 'block', 'نص تعريفي', 'blocks', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"textarea"}]}'::jsonb, 12),
  ('social', 'block', 'حساب اجتماعي', 'blocks', '{"fields":[{"key":"network","label":"الشبكة","type":"select"},{"key":"href","label":"الرابط","type":"link"}]}'::jsonb, 13),
  ('announcement-bar', 'section', 'شريط الإعلان', 'layout', '{"fields":[{"key":"text","label":"النص","type":"text"},{"key":"href","label":"الرابط","type":"link"},{"key":"tone","label":"اللون","type":"select"},{"key":"closable","label":"قابل للإغلاق","type":"toggle"}]}'::jsonb, 14),
  ('header', 'section', 'الترويسة', 'layout', '{"fields":[{"key":"layout","label":"التخطيط","type":"select"},{"key":"menu","label":"القائمة","type":"select"},{"key":"showSearch","label":"زر البحث","type":"toggle"},{"key":"showCart","label":"أيقونة السلة","type":"toggle"},{"key":"sticky","label":"تثبيت أعلى الصفحة","type":"toggle"},{"key":"tone","label":"اللون","type":"select"}]}'::jsonb, 15),
  ('footer', 'section', 'التذييل', 'layout', '{"fields":[{"key":"copyright","label":"حقوق النشر","type":"textarea"},{"key":"showPayments","label":"عرض وسائل الدفع","type":"toggle"},{"key":"showNewsletter","label":"نموذج النشرة","type":"toggle"}]}'::jsonb, 16),
  ('hero', 'section', 'غلاف رئيسي', 'hero', '{"fields":[{"key":"image","label":"صورة الخلفية","type":"image"},{"key":"eyebrow","label":"عنوان صغير","type":"text"},{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"textarea"},{"key":"cta","label":"نص الزر","type":"text"},{"key":"href","label":"رابط الزر","type":"link"},{"key":"cta2","label":"الزر الثاني","type":"text"},{"key":"href2","label":"رابط الثاني","type":"link"},{"key":"height","label":"الارتفاع","type":"select"},{"key":"align","label":"المحاذاة","type":"select"},{"key":"overlay","label":"تعتيم الصورة","type":"range"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 17),
  ('slideshow', 'section', 'عرض شرائح', 'hero', '{"fields":[{"key":"autoplay","label":"تشغيل تلقائي","type":"toggle"},{"key":"interval","label":"مدة الشريحة (ثانية)","type":"range"},{"key":"height","label":"الارتفاع","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 18),
  ('image-banner', 'section', 'بانر صورة', 'hero', '{"fields":[{"key":"image","label":"الصورة","type":"image"},{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"text"},{"key":"cta","label":"نص الزر","type":"text"},{"key":"href","label":"الرابط","type":"link"},{"key":"overlay","label":"تعتيم","type":"range"},{"key":"align","label":"المحاذاة","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 19),
  ('cta-banner', 'section', 'دعوة لإجراء', 'marketing', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"text"},{"key":"cta","label":"نص الزر","type":"text"},{"key":"href","label":"الرابط","type":"link"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 20),
  ('rich-text', 'section', 'نص منسّق', 'content', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"textarea"},{"key":"align","label":"المحاذاة","type":"select"},{"key":"maxw","label":"عرض النص","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 21),
  ('image-with-text', 'section', 'صورة مع نص', 'content', '{"fields":[{"key":"image","label":"الصورة","type":"image"},{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"textarea"},{"key":"cta","label":"نص الزر","type":"text"},{"key":"href","label":"الرابط","type":"link"},{"key":"side","label":"موضع الصورة","type":"select"},{"key":"ratio","label":"نسبة الصورة","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 22),
  ('features', 'section', 'مزايا المتجر', 'content', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"columns","label":"الأعمدة","type":"select"},{"key":"style","label":"الشكل","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 23),
  ('collection-list', 'section', 'قائمة الأقسام', 'catalog', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"limit","label":"العدد","type":"range"},{"key":"columns","label":"الأعمدة","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 24),
  ('featured-products', 'section', 'منتجات مميزة', 'catalog', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"collection","label":"القسم (slug)","type":"text"},{"key":"sort","label":"الترتيب","type":"select"},{"key":"limit","label":"العدد","type":"range"},{"key":"columns","label":"الأعمدة","type":"select"},{"key":"cta","label":"رابط عرض الكل","type":"text"},{"key":"href","label":"الرابط","type":"link"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 25),
  ('product-carousel', 'section', 'شريط منتجات', 'catalog', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"collection","label":"القسم (slug)","type":"text"},{"key":"sort","label":"الترتيب","type":"select"},{"key":"limit","label":"العدد","type":"range"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 26),
  ('testimonials', 'section', 'آراء العملاء', 'social', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"columns","label":"الأعمدة","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 27),
  ('faq', 'section', 'الأسئلة الشائعة', 'content', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 28),
  ('newsletter', 'section', 'النشرة البريدية', 'marketing', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"text"},{"key":"button","label":"نص الزر","type":"text"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 29),
  ('countdown', 'section', 'عدّاد تنازلي', 'marketing', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"endsAt","label":"ينتهي في","type":"datetime"},{"key":"cta","label":"نص الزر","type":"text"},{"key":"href","label":"الرابط","type":"link"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 30),
  ('brand-logos', 'section', 'شعارات الشركاء', 'social', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"grayscale","label":"رمادي","type":"toggle"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 31),
  ('video', 'section', 'فيديو', 'media', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"url","label":"رابط فيديو (MP4 أو YouTube)","type":"link"},{"key":"poster","label":"صورة الغلاف","type":"image"},{"key":"ratio","label":"النسبة","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 32),
  ('gallery', 'section', 'معرض صور', 'media', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"columns","label":"الأعمدة","type":"select"},{"key":"ratio","label":"النسبة","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 33),
  ('contact-form', 'section', 'نموذج تواصل', 'marketing', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"text","label":"النص","type":"text"},{"key":"email","label":"بريد الاستقبال","type":"text"},{"key":"phone","label":"رقم الهاتف","type":"text"},{"key":"address","label":"العنوان","type":"text"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 34),
  ('stats', 'section', 'أرقام وإحصائيات', 'social', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 35),
  ('blog-posts', 'section', 'آخر المقالات', 'content', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"limit","label":"العدد","type":"range"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 36),
  ('spacer', 'section', 'فاصل', 'layout', '{"fields":[{"key":"height","label":"الارتفاع (px)","type":"range"},{"key":"line","label":"خط فاصل","type":"toggle"}]}'::jsonb, 37),
  ('collection-main', 'section', 'قائمة منتجات القسم', 'system', '{"fields":[{"key":"columns","label":"الأعمدة","type":"select"},{"key":"showFilters","label":"الترتيب والبحث","type":"toggle"},{"key":"showBanner","label":"ترويسة القسم","type":"toggle"},{"key":"perPage","label":"منتجات بالصفحة","type":"range"}]}'::jsonb, 38),
  ('product-main', 'section', 'تفاصيل المنتج', 'system', '{"fields":[{"key":"gallery","label":"عرض الصور","type":"select"},{"key":"showSku","label":"عرض الرمز","type":"toggle"},{"key":"showShare","label":"مشاركة","type":"toggle"}]}'::jsonb, 39),
  ('product-reviews', 'section', 'تقييمات المنتج', 'system', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 40),
  ('related-products', 'section', 'منتجات ذات صلة', 'system', '{"fields":[{"key":"title","label":"العنوان","type":"text"},{"key":"limit","label":"العدد","type":"range"},{"key":"columns","label":"الأعمدة","type":"select"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 41),
  ('cart-main', 'section', 'محتوى السلة', 'system', '{"fields":[{"key":"emptyText","label":"نص السلة الفارغة","type":"text"},{"key":"showNotes","label":"ملاحظات الطلب","type":"toggle"}]}'::jsonb, 42),
  ('checkout-main', 'section', 'إتمام الطلب', 'system', '{"fields":[{"key":"askEmail","label":"طلب البريد","type":"toggle"},{"key":"askNotes","label":"ملاحظات","type":"toggle"},{"key":"successText","label":"رسالة النجاح","type":"text"}]}'::jsonb, 43),
  ('search-main', 'section', 'نتائج البحث', 'system', '{"fields":[{"key":"columns","label":"الأعمدة","type":"select"}]}'::jsonb, 44),
  ('blog-main', 'section', 'قائمة المقالات', 'system', '{"fields":[{"key":"columns","label":"الأعمدة","type":"select"}]}'::jsonb, 45),
  ('article-main', 'section', 'المقال', 'system', '{"fields":[]}'::jsonb, 46),
  ('account-main', 'section', 'حساب العميل', 'system', '{"fields":[{"key":"text","label":"نص توضيحي","type":"text"}]}'::jsonb, 47),
  ('page-content', 'section', 'محتوى الصفحة', 'system', '{"fields":[{"key":"text","label":"المحتوى","type":"textarea"},{"key":"padY","label":"المسافة الرأسية","type":"select"},{"key":"bg","label":"الخلفية","type":"select"},{"key":"width","label":"العرض","type":"select"}]}'::jsonb, 48)
on conflict (key) do update set name_ar = excluded.name_ar, category = excluded.category, schema_json = excluded.schema_json, sort = excluded.sort;

insert into public.data_sources (key, name, kind, method, endpoint_template, status) values
  ('products.list', 'قائمة منتجات (قسم/ترتيب/عدد)', 'list', 'GET', '/products/list', 'planned'),
  ('products.related', 'منتجات ذات صلة بالمنتج الحالي', 'list', 'GET', '/products/related', 'planned'),
  ('collections.all', 'كل الأقسام', 'list', 'GET', '/collections/all', 'planned'),
  ('collection.current', 'القسم الحالي ومنتجاته', 'list', 'GET', '/collection/current', 'planned'),
  ('product.current', 'المنتج الحالي وخياراته', 'list', 'GET', '/product/current', 'planned'),
  ('reviews.current', 'تقييمات المنتج الحالي', 'list', 'GET', '/reviews/current', 'planned'),
  ('blog.latest', 'آخر المقالات', 'list', 'GET', '/blog/latest', 'planned'),
  ('shipping.methods', 'طرق الشحن', 'list', 'GET', '/shipping/methods', 'planned'),
  ('order.create', 'إنشاء الطلب', 'action', 'POST', '/order/create', 'planned'),
  ('discount.validate', 'التحقق من كود الخصم', 'action', 'POST', '/discount/validate', 'planned')
on conflict (key) do update set name = excluded.name;

insert into public.templates (slug, name, category, description, theme_defaults_json, layout_json, is_premium, status, sort) values
  ('blank', 'صفحة بيضاء', 'general', 'ابدأ من الصفر: ترويسة وتذييل وصفحات النظام فقط.', '{"colors":{"bg":"#ffffff","surface":"#f6f6f8","text":"#15151c","muted":"#6b6b7a","primary":"#5b3df5","primaryText":"#ffffff","accent":"#ff6a3d","border":"#e6e6ec","sale":"#e5484d"},"fonts":{"heading":"Cairo","body":"Cairo"},"radius":12,"container":1200,"density":"normal","buttonStyle":"solid","buttonShape":"rounded"}'::jsonb, '{"theme":{"colors":{"bg":"#ffffff","surface":"#f6f6f8","text":"#15151c","muted":"#6b6b7a","primary":"#5b3df5","primaryText":"#ffffff","accent":"#ff6a3d","border":"#e6e6ec","sale":"#e5484d"},"fonts":{"heading":"Cairo","body":"Cairo"},"radius":12,"container":1200,"density":"normal","buttonStyle":"solid","buttonShape":"rounded"},"cardPresets":[{"kind":"product","name":"منتج — افتراضي","settings":{"ratio":"4/5","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":true,"showBadge":true,"showRating":false,"showAddToCart":true,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true},{"kind":"product","name":"منتج — بسيط","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"none","align":"center","showPrice":true,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":false},{"kind":"product","name":"منتج — بطاقة","settings":{"ratio":"4/5","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":true,"showBadge":true,"showRating":true,"showAddToCart":true,"showBrand":false,"border":true,"shadow":"sm","radius":16},"isDefault":false},{"kind":"collection","name":"قسم — افتراضي","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"zoom","align":"center","showPrice":false,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true},{"kind":"blog","name":"مقال — افتراضي","settings":{"ratio":"16/9","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":false,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true}],"menus":[{"handle":"main","title":"القائمة الرئيسية","items":[{"label":"الرئيسية","linkType":"url","linkRef":"/","children":[]},{"label":"المتجر","linkType":"url","linkRef":"/collection/all","children":[]},{"label":"المدونة","linkType":"url","linkRef":"/blog","children":[]},{"label":"تواصل معنا","linkType":"page","linkRef":"contact","children":[]}]},{"handle":"footer","title":"قائمة التذييل","items":[{"label":"سياسة الاسترجاع","linkType":"page","linkRef":"returns","children":[]},{"label":"الشروط والأحكام","linkType":"page","linkRef":"terms","children":[]},{"label":"تواصل معنا","linkType":"page","linkRef":"contact","children":[]}]}],"layout":{"announcement":[{"type":"announcement-bar","visible":true,"settings":{"text":"مرحباً بكم في متجرنا","href":"","tone":"dark","closable":true},"dataSource":null,"blocks":[]}],"header":[{"type":"header","visible":true,"settings":{"layout":"logo-start","menu":"main","showSearch":true,"showCart":true,"sticky":true,"tone":"surface"},"dataSource":null,"blocks":[]}],"footer":[{"type":"footer","visible":true,"settings":{"copyright":"© جميع الحقوق محفوظة","showPayments":true,"showNewsletter":true},"dataSource":null,"blocks":[{"type":"footer-text","visible":true,"settings":{"title":"عن المتجر","text":"نبذة قصيرة عن متجرنا."}},{"type":"footer-column","visible":true,"settings":{"title":"روابط","menu":"footer"}},{"type":"social","visible":true,"settings":{"network":"instagram","href":"https://"}}]}]},"pages":[{"type":"home","title":"الرئيسية","slug":"home","enabled":true,"system":true,"seo":{},"sections":[{"type":"hero","visible":true,"settings":{"image":"","eyebrow":"مجموعة جديدة","title":"اكتشف أفضل المنتجات","text":"تشكيلة مختارة بعناية بأسعار مناسبة وتوصيل سريع.","cta":"تسوّق الآن","href":"/collection/all","cta2":"","href2":"","height":"md","align":"start","overlay":35,"padY":"none","bg":"none","width":"full"},"dataSource":null,"blocks":[]},{"type":"featured-products","visible":true,"settings":{"title":"منتجات مميزة","collection":"","sort":"newest","limit":8,"columns":"4","cta":"عرض الكل","href":"/collection/all","padY":"md","bg":"none","width":"container"},"dataSource":"products.list","blocks":[]}]},{"type":"collection","title":"القسم","slug":"collection","enabled":true,"system":true,"seo":{},"sections":[{"type":"collection-main","visible":true,"settings":{"columns":"4","showFilters":true,"showBanner":true,"perPage":12},"dataSource":"collection.current","blocks":[]}]},{"type":"product","title":"المنتج","slug":"product","enabled":true,"system":true,"seo":{},"sections":[{"type":"product-main","visible":true,"settings":{"gallery":"thumbs","showSku":false,"showShare":true},"dataSource":"product.current","blocks":[]},{"type":"product-reviews","visible":true,"settings":{"title":"تقييمات العملاء","padY":"md","bg":"none","width":"container"},"dataSource":"reviews.current","blocks":[]},{"type":"related-products","visible":true,"settings":{"title":"قد يعجبك أيضاً","limit":4,"columns":"4","padY":"md","bg":"none","width":"container"},"dataSource":"products.related","blocks":[]}]},{"type":"cart","title":"السلة","slug":"cart","enabled":true,"system":true,"seo":{},"sections":[{"type":"cart-main","visible":true,"settings":{"emptyText":"سلتك فارغة","showNotes":true},"dataSource":null,"blocks":[]}]},{"type":"checkout","title":"إتمام الطلب","slug":"checkout","enabled":true,"system":true,"seo":{},"sections":[{"type":"checkout-main","visible":true,"settings":{"askEmail":false,"askNotes":true,"successText":"تم استلام طلبك، سنتواصل معك قريباً."},"dataSource":null,"blocks":[]}]},{"type":"search","title":"البحث","slug":"search","enabled":true,"system":true,"seo":{},"sections":[{"type":"search-main","visible":true,"settings":{"columns":"4"},"dataSource":null,"blocks":[]}]},{"type":"blog","title":"المدونة","slug":"blog","enabled":true,"system":true,"seo":{},"sections":[{"type":"blog-main","visible":true,"settings":{"columns":"3"},"dataSource":"blog.latest","blocks":[]}]},{"type":"article","title":"المقال","slug":"article","enabled":true,"system":true,"seo":{},"sections":[{"type":"article-main","visible":true,"settings":{},"dataSource":null,"blocks":[]}]},{"type":"account","title":"حسابي","slug":"account","enabled":true,"system":true,"seo":{},"sections":[{"type":"account-main","visible":true,"settings":{"text":"سجّل الدخول لمتابعة طلباتك."},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"تواصل معنا","slug":"contact","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"تواصل معنا","text":"راسلنا وسنرد عليك قريباً.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"سياسة الاسترجاع","slug":"returns","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"سياسة الاسترجاع","text":"يمكنك استرجاع المنتج خلال 7 أيام من الاستلام بشرط أن يكون بحالته الأصلية.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"الشروط والأحكام","slug":"terms","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"الشروط والأحكام","text":"باستخدامك المتجر فإنك توافق على الشروط والأحكام الموضحة هنا.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]}]}'::jsonb, false, 'published', 0)
on conflict (slug) do update set name = excluded.name, description = excluded.description, layout_json = excluded.layout_json, theme_defaults_json = excluded.theme_defaults_json, sort = excluded.sort;

insert into public.templates (slug, name, category, description, theme_defaults_json, layout_json, is_premium, status, sort) values
  ('elegance', 'أناقة', 'fashion', 'متجر أزياء بصور كبيرة وبطاقات هادئة.', '{"colors":{"bg":"#ffffff","surface":"#f4f4f4","text":"#111111","muted":"#6f6f6f","primary":"#111111","primaryText":"#ffffff","accent":"#c8a45c","border":"#e4e4e4","sale":"#d93025"},"fonts":{"heading":"Cairo","body":"Cairo"},"radius":4,"container":1200,"density":"airy","buttonStyle":"solid","buttonShape":"square"}'::jsonb, '{"theme":{"colors":{"bg":"#ffffff","surface":"#f4f4f4","text":"#111111","muted":"#6f6f6f","primary":"#111111","primaryText":"#ffffff","accent":"#c8a45c","border":"#e4e4e4","sale":"#d93025"},"fonts":{"heading":"Cairo","body":"Cairo"},"radius":4,"container":1200,"density":"airy","buttonStyle":"solid","buttonShape":"square"},"cardPresets":[{"kind":"product","name":"منتج — افتراضي","settings":{"ratio":"3/4","imageFit":"cover","hoverEffect":"swap","align":"center","showPrice":true,"showBadge":true,"showRating":false,"showAddToCart":true,"showBrand":false,"border":false,"shadow":"none","radius":2},"isDefault":true},{"kind":"product","name":"منتج — بسيط","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"none","align":"center","showPrice":true,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":false},{"kind":"product","name":"منتج — بطاقة","settings":{"ratio":"4/5","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":true,"showBadge":true,"showRating":true,"showAddToCart":true,"showBrand":false,"border":true,"shadow":"sm","radius":16},"isDefault":false},{"kind":"collection","name":"قسم — افتراضي","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"zoom","align":"center","showPrice":false,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true},{"kind":"blog","name":"مقال — افتراضي","settings":{"ratio":"16/9","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":false,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true}],"menus":[{"handle":"main","title":"القائمة الرئيسية","items":[{"label":"الرئيسية","linkType":"url","linkRef":"/","children":[]},{"label":"المتجر","linkType":"url","linkRef":"/collection/all","children":[]},{"label":"المدونة","linkType":"url","linkRef":"/blog","children":[]},{"label":"تواصل معنا","linkType":"page","linkRef":"contact","children":[]}]},{"handle":"footer","title":"قائمة التذييل","items":[{"label":"سياسة الاسترجاع","linkType":"page","linkRef":"returns","children":[]},{"label":"الشروط والأحكام","linkType":"page","linkRef":"terms","children":[]},{"label":"تواصل معنا","linkType":"page","linkRef":"contact","children":[]}]}],"layout":{"announcement":[{"type":"announcement-bar","visible":true,"settings":{"text":"توصيل مجاني للطلبات فوق 100$","href":"","tone":"dark","closable":true},"dataSource":null,"blocks":[]}],"header":[{"type":"header","visible":true,"settings":{"layout":"logo-center","menu":"main","showSearch":true,"showCart":true,"sticky":true,"tone":"surface"},"dataSource":null,"blocks":[]}],"footer":[{"type":"footer","visible":true,"settings":{"copyright":"© جميع الحقوق محفوظة","showPayments":true,"showNewsletter":true},"dataSource":null,"blocks":[{"type":"footer-text","visible":true,"settings":{"title":"عن المتجر","text":"نبذة قصيرة عن متجرنا."}},{"type":"footer-column","visible":true,"settings":{"title":"روابط","menu":"footer"}},{"type":"social","visible":true,"settings":{"network":"instagram","href":"https://"}}]}]},"pages":[{"type":"home","title":"الرئيسية","slug":"home","enabled":true,"system":true,"seo":{},"sections":[{"type":"slideshow","visible":true,"settings":{"autoplay":true,"interval":5,"height":"md","padY":"none","bg":"none","width":"full"},"dataSource":null,"blocks":[{"type":"slide","visible":true,"settings":{"image":"","title":"عرض جديد","text":"وصف الشريحة","cta":"اكتشف","href":"/collection/all"}},{"type":"slide","visible":true,"settings":{"image":"","title":"تخفيضات الموسم","text":"خصم حتى 40%","cta":"اكتشف","href":"/collection/all"}}]},{"type":"collection-list","visible":true,"settings":{"title":"تسوّق حسب القسم","limit":4,"columns":"4","padY":"md","bg":"none","width":"container"},"dataSource":"collections.all","blocks":[]},{"type":"featured-products","visible":true,"settings":{"title":"وصل حديثاً","collection":"","sort":"newest","limit":8,"columns":"4","cta":"عرض الكل","href":"/collection/all","padY":"md","bg":"none","width":"container"},"dataSource":"products.list","blocks":[]},{"type":"image-with-text","visible":true,"settings":{"image":"","title":"تفاصيل تصنع الفرق","text":"نختار الأقمشة والخياطة بعناية لنقدم قطعاً تدوم.","cta":"اكتشف المزيد","href":"/collection/all","side":"start","ratio":"4/5","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]},{"type":"testimonials","visible":true,"settings":{"title":"ماذا يقول عملاؤنا","columns":"3","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[{"type":"testimonial","visible":true,"settings":{"quote":"تجربة رائعة وخدمة سريعة.","name":"عميل","role":"","rating":5}},{"type":"testimonial","visible":true,"settings":{"quote":"جودة ممتازة وتغليف أنيق.","name":"سارة","role":"","rating":5}},{"type":"testimonial","visible":true,"settings":{"quote":"وصل الطلب بسرعة.","name":"خالد","role":"","rating":5}}]},{"type":"newsletter","visible":true,"settings":{"title":"اشترك بالنشرة","text":"ليصلك كل جديد وعروض حصرية.","button":"اشتراك","padY":"md","bg":"surface","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"collection","title":"القسم","slug":"collection","enabled":true,"system":true,"seo":{},"sections":[{"type":"collection-main","visible":true,"settings":{"columns":"4","showFilters":true,"showBanner":true,"perPage":12},"dataSource":"collection.current","blocks":[]}]},{"type":"product","title":"المنتج","slug":"product","enabled":true,"system":true,"seo":{},"sections":[{"type":"product-main","visible":true,"settings":{"gallery":"thumbs","showSku":false,"showShare":true},"dataSource":"product.current","blocks":[]},{"type":"product-reviews","visible":true,"settings":{"title":"تقييمات العملاء","padY":"md","bg":"none","width":"container"},"dataSource":"reviews.current","blocks":[]},{"type":"related-products","visible":true,"settings":{"title":"قد يعجبك أيضاً","limit":4,"columns":"4","padY":"md","bg":"none","width":"container"},"dataSource":"products.related","blocks":[]}]},{"type":"cart","title":"السلة","slug":"cart","enabled":true,"system":true,"seo":{},"sections":[{"type":"cart-main","visible":true,"settings":{"emptyText":"سلتك فارغة","showNotes":true},"dataSource":null,"blocks":[]}]},{"type":"checkout","title":"إتمام الطلب","slug":"checkout","enabled":true,"system":true,"seo":{},"sections":[{"type":"checkout-main","visible":true,"settings":{"askEmail":false,"askNotes":true,"successText":"تم استلام طلبك، سنتواصل معك قريباً."},"dataSource":null,"blocks":[]}]},{"type":"search","title":"البحث","slug":"search","enabled":true,"system":true,"seo":{},"sections":[{"type":"search-main","visible":true,"settings":{"columns":"4"},"dataSource":null,"blocks":[]}]},{"type":"blog","title":"المدونة","slug":"blog","enabled":true,"system":true,"seo":{},"sections":[{"type":"blog-main","visible":true,"settings":{"columns":"3"},"dataSource":"blog.latest","blocks":[]}]},{"type":"article","title":"المقال","slug":"article","enabled":true,"system":true,"seo":{},"sections":[{"type":"article-main","visible":true,"settings":{},"dataSource":null,"blocks":[]}]},{"type":"account","title":"حسابي","slug":"account","enabled":true,"system":true,"seo":{},"sections":[{"type":"account-main","visible":true,"settings":{"text":"سجّل الدخول لمتابعة طلباتك."},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"تواصل معنا","slug":"contact","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"تواصل معنا","text":"راسلنا على البريد أو واتساب وسنرد خلال 24 ساعة.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"سياسة الاسترجاع","slug":"returns","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"سياسة الاسترجاع","text":"يمكنك استرجاع المنتج خلال 7 أيام من الاستلام بشرط أن يكون بحالته الأصلية.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"الشروط والأحكام","slug":"terms","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"الشروط والأحكام","text":"باستخدامك المتجر فإنك توافق على الشروط والأحكام الموضحة هنا.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]}]}'::jsonb, false, 'published', 1)
on conflict (slug) do update set name = excluded.name, description = excluded.description, layout_json = excluded.layout_json, theme_defaults_json = excluded.theme_defaults_json, sort = excluded.sort;

insert into public.templates (slug, name, category, description, theme_defaults_json, layout_json, is_premium, status, sort) values
  ('techno', 'تقنو', 'electronics', 'داكن وحديث للإلكترونيات والأجهزة.', '{"colors":{"bg":"#0d0d14","surface":"#171722","text":"#f2f2f7","muted":"#9a9ab0","primary":"#7c5cff","primaryText":"#ffffff","accent":"#2dd4bf","border":"#26263a","sale":"#fb7185"},"fonts":{"heading":"Cairo","body":"Cairo"},"radius":14,"container":1200,"density":"normal","buttonStyle":"solid","buttonShape":"pill"}'::jsonb, '{"theme":{"colors":{"bg":"#0d0d14","surface":"#171722","text":"#f2f2f7","muted":"#9a9ab0","primary":"#7c5cff","primaryText":"#ffffff","accent":"#2dd4bf","border":"#26263a","sale":"#fb7185"},"fonts":{"heading":"Cairo","body":"Cairo"},"radius":14,"container":1200,"density":"normal","buttonStyle":"solid","buttonShape":"pill"},"cardPresets":[{"kind":"product","name":"منتج — افتراضي","settings":{"ratio":"1/1","imageFit":"contain","hoverEffect":"zoom","align":"start","showPrice":true,"showBadge":true,"showRating":true,"showAddToCart":true,"showBrand":false,"border":true,"shadow":"none","radius":12},"isDefault":true},{"kind":"product","name":"منتج — بسيط","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"none","align":"center","showPrice":true,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":false},{"kind":"product","name":"منتج — بطاقة","settings":{"ratio":"4/5","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":true,"showBadge":true,"showRating":true,"showAddToCart":true,"showBrand":false,"border":true,"shadow":"sm","radius":16},"isDefault":false},{"kind":"collection","name":"قسم — افتراضي","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"zoom","align":"center","showPrice":false,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true},{"kind":"blog","name":"مقال — افتراضي","settings":{"ratio":"16/9","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":false,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true}],"menus":[{"handle":"main","title":"القائمة الرئيسية","items":[{"label":"الرئيسية","linkType":"url","linkRef":"/","children":[]},{"label":"المتجر","linkType":"url","linkRef":"/collection/all","children":[]},{"label":"المدونة","linkType":"url","linkRef":"/blog","children":[]},{"label":"تواصل معنا","linkType":"page","linkRef":"contact","children":[]}]},{"handle":"footer","title":"قائمة التذييل","items":[{"label":"سياسة الاسترجاع","linkType":"page","linkRef":"returns","children":[]},{"label":"الشروط والأحكام","linkType":"page","linkRef":"terms","children":[]},{"label":"تواصل معنا","linkType":"page","linkRef":"contact","children":[]}]}],"layout":{"announcement":[{"type":"announcement-bar","visible":true,"settings":{"text":"عروض الأسبوع على الأجهزة الذكية","href":"","tone":"dark","closable":true},"dataSource":null,"blocks":[]}],"header":[{"type":"header","visible":true,"settings":{"layout":"logo-start","menu":"main","showSearch":true,"showCart":true,"sticky":true,"tone":"surface"},"dataSource":null,"blocks":[]}],"footer":[{"type":"footer","visible":true,"settings":{"copyright":"© جميع الحقوق محفوظة","showPayments":true,"showNewsletter":true},"dataSource":null,"blocks":[{"type":"footer-text","visible":true,"settings":{"title":"عن المتجر","text":"نبذة قصيرة عن متجرنا."}},{"type":"footer-column","visible":true,"settings":{"title":"روابط","menu":"footer"}},{"type":"social","visible":true,"settings":{"network":"instagram","href":"https://"}}]}]},"pages":[{"type":"home","title":"الرئيسية","slug":"home","enabled":true,"system":true,"seo":{},"sections":[{"type":"hero","visible":true,"settings":{"image":"","eyebrow":"جديد","title":"أحدث التقنيات بين يديك","text":"أجهزة أصلية بضمان معتمد وتوصيل سريع.","cta":"تسوّق الآن","href":"/collection/all","cta2":"","href2":"","height":"md","align":"start","overlay":35,"padY":"none","bg":"none","width":"full"},"dataSource":null,"blocks":[]},{"type":"features","visible":true,"settings":{"title":"","columns":"4","style":"card","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[{"type":"feature","visible":true,"settings":{"icon":"truck","title":"شحن سريع","text":"توصيل لكل المحافظات"}},{"type":"feature","visible":true,"settings":{"icon":"shield","title":"دفع آمن","text":"خيارات دفع متعددة"}},{"type":"feature","visible":true,"settings":{"icon":"refresh","title":"استرجاع سهل","text":"خلال 7 أيام"}},{"type":"feature","visible":true,"settings":{"icon":"headset","title":"دعم متواصل","text":"نرد على استفساراتك"}}]},{"type":"featured-products","visible":true,"settings":{"title":"الأكثر طلباً","collection":"","sort":"best","limit":8,"columns":"4","cta":"عرض الكل","href":"/collection/all","padY":"md","bg":"none","width":"container"},"dataSource":"products.list","blocks":[]},{"type":"countdown","visible":true,"settings":{"title":"ينتهي العرض خلال","endsAt":"","cta":"تسوّق","href":"/collection/all","padY":"md","bg":"dark","width":"container"},"dataSource":null,"blocks":[]},{"type":"product-carousel","visible":true,"settings":{"title":"وصل حديثاً","collection":"","sort":"newest","limit":10,"padY":"md","bg":"none","width":"container"},"dataSource":"products.list","blocks":[]},{"type":"faq","visible":true,"settings":{"title":"الأسئلة الشائعة","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[{"type":"faq-item","visible":true,"settings":{"q":"كم يستغرق التوصيل؟","a":"من يومين إلى 5 أيام عمل."}},{"type":"faq-item","visible":true,"settings":{"q":"هل يمكن الاسترجاع؟","a":"نعم خلال 7 أيام من الاستلام."}}]}]},{"type":"collection","title":"القسم","slug":"collection","enabled":true,"system":true,"seo":{},"sections":[{"type":"collection-main","visible":true,"settings":{"columns":"4","showFilters":true,"showBanner":true,"perPage":12},"dataSource":"collection.current","blocks":[]}]},{"type":"product","title":"المنتج","slug":"product","enabled":true,"system":true,"seo":{},"sections":[{"type":"product-main","visible":true,"settings":{"gallery":"thumbs","showSku":false,"showShare":true},"dataSource":"product.current","blocks":[]},{"type":"product-reviews","visible":true,"settings":{"title":"تقييمات العملاء","padY":"md","bg":"none","width":"container"},"dataSource":"reviews.current","blocks":[]},{"type":"related-products","visible":true,"settings":{"title":"قد يعجبك أيضاً","limit":4,"columns":"4","padY":"md","bg":"none","width":"container"},"dataSource":"products.related","blocks":[]}]},{"type":"cart","title":"السلة","slug":"cart","enabled":true,"system":true,"seo":{},"sections":[{"type":"cart-main","visible":true,"settings":{"emptyText":"سلتك فارغة","showNotes":true},"dataSource":null,"blocks":[]}]},{"type":"checkout","title":"إتمام الطلب","slug":"checkout","enabled":true,"system":true,"seo":{},"sections":[{"type":"checkout-main","visible":true,"settings":{"askEmail":false,"askNotes":true,"successText":"تم استلام طلبك، سنتواصل معك قريباً."},"dataSource":null,"blocks":[]}]},{"type":"search","title":"البحث","slug":"search","enabled":true,"system":true,"seo":{},"sections":[{"type":"search-main","visible":true,"settings":{"columns":"4"},"dataSource":null,"blocks":[]}]},{"type":"blog","title":"المدونة","slug":"blog","enabled":true,"system":true,"seo":{},"sections":[{"type":"blog-main","visible":true,"settings":{"columns":"3"},"dataSource":"blog.latest","blocks":[]}]},{"type":"article","title":"المقال","slug":"article","enabled":true,"system":true,"seo":{},"sections":[{"type":"article-main","visible":true,"settings":{},"dataSource":null,"blocks":[]}]},{"type":"account","title":"حسابي","slug":"account","enabled":true,"system":true,"seo":{},"sections":[{"type":"account-main","visible":true,"settings":{"text":"سجّل الدخول لمتابعة طلباتك."},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"تواصل معنا","slug":"contact","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"تواصل معنا","text":"فريق الدعم متاح يومياً.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"سياسة الاسترجاع","slug":"returns","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"سياسة الاسترجاع","text":"يمكنك استرجاع المنتج خلال 7 أيام من الاستلام بشرط أن يكون بحالته الأصلية.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"الشروط والأحكام","slug":"terms","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"الشروط والأحكام","text":"باستخدامك المتجر فإنك توافق على الشروط والأحكام الموضحة هنا.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]}]}'::jsonb, false, 'published', 2)
on conflict (slug) do update set name = excluded.name, description = excluded.description, layout_json = excluded.layout_json, theme_defaults_json = excluded.theme_defaults_json, sort = excluded.sort;

insert into public.templates (slug, name, category, description, theme_defaults_json, layout_json, is_premium, status, sort) values
  ('fresh', 'طازج', 'grocery', 'بقالة وأغذية: ألوان خضراء وبطاقات مدمجة.', '{"colors":{"bg":"#fcfdf9","surface":"#f0f6e8","text":"#17251a","muted":"#5f6f62","primary":"#1f9d55","primaryText":"#ffffff","accent":"#f59e0b","border":"#dfe9d5","sale":"#dc2626"},"fonts":{"heading":"Cairo","body":"Cairo"},"radius":16,"container":1200,"density":"compact","buttonStyle":"solid","buttonShape":"rounded"}'::jsonb, '{"theme":{"colors":{"bg":"#fcfdf9","surface":"#f0f6e8","text":"#17251a","muted":"#5f6f62","primary":"#1f9d55","primaryText":"#ffffff","accent":"#f59e0b","border":"#dfe9d5","sale":"#dc2626"},"fonts":{"heading":"Cairo","body":"Cairo"},"radius":16,"container":1200,"density":"compact","buttonStyle":"solid","buttonShape":"rounded"},"cardPresets":[{"kind":"product","name":"منتج — افتراضي","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":true,"showBadge":true,"showRating":false,"showAddToCart":true,"showBrand":false,"border":true,"shadow":"sm","radius":16},"isDefault":true},{"kind":"product","name":"منتج — بسيط","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"none","align":"center","showPrice":true,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":false},{"kind":"product","name":"منتج — بطاقة","settings":{"ratio":"4/5","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":true,"showBadge":true,"showRating":true,"showAddToCart":true,"showBrand":false,"border":true,"shadow":"sm","radius":16},"isDefault":false},{"kind":"collection","name":"قسم — افتراضي","settings":{"ratio":"1/1","imageFit":"cover","hoverEffect":"zoom","align":"center","showPrice":false,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true},{"kind":"blog","name":"مقال — افتراضي","settings":{"ratio":"16/9","imageFit":"cover","hoverEffect":"zoom","align":"start","showPrice":false,"showBadge":true,"showRating":false,"showAddToCart":false,"showBrand":false,"border":false,"shadow":"none","radius":12},"isDefault":true}],"menus":[{"handle":"main","title":"القائمة الرئيسية","items":[{"label":"الرئيسية","linkType":"url","linkRef":"/","children":[]},{"label":"المتجر","linkType":"url","linkRef":"/collection/all","children":[]},{"label":"المدونة","linkType":"url","linkRef":"/blog","children":[]},{"label":"تواصل معنا","linkType":"page","linkRef":"contact","children":[]}]},{"handle":"footer","title":"قائمة التذييل","items":[{"label":"سياسة الاسترجاع","linkType":"page","linkRef":"returns","children":[]},{"label":"الشروط والأحكام","linkType":"page","linkRef":"terms","children":[]},{"label":"تواصل معنا","linkType":"page","linkRef":"contact","children":[]}]}],"layout":{"announcement":[{"type":"announcement-bar","visible":true,"settings":{"text":"توصيل خلال ساعتين داخل المدينة","href":"","tone":"dark","closable":true},"dataSource":null,"blocks":[]}],"header":[{"type":"header","visible":true,"settings":{"layout":"logo-start","menu":"main","showSearch":true,"showCart":true,"sticky":true,"tone":"surface"},"dataSource":null,"blocks":[]}],"footer":[{"type":"footer","visible":true,"settings":{"copyright":"© جميع الحقوق محفوظة","showPayments":true,"showNewsletter":true},"dataSource":null,"blocks":[{"type":"footer-text","visible":true,"settings":{"title":"عن المتجر","text":"نبذة قصيرة عن متجرنا."}},{"type":"footer-column","visible":true,"settings":{"title":"روابط","menu":"footer"}},{"type":"social","visible":true,"settings":{"network":"instagram","href":"https://"}}]}]},"pages":[{"type":"home","title":"الرئيسية","slug":"home","enabled":true,"system":true,"seo":{},"sections":[{"type":"image-banner","visible":true,"settings":{"image":"","title":"منتجات طازجة كل يوم","text":"من المزرعة إلى باب بيتك","cta":"اطلب الآن","href":"/collection/all","overlay":30,"align":"center","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]},{"type":"collection-list","visible":true,"settings":{"title":"الأقسام","limit":4,"columns":"4","padY":"md","bg":"none","width":"container"},"dataSource":"collections.all","blocks":[]},{"type":"featured-products","visible":true,"settings":{"title":"عروض اليوم","collection":"","sort":"newest","limit":10,"columns":"5","cta":"عرض الكل","href":"/collection/all","padY":"md","bg":"none","width":"container"},"dataSource":"products.list","blocks":[]},{"type":"features","visible":true,"settings":{"title":"","columns":"4","style":"card","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[{"type":"feature","visible":true,"settings":{"icon":"truck","title":"شحن سريع","text":"توصيل لكل المحافظات"}},{"type":"feature","visible":true,"settings":{"icon":"shield","title":"دفع آمن","text":"خيارات دفع متعددة"}},{"type":"feature","visible":true,"settings":{"icon":"refresh","title":"استرجاع سهل","text":"خلال 7 أيام"}},{"type":"feature","visible":true,"settings":{"icon":"headset","title":"دعم متواصل","text":"نرد على استفساراتك"}}]},{"type":"cta-banner","visible":true,"settings":{"title":"وفّر أكثر مع الاشتراك الأسبوعي","text":"انضم إلى آلاف العملاء اليوم.","cta":"ابدأ الآن","href":"/collection/all","padY":"md","bg":"primary","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"collection","title":"القسم","slug":"collection","enabled":true,"system":true,"seo":{},"sections":[{"type":"collection-main","visible":true,"settings":{"columns":"4","showFilters":true,"showBanner":true,"perPage":12},"dataSource":"collection.current","blocks":[]}]},{"type":"product","title":"المنتج","slug":"product","enabled":true,"system":true,"seo":{},"sections":[{"type":"product-main","visible":true,"settings":{"gallery":"thumbs","showSku":false,"showShare":true},"dataSource":"product.current","blocks":[]},{"type":"product-reviews","visible":true,"settings":{"title":"تقييمات العملاء","padY":"md","bg":"none","width":"container"},"dataSource":"reviews.current","blocks":[]},{"type":"related-products","visible":true,"settings":{"title":"قد يعجبك أيضاً","limit":4,"columns":"4","padY":"md","bg":"none","width":"container"},"dataSource":"products.related","blocks":[]}]},{"type":"cart","title":"السلة","slug":"cart","enabled":true,"system":true,"seo":{},"sections":[{"type":"cart-main","visible":true,"settings":{"emptyText":"سلتك فارغة","showNotes":true},"dataSource":null,"blocks":[]}]},{"type":"checkout","title":"إتمام الطلب","slug":"checkout","enabled":true,"system":true,"seo":{},"sections":[{"type":"checkout-main","visible":true,"settings":{"askEmail":false,"askNotes":true,"successText":"تم استلام طلبك، سنتواصل معك قريباً."},"dataSource":null,"blocks":[]}]},{"type":"search","title":"البحث","slug":"search","enabled":true,"system":true,"seo":{},"sections":[{"type":"search-main","visible":true,"settings":{"columns":"4"},"dataSource":null,"blocks":[]}]},{"type":"blog","title":"المدونة","slug":"blog","enabled":true,"system":true,"seo":{},"sections":[{"type":"blog-main","visible":true,"settings":{"columns":"3"},"dataSource":"blog.latest","blocks":[]}]},{"type":"article","title":"المقال","slug":"article","enabled":true,"system":true,"seo":{},"sections":[{"type":"article-main","visible":true,"settings":{},"dataSource":null,"blocks":[]}]},{"type":"account","title":"حسابي","slug":"account","enabled":true,"system":true,"seo":{},"sections":[{"type":"account-main","visible":true,"settings":{"text":"سجّل الدخول لمتابعة طلباتك."},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"تواصل معنا","slug":"contact","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"تواصل معنا","text":"اتصل بنا لأي استفسار.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"سياسة الاسترجاع","slug":"returns","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"سياسة الاسترجاع","text":"يمكنك استرجاع المنتج خلال 7 أيام من الاستلام بشرط أن يكون بحالته الأصلية.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]},{"type":"custom","title":"الشروط والأحكام","slug":"terms","enabled":true,"system":false,"seo":{},"sections":[{"type":"rich-text","visible":true,"settings":{"title":"الشروط والأحكام","text":"باستخدامك المتجر فإنك توافق على الشروط والأحكام الموضحة هنا.","align":"start","maxw":"narrow","padY":"md","bg":"none","width":"container"},"dataSource":null,"blocks":[]}]}]}'::jsonb, false, 'published', 3)
on conflict (slug) do update set name = excluded.name, description = excluded.description, layout_json = excluded.layout_json, theme_defaults_json = excluded.theme_defaults_json, sort = excluded.sort;

commit;
