// Shared data model. A store's whole design is ONE JSON document ("Draft"); the published
// version is a frozen copy ("Snapshot") that storefronts render. Matches get_editor_state() in SQL.

export type PageType =
  | 'home' | 'collection' | 'product' | 'cart' | 'checkout' | 'search' | 'blog' | 'article' | 'account' | 'custom';

export interface Block { id: string; type: string; visible: boolean; settings: Record<string, any>; }
export interface Section {
  id: string; type: string; visible: boolean; settings: Record<string, any>;
  dataSource?: string | null; blocks: Block[];
}
export interface Seo { title?: string | null; description?: string | null; og?: string | null; }
export interface Page {
  id: string; type: PageType; title: string; slug: string; enabled: boolean; system: boolean;
  seo: Seo; sections: Section[];
}
export interface MenuItem { id?: string; label: string; linkType: 'page' | 'collection' | 'product' | 'url'; linkRef: string; newTab?: boolean; children: MenuItem[]; }
export interface Menu { handle: string; title: string; items: MenuItem[]; }

export type CardKind = 'product' | 'collection' | 'blog';
export interface CardPreset { id: string; kind: CardKind; name: string; settings: CardSettings; isDefault: boolean; }
export interface CardSettings {
  ratio: '1/1' | '4/5' | '3/4' | '16/9';   // image aspect ratio
  imageFit: 'cover' | 'contain';
  hoverEffect: 'none' | 'zoom' | 'swap';
  align: 'start' | 'center';
  showPrice: boolean; showBadge: boolean; showRating: boolean; showAddToCart: boolean; showBrand: boolean;
  border: boolean; shadow: 'none' | 'sm' | 'md'; radius: number;
}

export interface ThemeTokens {
  colors: { bg: string; surface: string; text: string; muted: string; primary: string; primaryText: string; accent: string; border: string; sale: string; };
  fonts: { heading: string; body: string };
  radius: number;                  // px, base corner radius
  container: number;               // px, max content width
  density: 'compact' | 'normal' | 'airy';
  buttonStyle: 'solid' | 'outline' | 'soft';
  buttonShape: 'square' | 'rounded' | 'pill';
}

export interface Layout { announcement: Section[]; header: Section[]; footer: Section[]; }
export interface Draft { theme: ThemeTokens; cardPresets: CardPreset[]; menus: Menu[]; layout: Layout; pages: Page[]; }

export interface StoreInfo {
  id: string; name: string; slug: string; locale: string; direction: 'rtl' | 'ltr'; currency: string; timezone?: string;
  dataMode: 'mock' | 'supabase' | 'http'; dataApiUrl?: string | null; logoUrl?: string | null; faviconUrl?: string | null; status?: string;
}
export interface Snapshot extends Draft { version: number; store: StoreInfo; }

// ---------- platform entities (dashboard / admin) ----------
export type UserRole = 'platform_admin' | 'support' | 'merchant';
export interface Profile { id: string; email: string; full_name?: string | null; phone?: string | null; role: UserRole; status: 'active' | 'suspended'; created_at?: string; last_login_at?: string | null; }
export type StoreStatus = 'draft' | 'ready_for_integration' | 'live' | 'suspended' | 'archived';
export interface StoreRow {
  id: string; owner_id: string; template_id?: string | null; name: string; slug: string; status: StoreStatus;
  default_locale: string; direction: 'rtl' | 'ltr'; currency: string; timezone: string; logo_url?: string | null; favicon_url?: string | null;
  data_mode: 'mock' | 'supabase' | 'http'; data_api_url?: string | null; draft_rev: number; published_version_id?: string | null;
  published_at?: string | null; created_at: string;
}
export interface Plan { id: string; code: string; name: string; description?: string | null; price_monthly: number; price_yearly: number; currency: string; limits_json: Record<string, number>; features_json: string[]; is_active: boolean; sort: number; }
export interface TemplateRow { id: string; slug: string; name: string; category: string; description?: string | null; thumbnail_url?: string | null; is_premium: boolean; price?: number | null; status: 'draft' | 'published' | 'archived'; sort: number; layout_json?: Draft; theme_defaults_json?: any; }
export interface DomainRow { id: string; store_id: string; hostname: string; type: 'subdomain' | 'custom'; is_primary: boolean; verification_status: 'pending' | 'verified' | 'failed'; ssl_status: 'pending' | 'active' | 'failed'; verification_token: string; dns_records_json: { type: string; name: string; value: string }[]; }
export interface MediaRow { id: string; store_id: string; type: 'image' | 'video'; url: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; width?: number | null; height?: number | null; created_at: string; }
export interface VersionRow { id: string; version_no: number; status: string; note?: string | null; author?: string | null; published_at?: string | null; is_current: boolean; }
export interface Member { userId: string; email: string; name?: string | null; role: 'owner' | 'editor' | 'viewer'; joinedAt: string; }
export interface Invite { id: string; email: string; role: 'editor' | 'viewer'; createdAt: string; }
export interface Subscription { id: string; store_id: string; plan_id: string; status: string; billing_cycle: 'monthly' | 'yearly'; trial_ends_at?: string | null; current_period_end?: string | null; }
export interface Invoice { id: string; store_id: string; number: string; amount: number; currency: string; status: 'unpaid' | 'paid' | 'void'; issued_at: string; paid_at?: string | null; payment_ref?: string | null; }
export interface Ticket { id: string; store_id: string; user_id: string; subject: string; body: string; status: 'open' | 'pending' | 'resolved' | 'closed'; priority: 'low' | 'normal' | 'high'; created_at: string; updated_at: string; }
export interface TicketMessage { id: string; ticket_id: string; user_id: string; body: string; is_staff: boolean; created_at: string; }
export interface ActivityRow { id: string; store_id?: string | null; user_id?: string | null; action: string; entity_type?: string | null; entity_id?: string | null; meta_json: any; created_at: string; }
export interface ComponentTypeRow { id: string; key: string; kind: 'section' | 'block'; name_ar: string; name_en?: string | null; category: string; status: 'active' | 'deprecated'; sort: number; }

// ---------- storefront data (what the Data Adapter returns) ----------
export interface Variant { id: string; options: Record<string, string>; price: number; compareAt?: number | null; stock: number; sku?: string | null; }
export interface Product {
  id: string; slug: string; title: string; price: number; compareAt?: number | null; images: string[]; badge?: 'new' | 'sale' | 'soldout' | null;
  brand?: string | null; description?: string | null; options: { name: string; values: string[] }[]; variants: Variant[]; rating?: number; reviewCount?: number; collections?: string[]; tags?: string[];
}
export interface Collection { id: string; slug: string; title: string; image?: string | null; description?: string | null; count?: number; }
export interface Post { id: string; slug: string; title: string; excerpt?: string | null; cover?: string | null; author?: string | null; date?: string | null; content?: string | null; }
export interface Review { id: string; author: string; rating: number; title?: string | null; body?: string | null; date?: string | null; }
export interface ShippingMethod { id: string; name: string; price: number; minOrder?: number | null; estDays?: string | null; type?: string; }
export interface ProductQuery { collection?: string; sort?: 'manual' | 'newest' | 'price_asc' | 'price_desc' | 'best'; limit?: number; offset?: number; search?: string; badge?: string; ids?: string[]; excludeId?: string; }
export interface OrderInput {
  customer: { name: string; phone: string; email?: string };
  address: { city?: string; district?: string; street?: string; notes?: string };
  items: { variantId: string; qty: number }[];
  shippingMethodId?: string; discountCode?: string; paymentMethod: 'cod' | 'bank_transfer'; notes?: string;
}
export interface OrderResult { orderNumber: string; total: number; currency: string; }
export interface DiscountResult { code: string; type: string; value: number; amount: number; freeShipping: boolean; }

export interface DataAdapter {
  products(q: ProductQuery): Promise<{ items: Product[]; total: number }>;
  product(slug: string): Promise<Product | null>;
  collections(): Promise<Collection[]>;
  collection(slug: string): Promise<Collection | null>;
  posts(limit?: number): Promise<Post[]>;
  post(slug: string): Promise<Post | null>;
  reviews(productId: string): Promise<Review[]>;
  shipping(): Promise<ShippingMethod[]>;
  validateDiscount(code: string, subtotal: number): Promise<DiscountResult>;
  placeOrder(o: OrderInput): Promise<OrderResult>;
}
