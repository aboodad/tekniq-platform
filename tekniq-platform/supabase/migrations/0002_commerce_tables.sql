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
