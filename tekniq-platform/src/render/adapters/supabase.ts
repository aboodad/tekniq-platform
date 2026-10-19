import type { Collection, DataAdapter, Post, Product, ProductQuery, Review } from '../../core/types';
import { rest, rpc } from '../../backend/http';

// Reads the commerce tables from 0002 (public RLS policies allow anon reads of published stores).
const img = (u?: string | null) => u || '';
function mapProduct(p: any): Product {
  const vs = (p.product_variants || []) as any[];
  const imgs = ((p.product_images || []) as any[]).sort((a, b) => a.position - b.position).map((i) => i.url);
  const def = vs.find((v) => v.is_default) || vs[0];
  const stock = vs.reduce((n, v) => n + (v.track_inventory ? v.stock_qty : 999), 0);
  const rv = (p.reviews || []) as any[]; const rc = rv.length;
  return {
    id: p.id, slug: p.slug, title: p.title, price: Number(def?.price ?? 0), compareAt: def?.compare_at_price ? Number(def.compare_at_price) : null,
    images: imgs, badge: stock <= 0 ? 'soldout' : p.badge, brand: p.brand, description: p.description, options: p.options_json || [],
    variants: vs.map((v) => ({ id: v.id, options: v.options_json || {}, price: Number(v.price), compareAt: v.compare_at_price ? Number(v.compare_at_price) : null, stock: v.track_inventory ? v.stock_qty : 999, sku: v.sku })),
    rating: rc ? rv.reduce((n, r) => n + r.rating, 0) / rc : undefined, reviewCount: rc, tags: p.tags_json || [],
  };
}
const SEL = '*,product_variants(*),product_images(url,position),reviews(rating)';

export function supabaseAdapter(storeId: string): DataAdapter {
  const base = `store_id=eq.${storeId}`;
  return {
    async products(q: ProductQuery) {
      let path = `products?${base}&status=eq.active&select=${encodeURIComponent(SEL)}`;
      if (q.collection && q.collection !== 'all') {
        const col = await rest<any[]>(`collections?${base}&slug=eq.${encodeURIComponent(q.collection)}&select=id`);
        if (!col[0]) return { items: [], total: 0 };
        path += `&id=in.(${(await rest<any[]>(`collection_products?collection_id=eq.${col[0].id}&select=product_id`)).map((r) => r.product_id).join(',') || '00000000-0000-0000-0000-000000000000'})`;
      }
      if (q.search) path += `&title=ilike.*${encodeURIComponent(q.search.replace(/[*,()]/g, ' '))}*`;
      if (q.badge) path += `&badge=eq.${encodeURIComponent(q.badge)}`;
      if (q.ids?.length) path += `&id=in.(${q.ids.join(',')})`;
      if (q.excludeId) path += `&id=neq.${q.excludeId}`;
      path += `&order=${q.sort === 'newest' || q.sort === 'best' ? 'created_at.desc' : 'created_at.asc'}`;
      const off = q.offset ?? 0; const lim = q.limit ?? 24;
      const { data, total } = await rest<any[]>(path, { count: true, range: [off, off + lim - 1] }) as any;
      let items = (data as any[]).map(mapProduct);
      if (q.sort === 'price_asc') items.sort((a, b) => a.price - b.price); else if (q.sort === 'price_desc') items.sort((a, b) => b.price - a.price);
      return { items, total: total ?? items.length };
    },
    async product(slug) {
      const r = await rest<any[]>(`products?${base}&slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=${encodeURIComponent(SEL)}`);
      return r[0] ? mapProduct(r[0]) : null;
    },
    async collections(): Promise<Collection[]> {
      const r = await rest<any[]>(`collections?${base}&is_published=eq.true&order=position.asc&select=*`);
      return r.map((c) => ({ id: c.id, slug: c.slug, title: c.title, image: img(c.image_url), description: c.description }));
    },
    async collection(slug) {
      if (slug === 'all') return { id: 'all', slug: 'all', title: 'كل المنتجات' };
      const r = await rest<any[]>(`collections?${base}&slug=eq.${encodeURIComponent(slug)}&select=*`);
      return r[0] ? { id: r[0].id, slug: r[0].slug, title: r[0].title, image: img(r[0].image_url), description: r[0].description } : null;
    },
    async posts(limit = 6): Promise<Post[]> {
      const r = await rest<any[]>(`blog_posts?${base}&status=eq.published&order=published_at.desc&limit=${limit}&select=*`);
      return r.map((p) => ({ id: p.id, slug: p.slug, title: p.title, excerpt: p.excerpt, cover: p.cover_url, author: p.author, date: p.published_at, content: p.content }));
    },
    async post(slug) { return (await this.posts(50)).find((p) => p.slug === slug) ?? null; },
    async reviews(productId): Promise<Review[]> {
      const r = await rest<any[]>(`reviews?${base}&product_id=eq.${productId}&status=eq.approved&order=created_at.desc&select=*`);
      return r.map((x) => ({ id: x.id, author: x.author_name || 'عميل', rating: x.rating, title: x.title, body: x.body, date: x.created_at }));
    },
    async shipping() {
      const r = await rest<any[]>(`shipping_methods?${base}&is_active=eq.true&select=*`);
      return r.map((s) => ({ id: s.id, name: s.name, price: Number(s.price), minOrder: s.min_order_amount ? Number(s.min_order_amount) : null, estDays: s.est_days, type: s.type }));
    },
    async validateDiscount(code, subtotal) { return rpc('validate_discount', { p_store: storeId, p_code: code, p_subtotal: subtotal }); },
    async placeOrder(o) {
      return rpc('place_order', { p_store: storeId, p_payload: { customer: o.customer, address: o.address, items: o.items.map((i) => ({ variantId: i.variantId, qty: i.qty })), shippingMethodId: o.shippingMethodId, discountCode: o.discountCode, paymentMethod: o.paymentMethod, notes: o.notes } });
    },
  };
}
